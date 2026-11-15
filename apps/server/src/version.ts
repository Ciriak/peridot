import { readFileSync } from "node:fs";

const rootPackage = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
) as { version?: unknown };

if (
  typeof rootPackage.version !== "string" ||
  !/^\d+\.\d+\.\d+$/.test(rootPackage.version)
) {
  throw new Error("Root package.json must contain a stable semantic version.");
}

export const PERIDOT_VERSION = rootPackage.version;
