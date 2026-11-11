import type { Database } from "./database.js";

export const SERVER_SETTING_ID = "server";

export async function ensureServerSettings(
  database: Database,
  seedLibraryRoot: string,
): Promise<void> {
  const existing = await database.orm.ServerSetting.first({
    id: SERVER_SETTING_ID,
  });
  if (!existing) {
    await database.orm.ServerSetting.create({
      id: SERVER_SETTING_ID,
      libraryRoot: seedLibraryRoot,
    });
  }
}
