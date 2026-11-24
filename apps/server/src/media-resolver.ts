import type { Database } from "./database.js";
import type { MediaRow } from "./prisma/models.js";

export async function canonicalMediaId(
  database: Database,
  requestedId: string,
): Promise<string> {
  let current = requestedId;
  const visited = new Set<string>();
  while (!visited.has(current) && visited.size < 16) {
    visited.add(current);
    const alias = await database.orm.MediaAlias.first({ aliasId: current });
    if (!alias) return current;
    current = alias.mediaId;
  }
  return current;
}

export async function canonicalMedia(
  database: Database,
  requestedId: string,
): Promise<MediaRow | null> {
  return database.orm.Media.first({
    id: await canonicalMediaId(database, requestedId),
  });
}
