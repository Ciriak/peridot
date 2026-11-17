import console from "node:console";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const channel = process.env.PERIDOT_CLIENT_CHANNEL?.trim();
const version = process.env.PERIDOT_CLIENT_VERSION?.trim();
if (!channel || !["dev", "beta", "stable"].includes(channel)) {
  throw new Error("PERIDOT_CLIENT_CHANNEL must be dev, beta, or stable.");
}
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error("PERIDOT_CLIENT_VERSION must be a valid SemVer version.");
}
const endpoint =
  channel === "stable"
    ? "https://github.com/Ciriak/peridot/releases/latest/download/latest.json"
    : `https://github.com/Ciriak/peridot/releases/download/client-${channel}/latest.json`;
const outputPath = path.resolve(
  process.env.PERIDOT_DESKTOP_CONFIG_PATH ||
    path.join(".peridot", `desktop-${channel}.json`),
);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      version,
      plugins: {
        updater: {
          endpoints: [endpoint],
        },
      },
    },
    null,
    2,
  )}\n`,
);
console.log(outputPath);
