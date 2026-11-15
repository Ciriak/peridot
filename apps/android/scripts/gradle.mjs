import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const androidRoot = path.resolve(import.meta.dirname, "../android");
const windows = process.platform === "win32";
const executable = windows ? (process.env.ComSpec ?? "cmd.exe") : "./gradlew";
const argumentsList = windows
  ? ["/d", "/s", "/c", `gradlew.bat ${process.argv.slice(2).join(" ")}`]
  : process.argv.slice(2);
const localAndroidHome =
  process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
const child = spawn(executable, argumentsList, {
  cwd: androidRoot,
  env: {
    ...process.env,
    ...(windows && !process.env.ANDROID_HOME
      ? { ANDROID_HOME: path.join(localAndroidHome, "Android", "Sdk") }
      : {}),
  },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
