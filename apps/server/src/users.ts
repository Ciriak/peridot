import type {
  CreateUserRequest,
  UpdateUserRequest,
  UserResponse,
  UserRole,
} from "@peridot/contracts";
import type { Database } from "./database.js";
import {
  hashPassword,
  normalizeDisplayName,
  normalizeEmail,
  publicUser,
  validPassword,
} from "./auth.js";

export class UserManagementError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "UserManagementError";
  }

  toResponse() {
    return {
      error: {
        code: this.code,
        message: this.message,
      },
    };
  }
}

function userRole(value: unknown): UserRole | null {
  return value === "admin" || value === "member" ? value : null;
}

function invalidUser(message: string): never {
  throw new UserManagementError(message, 400, "invalid_user");
}

async function ensureUniqueIdentity(
  database: Pick<Database, "orm">,
  email: string,
  normalizedDisplayName: string,
  excludedId?: string,
) {
  const [emailOwner, displayNameOwner] = await Promise.all([
    database.orm.User.first({ email }),
    database.orm.User.first({ normalizedDisplayName }),
  ]);
  if (emailOwner && emailOwner.id !== excludedId) {
    throw new UserManagementError(
      "That email address is already in use.",
      409,
      "email_taken",
    );
  }
  if (displayNameOwner && displayNameOwner.id !== excludedId) {
    throw new UserManagementError(
      "That display name is already in use.",
      409,
      "display_name_taken",
    );
  }
}

export async function listManagedUsers(
  database: Database,
): Promise<UserResponse[]> {
  const users = await database.orm.User.orderBy((user) =>
    user.normalizedDisplayName.asc(),
  ).all();
  return users.map(publicUser);
}

export async function createManagedUser(
  database: Database,
  body: unknown,
): Promise<UserResponse> {
  const value = (body ?? {}) as Partial<CreateUserRequest>;
  const email = normalizeEmail(value.email);
  const displayName = normalizeDisplayName(value.displayName);
  const role = userRole(value.role);
  if (!email || !displayName || !role || !validPassword(value.password)) {
    return invalidUser(
      "Use a valid email, a 2–80 character display name, a member or administrator role, and a 12+ character password.",
    );
  }
  const passwordHash = await hashPassword(value.password);
  return database.transaction(async (transaction) => {
    await ensureUniqueIdentity(
      transaction,
      email,
      displayName.normalizedDisplayName,
    );
    const user = await transaction.orm.User.create({
      email,
      ...displayName,
      passwordHash,
      role,
    });
    return publicUser(user);
  });
}

export interface ManagedUserUpdate {
  user: UserResponse;
  revokedSessionIds: string[];
}

export async function updateManagedUser(
  database: Database,
  actor: UserResponse,
  userId: string,
  body: unknown,
): Promise<ManagedUserUpdate> {
  const value = (body ?? {}) as Partial<UpdateUserRequest>;
  if (
    value.email === undefined &&
    value.displayName === undefined &&
    value.password === undefined &&
    value.role === undefined
  ) {
    return invalidUser("Choose at least one account field to update.");
  }

  let email: string | undefined;
  if (value.email !== undefined) {
    const normalized = normalizeEmail(value.email);
    if (!normalized) return invalidUser("Enter a valid email address.");
    email = normalized;
  }
  let displayName:
    { displayName: string; normalizedDisplayName: string } | undefined;
  if (value.displayName !== undefined) {
    const normalized = normalizeDisplayName(value.displayName);
    if (!normalized) {
      return invalidUser("Use a display name between 2 and 80 characters.");
    }
    displayName = normalized;
  }
  let role: UserRole | undefined;
  if (value.role !== undefined) {
    const normalized = userRole(value.role);
    if (!normalized) {
      return invalidUser("Choose the member or administrator role.");
    }
    role = normalized;
  }
  if (value.password !== undefined && !validPassword(value.password)) {
    return invalidUser("Use a password between 12 and 256 characters.");
  }
  const passwordHash =
    value.password === undefined
      ? undefined
      : await hashPassword(value.password);

  return database.transaction(async (transaction) => {
    const target = await transaction.orm.User.first({ id: userId });
    if (!target) {
      throw new UserManagementError(
        "User account not found.",
        404,
        "user_not_found",
      );
    }
    if (target.id === actor.id && role !== undefined && role !== target.role) {
      throw new UserManagementError(
        "Your own administrator role cannot be changed here.",
        409,
        "own_role_immutable",
      );
    }

    const nextEmail = email ?? target.email;
    const nextDisplayName = displayName ?? {
      displayName: target.displayName,
      normalizedDisplayName: target.normalizedDisplayName,
    };
    await ensureUniqueIdentity(
      transaction,
      nextEmail,
      nextDisplayName.normalizedDisplayName,
      target.id,
    );

    if (target.role === "admin" && role === "member") {
      const admins = await transaction.orm.User.where({
        role: "admin",
      }).aggregate((aggregate) => ({ count: aggregate.count() }));
      if (admins.count <= 1) {
        throw new UserManagementError(
          "At least one administrator account is required.",
          409,
          "last_admin_required",
        );
      }
    }

    const identityChanged =
      nextEmail !== target.email ||
      (role !== undefined && role !== target.role) ||
      passwordHash !== undefined;
    const sessions =
      target.id !== actor.id && identityChanged
        ? await transaction.orm.Session.where({ userId: target.id })
            .select("id")
            .all()
        : [];

    await transaction.orm.User.where({ id: target.id }).update({
      ...(email !== undefined ? { email } : {}),
      ...(displayName ?? {}),
      ...(role !== undefined ? { role } : {}),
      ...(passwordHash !== undefined ? { passwordHash } : {}),
    });
    if (sessions.length) {
      await transaction.orm.Session.where({ userId: target.id }).delete();
    }

    const updated = await transaction.orm.User.where({
      id: target.id,
    }).firstOrThrow();
    return {
      user: publicUser(updated),
      revokedSessionIds: sessions.map((session) => session.id),
    };
  });
}

export async function deleteManagedUser(
  database: Database,
  actor: UserResponse,
  userId: string,
): Promise<string[]> {
  if (actor.id === userId) {
    throw new UserManagementError(
      "You cannot delete your own account.",
      409,
      "own_account_delete_forbidden",
    );
  }

  return database.transaction(async (transaction) => {
    const target = await transaction.orm.User.first({ id: userId });
    if (!target) {
      throw new UserManagementError(
        "User account not found.",
        404,
        "user_not_found",
      );
    }
    if (target.role === "admin") {
      const admins = await transaction.orm.User.where({
        role: "admin",
      }).aggregate((aggregate) => ({ count: aggregate.count() }));
      if (admins.count <= 1) {
        throw new UserManagementError(
          "At least one administrator account is required.",
          409,
          "last_admin_required",
        );
      }
    }
    const sessions = await transaction.orm.Session.where({
      userId: target.id,
    })
      .select("id")
      .all();
    await transaction.orm.User.where({ id: target.id }).delete();
    return sessions.map((session) => session.id);
  });
}
