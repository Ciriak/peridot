import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type {
  AuthSessionResponse,
  AuthStatusResponse,
  PasswordResetRequest,
  PasswordResetRequestResponse,
  UserResponse,
} from "@peridot/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database } from "./database.js";
import { sendError } from "./http.js";
import { message } from "./messages.js";
import { ensureDefaultMetadataProvider } from "./metadata-providers.js";

const scrypt = promisify(scryptCallback);
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_DURATION_MS = 30 * 60 * 1000;
const PASSWORD_RESET_RATE_WINDOW_MS = 10 * 60 * 1000;
const PASSWORD_RESET_RATE_LIMIT = 10;
const PASSWORD_RESET_MAX_TRACKED_EMAILS = 5_000;
const BOOTSTRAP_KEY = "initial-admin";

declare module "fastify" {
  interface FastifyRequest {
    authenticatedSessionId: string | null;
    authenticatedUser: UserResponse | null;
  }
}

interface CredentialsBody {
  email?: unknown;
  displayName?: unknown;
  password?: unknown;
}

interface ProfileBody {
  displayName?: unknown;
}

interface CompletePasswordResetBody {
  token?: unknown;
  password?: unknown;
}

export function publicUser(user: {
  id: string;
  email: string;
  displayName: string;
  role: string;
}): UserResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role === "admin" ? "admin" : "member",
  };
}

export function normalizeDisplayName(
  value: unknown,
): { displayName: string; normalizedDisplayName: string } | null {
  if (typeof value !== "string") return null;
  const displayName = value.trim().replace(/\s+/gu, " ");
  const length = Array.from(displayName).length;
  if (length < 2 || length > 80) return null;
  return {
    displayName,
    normalizedDisplayName: displayName.toLowerCase(),
  };
}

export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 256;
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt.toString("base64url")}:${derived.toString("base64url")}`;
}

async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [algorithm, saltValue, hashValue] = stored.split(":");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64url");
  const candidate = (await scrypt(
    password,
    Buffer.from(saltValue, "base64url"),
    expected.length,
  )) as Buffer;
  return timingSafeEqual(candidate, expected);
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function createSession(
  database: Database,
  user: { id: string; email: string; displayName: string; role: string },
): Promise<AuthSessionResponse> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await database.orm.Session.create({
    tokenHash: tokenHash(token),
    expiresAt,
    userId: user.id,
  });
  return { token, expiresAt: expiresAt.toISOString(), user: publicUser(user) };
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  database: Database,
  onSessionsRevoked?: (sessionIds: string[]) => void,
) {
  const resetAttempts = new Map<string, number[]>();

  function passwordResetAllowed(email: string): boolean {
    const now = Date.now();
    if (
      !resetAttempts.has(email) &&
      resetAttempts.size >= PASSWORD_RESET_MAX_TRACKED_EMAILS
    ) {
      for (const [trackedEmail, attempts] of resetAttempts) {
        if (
          !attempts.some(
            (attempt) => now - attempt < PASSWORD_RESET_RATE_WINDOW_MS,
          )
        ) {
          resetAttempts.delete(trackedEmail);
        }
      }
      if (resetAttempts.size >= PASSWORD_RESET_MAX_TRACKED_EMAILS) {
        return false;
      }
    }
    const active = (resetAttempts.get(email) ?? []).filter(
      (attempt) => now - attempt < PASSWORD_RESET_RATE_WINDOW_MS,
    );
    if (active.length >= PASSWORD_RESET_RATE_LIMIT) {
      resetAttempts.set(email, active);
      return false;
    }
    active.push(now);
    resetAttempts.set(email, active);
    return true;
  }

  app.get("/api/auth/status", async (): Promise<AuthStatusResponse> => ({
    requiresAdminUser:
      (
        await database.orm.User.aggregate((aggregate) => ({
          count: aggregate.count(),
        }))
      ).count === 0,
  }));

  app.post<{ Body: CredentialsBody }>(
    "/api/auth/bootstrap",
    async (request, reply) => {
      const email = normalizeEmail(request.body?.email);
      const displayName = normalizeDisplayName(request.body?.displayName);
      const password = request.body?.password;
      if (!email || !displayName || !validPassword(password)) {
        return sendError(
          reply,
          400,
          "invalid_admin_user",
          "Use a valid email, a 2–80 character display name, and a 12+ character password",
          message("api.message.invalidAdminUser"),
        );
      }
      if (
        (
          await database.orm.User.aggregate((aggregate) => ({
            count: aggregate.count(),
          }))
        ).count > 0
      ) {
        return sendError(
          reply,
          409,
          "setup_complete",
          "The administrator account has already been created",
          message("api.message.setupComplete"),
        );
      }
      try {
        const user = await database.orm.User.create({
          email,
          ...displayName,
          passwordHash: await hashPassword(password),
          role: "admin",
          bootstrapKey: BOOTSTRAP_KEY,
        });
        await ensureDefaultMetadataProvider(database, email);
        return reply.code(201).send(await createSession(database, user));
      } catch (error) {
        if (
          (
            await database.orm.User.aggregate((aggregate) => ({
              count: aggregate.count(),
            }))
          ).count > 0
        ) {
          return sendError(
            reply,
            409,
            "setup_complete",
            "The administrator account has already been created",
            message("api.message.setupComplete"),
          );
        }
        throw error;
      }
    },
  );

  app.post<{ Body: CredentialsBody }>(
    "/api/auth/sessions",
    async (request, reply) => {
      const email = normalizeEmail(request.body?.email);
      const password = request.body?.password;
      if (!email || typeof password !== "string") {
        return sendError(
          reply,
          401,
          "invalid_credentials",
          "The email or password is incorrect",
          message("api.message.invalidCredentials"),
        );
      }
      const user = await database.orm.User.first({ email });
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        return sendError(
          reply,
          401,
          "invalid_credentials",
          "The email or password is incorrect",
          message("api.message.invalidCredentials"),
        );
      }
      return createSession(database, user);
    },
  );

  app.post<{ Body: PasswordResetRequest }>(
    "/api/auth/password-resets",
    async (request, reply): Promise<PasswordResetRequestResponse> => {
      const email = normalizeEmail(request.body?.email);
      if (email && passwordResetAllowed(email)) {
        const user = await database.orm.User.first({ email });
        if (user) {
          const token = randomBytes(32).toString("base64url");
          const expiresAt = new Date(Date.now() + PASSWORD_RESET_DURATION_MS);
          await database.transaction(async (transaction) => {
            await transaction.orm.PasswordResetToken.where({
              userId: user.id,
            }).deleteAndCount();
            await transaction.orm.PasswordResetToken.create({
              tokenHash: tokenHash(token),
              expiresAt,
              userId: user.id,
            });
          });
          request.log.warn(
            {
              event: "password_reset.requested",
              email,
              expiresAt: expiresAt.toISOString(),
            },
            `Password recovery token for ${email}: ${token}`,
          );
        }
      }
      return reply.code(202).send({ status: "requested" });
    },
  );

  app.post<{ Body: CompletePasswordResetBody }>(
    "/api/auth/password-resets/complete",
    async (request, reply) => {
      const token = request.body?.token;
      const password = request.body?.password;
      if (typeof token !== "string" || !token || token.length > 256) {
        return sendError(
          reply,
          400,
          "invalid_password_reset_token",
          "This recovery code is invalid or has expired",
          message("api.message.invalidPasswordResetToken"),
        );
      }
      if (!validPassword(password)) {
        return sendError(
          reply,
          400,
          "invalid_password",
          "Use a password between 12 and 256 characters",
          message("api.message.invalidPassword"),
        );
      }

      const tokenDigest = tokenHash(token);
      const pending = await database.orm.PasswordResetToken.where({
        tokenHash: tokenDigest,
      }).first();
      if (!pending || pending.expiresAt <= new Date()) {
        return sendError(
          reply,
          400,
          "invalid_password_reset_token",
          "This recovery code is invalid or has expired",
          message("api.message.invalidPasswordResetToken"),
        );
      }

      const passwordHash = await hashPassword(password);
      const revokedSessionIds = await database.transaction(
        async (transaction) => {
          const current = await transaction.orm.PasswordResetToken.where({
            tokenHash: tokenDigest,
          }).first();
          if (!current || current.expiresAt <= new Date()) return null;

          const sessions = await transaction.orm.Session.where({
            userId: current.userId,
          })
            .select("id")
            .all();
          await transaction.orm.User.where({ id: current.userId }).update({
            passwordHash,
          });
          await transaction.orm.PasswordResetToken.where({
            userId: current.userId,
          }).delete();
          await transaction.orm.Session.where({
            userId: current.userId,
          }).delete();
          return sessions.map((session) => session.id);
        },
      );
      if (revokedSessionIds === null) {
        return sendError(
          reply,
          400,
          "invalid_password_reset_token",
          "This recovery code is invalid or has expired",
          message("api.message.invalidPasswordResetToken"),
        );
      }
      onSessionsRevoked?.(revokedSessionIds);
      return reply.code(204).send();
    },
  );
}

export async function registerProtectedRoutes(
  app: FastifyInstance,
  database: Database,
  routes: (protectedApp: FastifyInstance) => Promise<void>,
  authorizeRequest?: (request: FastifyRequest) => boolean,
  onSessionRevoked?: (sessionId: string) => void,
) {
  app.decorateRequest("authenticatedSessionId", null);
  app.decorateRequest("authenticatedUser", null);
  await app.register(async (protectedApp) => {
    protectedApp.addHook("onRequest", async (request, reply) => {
      const authorization = request.headers.authorization;
      const prefix = "Bearer ";
      const token = authorization?.startsWith(prefix)
        ? authorization.slice(prefix.length)
        : "";
      const session = token
        ? await database.orm.Session.where({
            tokenHash: tokenHash(token),
          })
            .include("user")
            .first()
        : null;
      if (!session || session.expiresAt <= new Date()) {
        if (authorizeRequest?.(request)) return;
        if (
          (
            await database.orm.User.aggregate((aggregate) => ({
              count: aggregate.count(),
            }))
          ).count === 0
        ) {
          return sendError(
            reply,
            428,
            "setup_required",
            "Create the first administrator account before using Peridot",
            message("api.message.setupRequired"),
          );
        }
        if (session) {
          await database.orm.Session.where({ id: session.id }).deleteAndCount();
        }
        return sendError(
          reply,
          401,
          "unauthorized",
          "Valid user authentication is required",
          message("api.message.unauthorized"),
        );
      }
      request.authenticatedSessionId = session.id;
      request.authenticatedUser = publicUser(session.user);
    });

    protectedApp.get(
      "/api/users/me",
      async (request) => request.authenticatedUser,
    );
    protectedApp.put<{ Body: ProfileBody }>(
      "/api/users/me",
      async (request, reply) => {
        const displayName = normalizeDisplayName(request.body?.displayName);
        if (!displayName) {
          return sendError(
            reply,
            400,
            "invalid_display_name",
            "Use a display name between 2 and 80 characters",
            message("api.message.invalidDisplayName"),
          );
        }

        const userId = request.authenticatedUser!.id;
        const existing = await database.orm.User.first({
          normalizedDisplayName: displayName.normalizedDisplayName,
        });
        if (existing && existing.id !== userId) {
          return sendError(
            reply,
            409,
            "display_name_taken",
            "That display name is already in use",
            message("api.message.displayNameTaken"),
          );
        }

        try {
          await database.orm.User.where({ id: userId }).update(displayName);
        } catch (error) {
          const conflict = await database.orm.User.first({
            normalizedDisplayName: displayName.normalizedDisplayName,
          });
          if (conflict && conflict.id !== userId) {
            return sendError(
              reply,
              409,
              "display_name_taken",
              "That display name is already in use",
              message("api.message.displayNameTaken"),
            );
          }
          throw error;
        }

        const updated = await database.orm.User.where({
          id: userId,
        }).firstOrThrow();
        request.authenticatedUser = publicUser(updated);
        return request.authenticatedUser;
      },
    );
    protectedApp.delete("/api/auth/session", async (request, reply) => {
      await database.orm.Session.where({
        id: request.authenticatedSessionId!,
      }).delete();
      onSessionRevoked?.(request.authenticatedSessionId!);
      return reply.code(204).send();
    });
    await routes(protectedApp);
  });
}
