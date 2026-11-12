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
  UserResponse,
} from "@peridot/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database } from "./database.js";
import { sendError } from "./http.js";
import { ensureDefaultMetadataProvider } from "./metadata-providers.js";

const scrypt = promisify(scryptCallback);
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
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
) {
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
        );
      }
      const user = await database.orm.User.first({ email });
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        return sendError(
          reply,
          401,
          "invalid_credentials",
          "The email or password is incorrect",
        );
      }
      return createSession(database, user);
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
