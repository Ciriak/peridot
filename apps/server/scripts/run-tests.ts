import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runPendingMigrations } from "./migrate-database.js";

const root = await mkdtemp(path.join(tmpdir(), "peridot-test-schema-"));
const templatePath = path.join(root, "template.db");
const databaseUrl = `file:${templatePath.replaceAll("\\", "/")}`;
try {
  await runPendingMigrations({
    databaseUrl,
    info: () => undefined,
  });

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
