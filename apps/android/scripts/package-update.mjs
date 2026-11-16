import { spawn } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const appRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(appRoot, "../..");
const rootPackage = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
);
const androidGradle = await readFile(
  path.join(appRoot, "android/app/build.gradle"),
  "utf8",
);
const channel = process.env.PERIDOT_CLIENT_CHANNEL?.trim() || "local";
if (!["dev", "master", "stable"].includes(channel)) {
  throw new Error("PERIDOT_CLIENT_CHANNEL must be dev, master, or stable.");
}
const version =
  process.env.PERIDOT_CLIENT_VERSION?.trim() || rootPackage.version;
const privateKey = process.env.CAPGO_UPDATE_PRIVATE_KEY_PATH?.trim();
if (!privateKey) {
  throw new Error("CAPGO_UPDATE_PRIVATE_KEY_PATH is required.");
}
const outputDirectory =
  process.env.PERIDOT_ANDROID_UPDATE_OUTPUT?.trim() ||
  path.join(appRoot, "dist-update");
const webDirectory = path.join(repositoryRoot, "apps/web/.output/public");
const releaseBase =
  channel === "stable"
    ? "https://github.com/Ciriak/peridot/releases/latest/download"
    : `https://github.com/Ciriak/peridot/releases/download/client-${channel}`;

await mkdir(outputDirectory, { recursive: true });
const child = spawn(
  process.execPath,
  [
    path.join(appRoot, "node_modules/@capgo/cli/dist/index.js"),
    "bundle",
    "zip",
    "app.peridot.android",
    "--path",
    webDirectory,
    "--name",
    "android-web.zip",
    "--for-upload",
    "--key-v2",
    privateKey,
    "--json",
  ],
  {
    cwd: appRoot,
    env: { ...process.env, PERIDOT_CLIENT_VERSION: version },
    stdio: ["ignore", "pipe", "inherit"],
  },
);
let output = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  output += chunk;
});
const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", resolve);
});
if (exitCode !== 0) {
  throw new Error(`Capgo bundle packaging failed with exit code ${exitCode}.`);
}
const result = JSON.parse(output);
if (
  typeof result.filename !== "string" ||
  typeof result.checksum !== "string" ||
  typeof result.session_key !== "string"
) {
  throw new Error("Capgo bundle packaging returned invalid metadata.");
}
const generatedPath = path.join(appRoot, result.filename);
const bundlePath = path.join(outputDirectory, "android-web.zip");
await rm(bundlePath, { force: true });
await rename(generatedPath, bundlePath);
const nativeVersion =
  process.env.PERIDOT_MINIMUM_NATIVE_VERSION?.trim() ||
  /versionName\s+"([^"]+)"/.exec(androidGradle)?.[1] ||
  version;
const manifest = {
  version,
  url: `${releaseBase}/android-web.zip`,
  checksum: result.checksum,
  sessionKey: result.session_key,
  minimumNativeVersion: nativeVersion,
};
await writeFile(
  path.join(outputDirectory, "android-web-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      version,
      channel,
      bundlePath,
      manifestPath: path.join(outputDirectory, "android-web-manifest.json"),
    },
    null,
    2,
  ),
);
