import { mkdir } from "node:fs/promises";

const DEFAULT_DEV_DATABASE_URL = "file:./peridot.db";
const DEFAULT_DEV_LIBRARY_PATH = "./music";

export async function prepareDevelopmentEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  environment.DATABASE_URL ||= DEFAULT_DEV_DATABASE_URL;
  environment.MUSIC_LIBRARY_PATH ||= DEFAULT_DEV_LIBRARY_PATH;
  await mkdir(environment.MUSIC_LIBRARY_PATH, { recursive: true });
}
