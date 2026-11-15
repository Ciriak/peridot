import { execFile, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

const root = await mkdtemp(path.join(tmpdir(), "peridot-test-schema-"));
const templatePath = path.join(root, "template.db");
const databaseUrl = `file:${templatePath.replaceAll("\\", "/")}`;
const prismaCli = path.join(
  path.dirname(require.resolve("prisma/package.json")),
  "dist",
  "prisma.js",
);

try {
  await execFileAsync(
    process.execPath,
    [prismaCli, "db", "update", "--db", databaseUrl, "--no-interactive"],
    {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  const testDirectory = path.resolve(process.cwd(), "test");
  const testFiles = (await readdir(testDirectory))
    .filter((entry) => entry.endsWith(".test.ts"))
    .sort()
    .map((entry) => path.join(testDirectory, entry));

  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--test", ...testFiles],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PERIDOT_TEST_DB_TEMPLATE: templatePath,
      },
      stdio: "inherit",
    },
  );
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (exitCode !== 0) process.exitCode = exitCode ?? 1;
} finally {
  await rm(root, { recursive: true, force: true });
}
