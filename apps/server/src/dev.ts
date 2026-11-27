import "./instrument.js";
import { prepareDevelopmentEnvironment } from "./dev-config.js";
import { startServer } from "./start.js";

await prepareDevelopmentEnvironment();
console.log("Development storage is ready; starting the Peridot server.");
const started = await startServer();
if (!started) process.exitCode = 1;
