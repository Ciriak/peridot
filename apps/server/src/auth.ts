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
import type { FastifyInstance } from "fastify";
import type { Database } from "./database.js";
import { sendError } from "./http.js";

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
  identifier?: unknown;
  username?: unknown;
  password?: unknown;
}

function publicUser(user: {
  id: string;
  email: string;
  username: string;
  role: string;
}): UserResponse {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role === "admin" ? "admin" : "member",
  };
}

function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) ? username : null;
}

function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 256;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : null;
}

async function hashPassword(password: string): Promise<string> {
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
  user: { id: string; email: string; username: string; role: string },
): Promise<AuthSessionResponse> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await database.session.create({
    data: { tokenHash: tokenHash(token), expiresAt, userId: user.id },
  });
  return { token, expiresAt: expiresAt.toISOString(), user: publicUser(user) };
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  database: Database,
) {
  app.get("/api/auth/status", async (): Promise<AuthStatusResponse> => ({
    requiresAdminUser: (await database.user.count()) === 0,
  }));

  app.post<{ Body: CredentialsBody }>(
    "/api/auth/bootstrap",
    async (request, reply) => {
      const email = normalizeEmail(request.body?.email);
      const username = normalizeUsername(request.body?.username);
      const password = request.body?.password;
      if (!email || !username || !validPassword(password)) {
        return sendError(
          reply,
          400,
          "invalid_admin_user",
          "Use a valid email, a 3–32 character username, and a 12+ character password",
        );
      }
      if ((await database.user.count()) > 0) {
        return sendError(
          reply,
          409,
          "setup_complete",
          "The administrator account has already been created",
        );
      }
      try {
        const user = await database.user.create({
          data: {
            email,
            username,
            passwordHash: await hashPassword(password),
            role: "admin",
            bootstrapKey: BOOTSTRAP_KEY,
          },
        });
        return reply.code(201).send(await createSession(database, user));
      } catch (error) {
        if ((await database.user.count()) > 0) {
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
      const identifier = request.body?.identifier;
      const password = request.body?.password;
      if (typeof identifier !== "string" || typeof password !== "string") {
        return sendError(
          reply,
          401,
          "invalid_credentials",
          "The username/email or password is incorrect",
        );
      }
      const value = identifier.trim();
      const username = value.includes("@") ? null : normalizeUsername(value);
      const email = value.includes("@") ? normalizeEmail(value) : null;
      if (!username && !email) {
        return sendError(
          reply,
          401,
          "invalid_credentials",
          "The username/email or password is incorrect",
        );
      }
      const user = username
        ? await database.user.findUnique({ where: { username } })
        : await database.user.findUnique({ where: { email: email! } });
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        return sendError(
          reply,
          401,
          "invalid_credentials",
          "The username/email or password is incorrect",
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
        ? await database.session.findUnique({
            where: { tokenHash: tokenHash(token) },
            include: { user: true },
          })
        : null;
      if (!session || session.expiresAt <= new Date()) {
        if ((await database.user.count()) === 0) {
          return sendError(
            reply,
            428,
            "setup_required",
            "Create the first administrator account before using Peridot",
          );
        }
        if (session) {
          await database.session.deleteMany({ where: { id: session.id } });
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
    protectedApp.delete("/api/auth/session", async (request, reply) => {
      await database.session.delete({
        where: { id: request.authenticatedSessionId! },
      });
      return reply.code(204).send();
    });
    await routes(protectedApp);
  });
}
