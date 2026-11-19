import console from "node:console";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootPackagePath = path.join(root, "package.json");
const workspaceRoots = ["apps", "packages"];
const checkOnly = process.argv.includes("--check");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function workspacePackagePaths() {
  const paths = [];
  for (const workspaceRoot of workspaceRoots) {
    let entries;
    try {
      entries = await readdir(path.join(root, workspaceRoot), {
        withFileTypes: true,
      });
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const packagePath = path.join(
        root,
        workspaceRoot,
        entry.name,
        "package.json",
      );
      try {
        await readFile(packagePath);
        paths.push(packagePath);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
  return paths.sort();
}

function withVersion(packageJson, version) {
  const updated = {};
  for (const [key, value] of Object.entries(packageJson)) {
    if (key === "version") continue;
    updated[key] = value;
    if (key === "name") updated.version = version;
  }
  if (!("version" in updated)) updated.version = version;
  return updated;
}

const rootPackage = await readJson(rootPackagePath);
const version = rootPackage.version;
if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error("Root package.json must contain a stable semantic version.");
}

const mismatches = [];
for (const packagePath of await workspacePackagePaths()) {
  const relativePath = path.relative(root, packagePath).replaceAll("\\", "/");
  const packageJson = await readJson(packagePath);
  if (packageJson.version === version) continue;
  if (checkOnly) {
    mismatches.push(
      `${relativePath}: expected ${version}, found ${String(packageJson.version)}`,
    );
    continue;
  }
  await writeFile(
    packagePath,
    `${JSON.stringify(withVersion(packageJson, version), null, 2)}\n`,
  );
  console.log(`Updated ${relativePath} to ${version}.`);
}

async function syncTextVersion(filePath, current, expected, label) {
  if (current === expected) return;
  const relativePath = path.relative(root, filePath).replaceAll("\\", "/");
  if (checkOnly) {
    mismatches.push(
      `${relativePath}: expected ${label} ${expected}, found ${current}`,
    );
    return;
  }
  const content = await readFile(filePath, "utf8");
  const updated = content.replace(current, expected);
  if (updated === content) {
    throw new Error(`Could not update ${relativePath}.`);
  }
  await writeFile(filePath, updated);
  console.log(`Updated ${relativePath} to ${expected}.`);
}

const tauriConfigPath = path.join(
  root,
  "apps/desktop/src-tauri/tauri.conf.json",
);
const tauriConfig = await readJson(tauriConfigPath);
if (tauriConfig.version !== version) {
  if (checkOnly) {
    mismatches.push(
      `apps/desktop/src-tauri/tauri.conf.json: expected ${version}, found ${String(tauriConfig.version)}`,
    );
  } else {
    tauriConfig.version = version;
    await writeFile(
      tauriConfigPath,
      `${JSON.stringify(tauriConfig, null, 2)}\n`,
    );
    console.log(
      `Updated apps/desktop/src-tauri/tauri.conf.json to ${version}.`,
    );
  }
}

const cargoTomlPath = path.join(root, "apps/desktop/src-tauri/Cargo.toml");
const cargoToml = await readFile(cargoTomlPath, "utf8");
const cargoVersion = /^\[package\][\s\S]*?^version = "([^"]+)"/m.exec(
  cargoToml,
)?.[1];
if (!cargoVersion) throw new Error("Could not read the desktop Cargo version.");
await syncTextVersion(cargoTomlPath, cargoVersion, version, "version");

const androidGradlePath = path.join(
  root,
  "apps/android/android/app/build.gradle",
);
const androidGradle = await readFile(androidGradlePath, "utf8");
const androidVersionName = /versionName\s+"([^"]+)"/.exec(androidGradle)?.[1];
if (!androidVersionName) {
  throw new Error("Could not read the Android versionName.");
}
await syncTextVersion(
  androidGradlePath,
  androidVersionName,
  version,
  "versionName",
);
const androidGradleAfterName = checkOnly
  ? androidGradle
  : await readFile(androidGradlePath, "utf8");
const [major, minor, patch] = version.split(".").map(Number);
const versionCode = String(major * 1_000_000 + minor * 1_000 + patch);
const currentVersionCode = /versionCode\s+(\d+)/.exec(
  androidGradleAfterName,
)?.[1];
if (!currentVersionCode) throw new Error("Could not read Android versionCode.");
if (currentVersionCode !== versionCode) {
  if (checkOnly) {
    mismatches.push(
      `apps/android/android/app/build.gradle: expected versionCode ${versionCode}, found ${currentVersionCode}`,
    );
  } else {
    const updated = androidGradleAfterName.replace(
      /versionCode\s+\d+/,
      `versionCode ${versionCode}`,
    );
    await writeFile(androidGradlePath, updated);
    console.log(`Updated Android versionCode to ${versionCode}.`);
  }
}

if (mismatches.length) {
  console.error("Workspace package versions do not match the root package:");
  for (const mismatch of mismatches) console.error(`- ${mismatch}`);
  console.error("Run `pnpm version:sync` and commit the updated manifests.");
  process.exitCode = 1;
} else if (checkOnly) {
  console.log(`All workspace packages use Peridot ${version}.`);
}
