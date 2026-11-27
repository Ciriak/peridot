import { execFile, spawn } from "node:child_process";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const platform = process.platform;
const windows = platform === "win32";
const executableSuffix = windows ? ".exe" : "";
const args = process.argv.slice(2);

function printHelp() {
  console.log(`Usage: pnpm android:auto [options]

Launches a Peridot Android emulator and the Android Auto Desktop Head Unit.

Options:
  --avd <name>       Force an AVD to launch or reuse. Defaults to PERIDOT_AVD.
  --serial <serial>  Reuse a specific ADB device instead of choosing an AVD.
  --port <port>      DHU and ADB-forward port. Defaults to PERIDOT_DHU_PORT or 5277.
  -h, --help         Show this help.

Environment:
  ANDROID_HOME or ANDROID_SDK_ROOT
  PERIDOT_AVD
  PERIDOT_DHU_PORT
  PERIDOT_AVD_BOOT_TIMEOUT_MS`);
}

function parseArguments(values) {
  const result = {
    avd: process.env.PERIDOT_AVD?.trim() || null,
    serial: process.env.ANDROID_SERIAL?.trim() || null,
    port: Number(process.env.PERIDOT_DHU_PORT || 5277),
    help: false,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "-h" || value === "--help") {
      result.help = true;
      continue;
    }
    const [name, inlineValue] = value.split("=", 2);
    const nextValue = inlineValue ?? values[index + 1];
    if (!["--avd", "--serial", "--port"].includes(name)) {
      throw new Error(`Unknown argument: ${value}`);
    }
    if (!nextValue || nextValue.startsWith("--")) {
      throw new Error(`${name} requires a value.`);
    }
    if (inlineValue === undefined) index += 1;
    if (name === "--avd") result.avd = nextValue.trim();
    if (name === "--serial") result.serial = nextValue.trim();
    if (name === "--port") result.port = Number(nextValue);
  }
  if (
    !Number.isInteger(result.port) ||
    result.port < 1 ||
    result.port > 65535
  ) {
    throw new Error("The DHU port must be an integer between 1 and 65535.");
  }
  return result;
}

function sdkRoot() {
  const configured = (
    process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  )?.trim();
  if (configured) return path.resolve(configured);
  if (windows) {
    return path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
      "Android",
      "Sdk",
    );
  }
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Android", "sdk");
  }
  return path.join(os.homedir(), "Android", "Sdk");
}

async function ensureExecutable(filePath, description) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`${description} was not found at ${filePath}.`);
  }
}

async function run(filePath, argumentsList, options = {}) {
  try {
    return await execFileAsync(filePath, argumentsList, {
      encoding: "utf8",
      windowsHide: true,
      timeout: options.timeout ?? 15_000,
    });
  } catch (error) {
    if (options.allowFailure) return null;
    throw error;
  }
}

async function listAvailableAvds(emulator) {
  const result = await run(emulator, ["-list-avds"]);
  return result.stdout
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean);
}

async function listDevices(adb) {
  const result = await run(adb, ["devices"]);
  return result.stdout
    .split(/\r?\n/u)
    .slice(1)
    .map((line) => line.trim().split(/\s+/u))
    .filter((parts) => parts.length >= 2 && parts[1] === "device")
    .map((parts) => parts[0]);
}

async function avdNameForSerial(adb, serial) {
  if (!serial.startsWith("emulator-")) return null;
  const result = await run(adb, ["-s", serial, "emu", "avd", "name"], {
    allowFailure: true,
  });
  return (
    result?.stdout
      .split(/\r?\n/u)
      .map((value) => value.trim())
      .find((value) => value && value !== "OK") || null
  );
}

async function waitForBoot(adb, serial, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await run(
      adb,
      ["-s", serial, "shell", "getprop", "sys.boot_completed"],
      { allowFailure: true, timeout: 5_000 },
    );
    if (result?.stdout.trim() === "1") return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Android device ${serial} did not finish booting in time.`);
}

async function waitForNewEmulator(adb, existingSerials, timeoutMs) {
  const existing = new Set(existingSerials);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const serial = (await listDevices(adb)).find(
      (device) => device.startsWith("emulator-") && !existing.has(device),
    );
    if (serial) return serial;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("The emulator did not appear in ADB in time.");
}

async function dhuIsRunning() {
  if (windows) {
    const result = await run(
      "tasklist",
      ["/FI", "IMAGENAME eq desktop-head-unit.exe", "/NH"],
      { allowFailure: true },
    );
    return Boolean(
      result?.stdout.toLowerCase().includes("desktop-head-unit.exe"),
    );
  }
  const result = await run("ps", ["-A", "-o", "comm="], {
    allowFailure: true,
  });
  return Boolean(result?.stdout.includes("desktop-head-unit"));
}

async function androidAutoVersion(adb, serial) {
  const result = await run(
    adb,
    [
      "-s",
      serial,
      "shell",
      "dumpsys",
      "package",
      "com.google.android.projection.gearhead",
    ],
    { allowFailure: true },
  );
  return /versionName=([^\s]+)/u.exec(result?.stdout ?? "")?.[1] ?? null;
}

async function hardwareSerial(adb, serial) {
  const result = await run(
    adb,
    ["-s", serial, "shell", "getprop", "ro.serialno"],
    { allowFailure: true, timeout: 5_000 },
  );
  return result?.stdout.trim() || serial;
}

async function fullAndroidAutoDevices(adb, devices) {
  const matches = [];
  const seenHardwareSerials = new Set();
  for (const device of devices) {
    const identity = await hardwareSerial(adb, device);
    if (seenHardwareSerials.has(identity)) continue;
    seenHardwareSerials.add(identity);
    const version = await androidAutoVersion(adb, device);
    if (version && !version.includes("-stub")) {
      matches.push({ serial: device, version });
    }
  }
  return matches;
}

function spawnDetached(filePath, argumentsList, options = {}) {
  const child = spawn(filePath, argumentsList, {
    cwd: options.cwd,
    detached: true,
    stdio: "ignore",
    windowsHide: options.windowsHide ?? false,
  });
  return child;
}

async function launchDhu(dhu, port) {
  if (windows) {
    const quote = (value) => value.replaceAll("'", "''");
    const command =
      `$process = Start-Process -FilePath '${quote(dhu)}' ` +
      `-ArgumentList @('--adb=localhost:${port}') ` +
      `-WorkingDirectory '${quote(path.dirname(dhu))}' -PassThru; ` +
      "Start-Sleep -Milliseconds 750; " +
      "if ($process.HasExited) { exit $process.ExitCode }";
    const result = await run(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      { allowFailure: true, timeout: 10_000 },
    );
    if (!result) {
      return { stillRunning: false, code: null, signal: null };
    }
    return {
      stillRunning: await dhuIsRunning(),
      code: null,
      signal: null,
    };
  }

  const child = spawn(dhu, [`--adb=localhost:${port}`], {
    cwd: path.dirname(dhu),
    stdio: "inherit",
  });
  return new Promise((resolve) => {
    child.once("exit", (code, signal) =>
      resolve({ code, signal, stillRunning: false }),
    );
    child.once("error", (error) =>
      resolve({ code: null, signal: null, stillRunning: false, error }),
    );
  });
}

async function main() {
  const options = parseArguments(args);
  if (options.help) {
    printHelp();
    return;
  }

  const sdk = sdkRoot();
  const adb = path.join(sdk, "platform-tools", `adb${executableSuffix}`);
  const emulator = path.join(sdk, "emulator", `emulator${executableSuffix}`);
  const dhu = path.join(
    sdk,
    "extras",
    "google",
    "auto",
    `desktop-head-unit${executableSuffix}`,
  );
  await ensureExecutable(adb, "Android Debug Bridge");
  await ensureExecutable(emulator, "Android emulator");
  await ensureExecutable(dhu, "Android Auto Desktop Head Unit");

  const timeoutMs =
    Number(process.env.PERIDOT_AVD_BOOT_TIMEOUT_MS || 180_000) || 180_000;
  let serial = options.serial;
  if (serial) {
    const devices = await listDevices(adb);
    if (!devices.includes(serial)) {
      throw new Error(`ADB device ${serial} is not connected.`);
    }
  } else {
    let devices = await listDevices(adb);
    let runningEmulators = devices.filter((device) =>
      device.startsWith("emulator-"),
    );
    if (!options.avd) {
      const fullDevices = await fullAndroidAutoDevices(adb, devices);
      const runningFullEmulator = fullDevices.find((device) =>
        device.serial.startsWith("emulator-"),
      );
      if (runningFullEmulator) {
        serial = runningFullEmulator.serial;
        console.log(
          `Using Android emulator ${serial} with Android Auto ${runningFullEmulator.version}`,
        );
      } else if (fullDevices.length === 1) {
        serial = fullDevices[0].serial;
        console.log(
          `Using connected Android Auto device ${serial} (${fullDevices[0].version})`,
        );
      } else if (fullDevices.length > 1) {
        throw new Error(
          `Multiple devices have full Android Auto. Pass --serial with one of: ${fullDevices.map((device) => device.serial).join(", ")}`,
        );
      }
    }
    if (!serial && options.avd) {
      for (const candidate of runningEmulators) {
        if ((await avdNameForSerial(adb, candidate)) === options.avd) {
          serial = candidate;
          break;
        }
      }
    } else if (!serial && runningEmulators.length === 1) {
      serial = runningEmulators[0];
    } else if (!serial && runningEmulators.length > 1) {
      throw new Error(
        `Multiple Android emulators are running. Pass --serial with one of: ${runningEmulators.join(", ")}`,
      );
    }

    if (!serial) {
      const availableAvds = await listAvailableAvds(emulator);
      const avd =
        options.avd || (availableAvds.length === 1 ? availableAvds[0] : null);
      if (!avd) {
        throw new Error(
          `Choose an AVD with --avd. Available AVDs: ${availableAvds.join(", ") || "none"}`,
        );
      }
      if (!availableAvds.includes(avd)) {
        throw new Error(`AVD "${avd}" was not found.`);
      }
      console.log(`Starting Android emulator: ${avd}`);
      spawnDetached(emulator, [
        "-avd",
        avd,
        "-no-audio",
        "-no-boot-anim",
      ]).unref();
      serial = await waitForNewEmulator(adb, devices, timeoutMs);
    }
  }

  await waitForBoot(adb, serial, timeoutMs);
  await run(adb, [
    "-s",
    serial,
    "forward",
    `tcp:${options.port}`,
    `tcp:${options.port}`,
  ]);

  const autoVersion = await androidAutoVersion(adb, serial);
  if (autoVersion?.includes("-stub")) {
    console.warn(
      `Android Auto ${autoVersion} on ${serial} is a stub. Projection requires a full Android Auto installation with Start head unit server enabled.`,
    );
  }
  if (await dhuIsRunning()) {
    console.log("Android Auto Desktop Head Unit is already running.");
  } else {
    console.log(`Starting Desktop Head Unit on ADB port ${options.port}`);
    const result = await launchDhu(dhu, options.port);
    if (!result.stillRunning) {
      const reason = result.error?.message
        ? `: ${result.error.message}`
        : result.code === null
          ? ""
          : ` with code ${result.code}${result.signal ? ` (${result.signal})` : ""}`;
      console.warn(
        `Desktop Head Unit exited${reason}. Start the Android Auto head unit server before launching the DHU.`,
      );
    }
  }

  console.log(`Android device: ${serial}`);
  console.log(`ADB forward: tcp:${options.port} -> tcp:${options.port}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
