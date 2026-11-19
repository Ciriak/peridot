import type { Database } from "./database.js";
import type { TrackRow } from "./prisma/models.js";

export async function canonicalTrackId(
  database: Database,
  requestedId: string,
): Promise<string> {
  let current = requestedId;
  const visited = new Set<string>();
  while (!visited.has(current) && visited.size < 16) {
    visited.add(current);
    const row = await database.orm.Track.select("duplicateOfId").first({
      id: current,
    });
    if (!row?.duplicateOfId) return current;
    current = row.duplicateOfId;
  }
  return current;
}

export async function canonicalTrack(
  database: Database,
  requestedId: string,
): Promise<TrackRow | null> {
  return database.orm.Track.first({
    id: await canonicalTrackId(database, requestedId),
  });
}
