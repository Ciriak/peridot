export const QUICK_PICK_LIMIT = 8;
const QUICK_PICK_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

export interface PlayedTrackInfo {
  id: string;
  mediaType?: string;
  artist: string;
  album: string | null;
  albumArtist: string | null;
  albumId: string | null;
  metadataArtist: string | null;
  metadataAlbum: string | null;
  available: number | boolean;
}

export interface PlayedTrackEvent {
  playedAt: Date;
  track: PlayedTrackInfo;
}

interface RankedItem {
  score: number;
  lastPlayedAt: number;
  item: RankedQuickPick;
}

export type RankedQuickPick =
  | {
      kind: "track";
      key: string;
      trackId: string;
    }
  | {
      kind: "album";
      key: string;
      albumId: string;
      title: string;
      artist: string;
    };

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function decayedPlayScore(
  playedAt: Date,
  now: Date,
  halfLifeMs = QUICK_PICK_HALF_LIFE_MS,
): number {
  const ageMs = Math.max(0, now.getTime() - playedAt.getTime());
  return 0.5 ** (ageMs / halfLifeMs);
}

export function rankQuickPicks(
  events: readonly PlayedTrackEvent[],
  now: Date,
  limit = QUICK_PICK_LIMIT,
): RankedQuickPick[] {
  const tracks = new Map<
    string,
    { score: number; lastPlayedAt: number; track: PlayedTrackInfo }
  >();
  const albums = new Map<
    string,
    {
      score: number;
      lastPlayedAt: number;
      title: string;
      artist: string;
    }
  >();

  for (const event of events) {
    if (!event.track.available) continue;
    if (
      event.track.mediaType !== undefined &&
      event.track.mediaType !== "music"
    ) {
      continue;
    }
    const playedAt = event.playedAt.getTime();
    const score = decayedPlayScore(event.playedAt, now);
    const track = tracks.get(event.track.id);
    if (track) {
      track.score += score;
      track.lastPlayedAt = Math.max(track.lastPlayedAt, playedAt);
    } else {
      tracks.set(event.track.id, {
        score,
        lastPlayedAt: playedAt,
        track: event.track,
      });
    }

    const title = (event.track.metadataAlbum ?? event.track.album)?.trim();
    const artist = (
      event.track.albumArtist?.trim() ||
      event.track.metadataArtist ||
      event.track.artist
    ).trim();
    const albumId = event.track.albumId;
    if (!title || !artist || !albumId) continue;
    const album = albums.get(albumId);
    if (album) {
      album.score += score;
      album.lastPlayedAt = Math.max(album.lastPlayedAt, playedAt);
    } else {
      albums.set(albumId, {
        score,
        lastPlayedAt: playedAt,
        title,
        artist,
      });
    }
  }

  const ranked: RankedItem[] = [];
  for (const [trackId, track] of tracks) {
    ranked.push({
      score: track.score,
      lastPlayedAt: track.lastPlayedAt,
      item: { kind: "track", key: `track:${trackId}`, trackId },
    });
  }
  for (const [albumId, album] of albums) {
    ranked.push({
      score: album.score,
      lastPlayedAt: album.lastPlayedAt,
      item: {
        kind: "album",
        key: `album:${albumId}`,
        albumId,
        title: album.title,
        artist: album.artist,
      },
    });
  }

  return ranked
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.lastPlayedAt - left.lastPlayedAt ||
        compareText(left.item.key, right.item.key),
    )
    .slice(0, Math.max(0, Math.floor(limit)))
    .map(({ item }) => item);
}
