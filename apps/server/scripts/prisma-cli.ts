import { execFile, spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const prismaCli = path.join(
  path.dirname(require.resolve("prisma/package.json")),
  "dist",
  "prisma.js",
);

export interface PrismaResultEnvelope<T> {
  ok: boolean;
  result?: T;
  error?: {
    summary?: string;
    code?: string;
    nextActions?: string[];
  };
}

interface PrismaOutputEvent<T> {
  kind?: string;
  envelope?: PrismaResultEnvelope<T>;
}

export async function runPrismaCommand(
  args: string[],
  capture = false,
): Promise<string> {
  if (!capture) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [prismaCli, ...args], {
        cwd: serverRoot,
        env: process.env,
        stdio: "inherit",
      });
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (code === 0) {
          resolve("");
          return;
        }
        reject(
          new Error(
            `Prisma command failed with ${signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`}`,
          ),
        );
      });
    });
  }

  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [prismaCli, ...args],
      {
        cwd: serverRoot,
        env: process.env,
        maxBuffer: 16 * 1024 * 1024,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = [stderr.trim(), stdout.trim()]
            .filter(Boolean)
            .join("\n");
          reject(
            new Error(
              detail
                ? `Prisma command failed: ${detail}`
                : `Prisma command failed: ${error.message}`,
              { cause: error },
            ),
          );
          return;
        }
        resolve(stdout);
      },
    );
  });
}

export function parsePrismaResult<T>(output: string): PrismaResultEnvelope<T> {
  const lines = output.trim().split(/\r?\n/).filter(Boolean).reverse();

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as PrismaOutputEvent<T>;
      if (event.kind === "result" && event.envelope) {
        return event.envelope;
      }
    } catch {
      // Prisma can emit notices or step output alongside the JSON result.
    }
  }

  throw new Error("Prisma did not return a JSON result envelope");
}

export function assertPrismaSuccess<T>(
  envelope: PrismaResultEnvelope<T>,
  command: string,
): T {
  if (!envelope.ok || !envelope.result) {
    const details = [
      envelope.error?.summary,
      ...(envelope.error?.nextActions ?? []),
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(
      `${command} failed${envelope.error?.code ? ` (${envelope.error.code})` : ""}${details ? `:\n${details}` : ""}`,
    );
  }
  return envelope.result;
}
