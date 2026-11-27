import "./instrument.js";
import { startServer } from "./start.js";

const started = await startServer();
if (!started) process.exitCode = 1;
