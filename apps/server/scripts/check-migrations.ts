import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPrismaSuccess,
  parsePrismaResult,
  runPrismaCommand,
  serverRoot,
} from "./prisma-cli.js";

interface ContractArtifact {
  storage: {
    storageHash: string;
  };
}

interface MigrationRef {
  hash: string;
}

interface MigrationStatusResult {
  spaces: Array<{
    space: string;
    targetContract: string;
    migrations: Array<{ name: string; toContract: string }>;
  }>;
}

export async function checkMigrationGraph(): Promise<void> {
  const contract = JSON.parse(
    await readFile(
      path.join(serverRoot, "src", "prisma", "contract.json"),
      "utf8",
    ),
  ) as ContractArtifact;
  const databaseRef = JSON.parse(
    await readFile(
      path.join(serverRoot, "migrations", "app", "refs", "db.json"),
      "utf8",
    ),
  ) as MigrationRef;

  const contractHash = contract.storage.storageHash;
  if (databaseRef.hash !== contractHash) {
    throw new Error(
      `The db ref is ${databaseRef.hash}, but the emitted contract is ${contractHash}. ` +
        "Plan and apply a migration with `pnpm db:migration:plan` and `pnpm db:migrate:dev`.",
    );
  }

  const output = await runPrismaCommand(
    ["migration", "status", "--from", "@empty", "--to", "@contract", "--json"],
    true,
  );
  const result = assertPrismaSuccess(
    parsePrismaResult<MigrationStatusResult>(output),
    "prisma migration status",
  );
  const appSpace = result.spaces.find((space) => space.space === "app");
  if (!appSpace || appSpace.migrations.length === 0) {
    throw new Error("No application migrations reach the emitted contract");
  }
  if (appSpace.targetContract !== contractHash) {
    throw new Error(
      `The migration path ends at ${appSpace.targetContract}, not ${contractHash}`,
    );
  }

  console.log(
    `Migration graph is current at ${contractHash.slice(0, 12)} with ${appSpace.migrations.length} migration(s).`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  checkMigrationGraph().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
