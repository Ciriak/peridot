export const QUICK_PICK_LIMIT = 8;
const QUICK_PICK_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

export interface PlayedMediaInfo {
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

export interface PlayedMediaEvent {
  playedAt: Date;
  media: PlayedMediaInfo;
}

interface RankedItem {
  score: number;
  lastPlayedAt: number;
  item: RankedQuickPick;
}

export type RankedQuickPick =
  | {
      kind: "media";
      key: string;
      mediaId: string;
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
  events: readonly PlayedMediaEvent[],
  now: Date,
  limit = QUICK_PICK_LIMIT,
): RankedQuickPick[] {
  const media = new Map<
    string,
    { score: number; lastPlayedAt: number; media: PlayedMediaInfo }
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
    if (!event.media.available) continue;
    if (
      event.media.mediaType !== undefined &&
      event.media.mediaType !== "music"
    ) {
      continue;
    }
    const playedAt = event.playedAt.getTime();
    const score = decayedPlayScore(event.playedAt, now);
    const current = media.get(event.media.id);
    if (current) {
      current.score += score;
      current.lastPlayedAt = Math.max(current.lastPlayedAt, playedAt);
    } else {
      media.set(event.media.id, {
        score,
        lastPlayedAt: playedAt,
        media: event.media,
      });
    }

    const title = (event.media.metadataAlbum ?? event.media.album)?.trim();
    const artist = (
      event.media.albumArtist?.trim() ||
      event.media.metadataArtist ||
      event.media.artist
    ).trim();
    const albumId = event.media.albumId;
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
  for (const [mediaId, item] of media) {
    ranked.push({
      score: item.score,
      lastPlayedAt: item.lastPlayedAt,
      item: { kind: "media", key: `media:${mediaId}`, mediaId },
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
