import "./instrument.js";
import { prepareDevelopmentEnvironment } from "./dev-config.js";
import { startServer } from "./start.js";

await prepareDevelopmentEnvironment();
console.log("Development storage is ready; starting the Peridot server.");
await startServer();
