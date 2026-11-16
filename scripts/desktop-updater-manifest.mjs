import console from "node:console";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function filesBelow(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesBelow(filePath)));
    } else {
      files.push(filePath);
    }
  }
  return files;
}

const inputDirectory = path.resolve(argument("input") || "artifacts");
const outputPath = path.resolve(argument("output") || "latest.json");
const releaseTag = argument("tag");
const version = process.env.PERIDOT_CLIENT_VERSION?.trim();
if (!releaseTag) throw new Error("--tag is required.");
if (!version) throw new Error("PERIDOT_CLIENT_VERSION is required.");

const files = await filesBelow(inputDirectory);
const signatures = files.filter((file) => file.endsWith(".sig"));
const selected = new Map();
for (const signature of signatures) {
  const normalized = signature.replaceAll("\\", "/");
  let target;
  if (
    normalized.includes("desktop-linux-x86_64") &&
    (normalized.endsWith(".AppImage.tar.gz.sig") ||
      normalized.endsWith(".AppImage.sig"))
  ) {
    target = "linux-x86_64";
  } else if (
    normalized.includes("desktop-windows-x86_64") &&
    (normalized.endsWith(".nsis.zip.sig") || normalized.endsWith(".exe.sig"))
  ) {
    target = "windows-x86_64";
  } else if (
    normalized.includes("desktop-darwin-universal") &&
    normalized.endsWith(".app.tar.gz.sig")
  ) {
    target = "darwin-universal";
  }
  if (target) selected.set(target, signature);
}
if (
  !selected.has("linux-x86_64") ||
  !selected.has("windows-x86_64") ||
  !selected.has("darwin-universal")
) {
  throw new Error("Desktop updater signatures are incomplete.");
}

async function platformEntry(signature) {
  const fileName = path.basename(signature).replace(/\.sig$/, "");
  return {
    signature: (await readFile(signature, "utf8")).trim(),
    url: `https://github.com/Ciriak/peridot/releases/download/${encodeURIComponent(releaseTag)}/${encodeURIComponent(fileName)}`,
  };
}

const mac = await platformEntry(selected.get("darwin-universal"));
const manifest = {
  version,
  pub_date: new Date().toISOString(),
  platforms: {
    "linux-x86_64": await platformEntry(selected.get("linux-x86_64")),
    "windows-x86_64": await platformEntry(selected.get("windows-x86_64")),
    "darwin-x86_64": mac,
    "darwin-aarch64": mac,
  },
};
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(outputPath);
