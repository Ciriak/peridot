import type { AlbumSummaryResponse, TrackResponse } from "@peridot/contracts";

export interface AlbumGroup {
  key: string;
  id?: string;
  title: string;
  artist: string;
  artists: string[];
  coverUrl: string | null;
  tracks: TrackResponse[];
  trackIds: string[];
  durationMs: number | null;
  releaseYear: number | null;
}

export interface ArtistGroup {
  key: string;
  name: string;
  tracks: TrackResponse[];
  trackIds: string[];
  albumCount: number;
  durationMs: number | null;
}

export type TrackTableVariant =
  "library" | "album" | "artist" | "audiobook" | "podcast";

export type TrackSortField =
  "number" | "title" | "artist" | "album" | "duration";

export interface TrackSort {
  field: TrackSortField;
  direction: "asc" | "desc";
}

export function defaultTrackSort(variant: TrackTableVariant): TrackSort {
  return variant === "library"
    ? { field: "title", direction: "asc" }
    : { field: "number", direction: "asc" };
}

export function nextTrackSort(
  current: TrackSort | null,
  field: TrackSortField,
): TrackSort | null {
  if (current?.field !== field) return { field, direction: "asc" };
  if (current.direction === "asc") return { field, direction: "desc" };
  return null;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function artistLikeKey(name: string): string {
  return normalize(name);
}

export function albumLikeKey(album: Pick<AlbumSummaryResponse, "id">): string {
  return album.id;
}

const ARTIST_SEPARATOR = /(?:\s*[;,]\s*|\s+(?:feat\.?|ft\.?|featuring)\s+)/i;

export function splitArtistCredit(value: string): string[] {
  return value
    .split(ARTIST_SEPARATOR)
    .map((artist) => artist.trim())
    .filter(Boolean);
}

export function trackArtistNames(
  track: Pick<TrackResponse, "artist" | "artists">,
): string[] {
  const candidates =
    Array.isArray(track.artists) && track.artists.length
      ? track.artists
      : splitArtistCredit(track.artist);
  const artists: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    for (const artist of splitArtistCredit(candidate)) {
      const key = normalize(artist);
      if (seen.has(key)) continue;
      seen.add(key);
      artists.push(artist);
    }
  }
  return artists;
}

function compareText(left: string, right: string): number {
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  return 0;
}

const sortText = new Intl.Collator("en-US", {
  numeric: true,
  sensitivity: "base",
});

function compareInDirection(order: number, direction: "asc" | "desc"): number {
  return direction === "asc" ? order : -order;
}

function isEmptyText(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim().length === 0;
}

function compareTextValue(
  left: string | null,
  right: string | null,
  direction: "asc" | "desc",
): number {
  const leftEmpty = isEmptyText(left);
  const rightEmpty = isEmptyText(right);
  if (leftEmpty || rightEmpty) {
    if (leftEmpty === rightEmpty) return 0;
    return leftEmpty ? 1 : -1;
  }
  return compareInDirection(
    sortText.compare(left!.trim(), right!.trim()),
    direction,
  );
}

function compareNumberValue(
  left: number | null,
  right: number | null,
  direction: "asc" | "desc",
): number {
  if (left === null || right === null) {
    if (left === right) return 0;
    return left === null ? 1 : -1;
  }
  return compareInDirection(left - right, direction);
}

function compareTrackNumber(
  left: TrackResponse,
  right: TrackResponse,
  direction: "asc" | "desc",
): number {
  const albumDifference = compareTextValue(left.album, right.album, direction);
  if (albumDifference !== 0) return albumDifference;
  const discDifference = compareNumberValue(
    left.discNumber ?? 1,
    right.discNumber ?? 1,
    direction,
  );
  if (discDifference !== 0) return discDifference;
  return compareNumberValue(left.trackNumber, right.trackNumber, direction);
}

function compareTracksBy(
  left: TrackResponse,
  right: TrackResponse,
  sort: TrackSort,
): number {
  switch (sort.field) {
    case "number":
      return compareTrackNumber(left, right, sort.direction);
    case "title":
      return compareTextValue(left.title, right.title, sort.direction);
    case "artist":
      return compareTextValue(left.artist, right.artist, sort.direction);
    case "album":
      return compareTextValue(left.album, right.album, sort.direction);
    case "duration":
      return compareNumberValue(
        left.durationMs,
        right.durationMs,
        sort.direction,
      );
  }
}

export function sortTracks(
  tracks: readonly TrackResponse[],
  sort: TrackSort,
): TrackResponse[] {
  return tracks
    .map((track, index) => ({ track, index }))
    .sort(
      (left, right) =>
        compareTracksBy(left.track, right.track, sort) ||
        left.index - right.index,
    )
    .map(({ track }) => track);
}

function compareAlbumTracks(left: TrackResponse, right: TrackResponse): number {
  const numberingDifference =
    Number(left.trackNumber === null) - Number(right.trackNumber === null);
  if (numberingDifference !== 0) return numberingDifference;
  const discDifference = (left.discNumber ?? 1) - (right.discNumber ?? 1);
  if (discDifference !== 0) return discDifference;
  const trackDifference =
    (left.trackNumber ?? Number.MAX_SAFE_INTEGER) -
    (right.trackNumber ?? Number.MAX_SAFE_INTEGER);
  if (trackDifference !== 0) return trackDifference;
  return (
    compareText(left.title, right.title) ||
    compareText(left.artist, right.artist) ||
    compareText(left.id, right.id)
  );
}

function compareArtistTracks(
  left: TrackResponse,
  right: TrackResponse,
): number {
  const leftAlbum = left.album?.trim() ?? "";
  const rightAlbum = right.album?.trim() ?? "";
  const albumPresenceDifference =
    Number(leftAlbum.length === 0) - Number(rightAlbum.length === 0);
  if (albumPresenceDifference !== 0) return albumPresenceDifference;
  const albumDifference = compareText(leftAlbum, rightAlbum);
  if (albumDifference !== 0) return albumDifference;
  return compareAlbumTracks(left, right);
}

function totalDuration(tracks: readonly TrackResponse[]): number | null {
  let duration = 0;
  let foundDuration = false;
  for (const track of tracks) {
    if (track.durationMs === null || track.durationMs < 0) continue;
    duration += track.durationMs;
    foundDuration = true;
  }
  return foundDuration ? duration : null;
}

function albumReleaseYear(tracks: readonly TrackResponse[]): number | null {
  const years = new Set<number>();
  for (const track of tracks) {
    const detail = track.metadata?.details.find(
      (item) => item.key.trim().toLowerCase() === "year",
    );
    const value = detail?.value.trim() ?? "";
    if (!/^\d{4}$/.test(value)) continue;
    const year = Number(value);
    if (year >= 1000 && year <= 9999) years.add(year);
  }
  return years.size === 1 ? [...years][0]! : null;
}

export function groupArtists(tracks: readonly TrackResponse[]): ArtistGroup[] {
  const groups = new Map<string, ArtistGroup>();
  for (const track of tracks) {
    for (const name of trackArtistNames(track)) {
      const key = artistLikeKey(name);
      const existing = groups.get(key);
      if (existing) {
        existing.tracks.push(track);
        continue;
      }
      groups.set(key, {
        key,
        name,
        tracks: [track],
        trackIds: [],
        albumCount: 0,
        durationMs: null,
      });
    }
  }

  return [...groups.values()]
    .map((artist) => {
      artist.tracks.sort(compareArtistTracks);
      artist.trackIds = artist.tracks.map((track) => track.id);
      artist.albumCount = new Set(
        artist.tracks.flatMap((track) => {
          const album = track.album?.trim().toLowerCase();
          return album ? [album] : [];
        }),
      ).size;
      artist.durationMs = totalDuration(artist.tracks);
      return artist;
    })
    .sort(
      (left, right) =>
        compareText(left.name, right.name) || compareText(left.key, right.key),
    );
}

export function filterArtists(
  artists: readonly ArtistGroup[],
  query: string,
): ArtistGroup[] {
  const normalized = normalize(query);
  if (!normalized) return [...artists];
  return artists.filter((artist) =>
    artist.name.toLowerCase().includes(normalized),
  );
}

export function findArtist(
  artists: readonly ArtistGroup[],
  name: string,
): ArtistGroup | null {
  const normalizedName = normalize(name);
  return (
    artists.find((artist) => normalize(artist.name) === normalizedName) ?? null
  );
}

export function artistRoute(artist: { name: string; localName?: string }) {
  return `/artists/${encodeURIComponent(artist.localName ?? artist.name)}`;
}

export function albumSummaryFromTrack(
  track: TrackResponse,
): AlbumSummaryResponse {
  return {
    id: track.albumId ?? "",
    title: track.album?.trim() ?? "",
    artist: track.artist.trim(),
    artists: trackArtistNames(track),
    coverUrl: track.coverUrl,
    trackCount: track.albumId ? 1 : 0,
    durationMs: track.durationMs,
    releaseYear: null,
    available: track.available,
    liked: track.liked,
  };
}

function routeQuery(query: Record<string, string | undefined>): string {
  const entries = Object.entries(query).filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  );
  return entries.length
    ? `?${entries
        .map(
          ([key, value]) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
        )
        .join("&")}`
    : "";
}

export function groupAlbums(tracks: readonly TrackResponse[]): AlbumGroup[] {
  const groups = new Map<string, AlbumGroup>();
  for (const track of tracks) {
    const title = track.album?.trim();
    const artist = track.artist.trim();
    if (!title || !artist) continue;
    const key =
      track.albumId ?? `${normalize(artist)}\u0000${normalize(title)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.tracks.push(track);
      existing.coverUrl ??= track.coverUrl;
      continue;
    }
    groups.set(key, {
      key,
      ...(track.albumId ? { id: track.albumId } : {}),
      title,
      artist,
      artists: trackArtistNames(track),
      coverUrl: track.coverUrl,
      tracks: [track],
      trackIds: [],
      durationMs: null,
      releaseYear: null,
    });
  }

  return [...groups.values()]
    .map((album) => {
      album.tracks.sort(compareAlbumTracks);
      album.trackIds = album.tracks.map((track) => track.id);
      album.durationMs = totalDuration(album.tracks);
      album.releaseYear = albumReleaseYear(album.tracks);
      return album;
    })
    .sort(
      (left, right) =>
        compareText(left.title, right.title) ||
        compareText(left.artist, right.artist) ||
        compareText(left.key, right.key),
    );
}

export function filterAlbums(
  albums: readonly AlbumGroup[],
  query: string,
): AlbumGroup[] {
  const normalized = normalize(query);
  if (!normalized) return [...albums];
  return albums.filter((album) =>
    `${album.title} ${album.artist}`.toLowerCase().includes(normalized),
  );
}

export function findAlbum(
  albums: readonly AlbumGroup[],
  title: string,
  artist: string,
): AlbumGroup | null {
  const normalizedTitle = normalize(title);
  const normalizedArtist = normalize(artist);
  return (
    albums.find(
      (album) =>
        normalize(album.title) === normalizedTitle &&
        normalize(album.artist) === normalizedArtist,
    ) ?? null
  );
}

export function albumRoute(
  album: Pick<AlbumGroup, "title"> & {
    artist?: string;
    id?: string;
  },
) {
  return `/albums/${encodeURIComponent(album.title)}${routeQuery({
    artist: album.artist,
    id: album.id,
  })}`;
}

export function trackAlbumRoute(track: TrackResponse) {
  if (track.mediaType === "audiobook") {
    return `/audiobooks/${encodeURIComponent(track.album?.trim() ?? "")}${routeQuery(
      {
        author: track.artist,
        id: track.albumId ?? undefined,
      },
    )}`;
  }
  if (track.mediaType === "podcast") {
    return `/podcasts/${encodeURIComponent(track.album?.trim() ?? "")}${routeQuery(
      {
        publisher: track.artist,
        id: track.albumId ?? undefined,
      },
    )}`;
  }
  return albumRoute({
    title: track.album?.trim() ?? "",
    artist: track.albumId ? undefined : track.artist.trim(),
    ...(track.albumId ? { id: track.albumId } : {}),
  });
}

export function trackTitleAnchorId(trackId: string): string {
  return `track-title-${trackId}`;
}

export function trackIdFromTitleHash(hash: string): string | null {
  const prefix = `#${trackTitleAnchorId("")}`;
  if (!hash.startsWith(prefix)) return null;
  const encodedId = hash.slice(prefix.length);
  if (!encodedId) return null;
  try {
    return decodeURIComponent(encodedId);
  } catch {
    return encodedId;
  }
}

export function trackAlbumTitleRoute(track: TrackResponse) {
  if (!track.album?.trim() || (!track.albumId && !track.artist.trim())) {
    return null;
  }
  return `${trackAlbumRoute(track)}#${encodeURIComponent(trackTitleAnchorId(track.id))}`;
}

export function filterTracks(
  tracks: readonly TrackResponse[],
  query: string,
  favorites?: readonly string[],
) {
  const normalized = query.trim().toLowerCase();
  return tracks.filter((track) => {
    if (favorites !== undefined && !favorites.includes(track.id)) return false;
    if (!normalized) return true;
    return `${track.title} ${[track.artist, ...track.artists].join(" ")} ${track.album ?? ""}`
      .toLowerCase()
      .includes(normalized);
  });
}

export function trackDownloadFileName(track: TrackResponse): string {
  const extensionByMime = new Map([
    ["audio/mpeg", "mp3"],
    ["audio/mp4", "m4a"],
    ["audio/aac", "aac"],
    ["audio/ogg", "ogg"],
    ["audio/wav", "wav"],
    ["audio/flac", "flac"],
  ]);
  const extension =
    extensionByMime.get(track.mimeType.toLowerCase()) ?? "audio";
  const title = [...track.title]
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("")
    .replace(/[<>:"/\\|?*]/g, "")
    .trim()
    .replace(/\s+/g, " ");
  return `${title || "track"}.${extension}`;
}

export function trackCoverUrl(
  serverAddress: string,
  coverUrl: string | null,
): string | null {
  return coverUrl ? `${serverAddress}${coverUrl}` : null;
}

export function formatTrackDuration(durationMs: number | null): string {
  if (durationMs === null || durationMs < 0) return "—";
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatTrackNumber(track: TrackResponse): string {
  if (track.trackNumber === null) return "—";
  return track.discNumber !== null && track.discNumber > 1
    ? `${track.discNumber}-${String(track.trackNumber).padStart(2, "0")}`
    : String(track.trackNumber);
}

export function resolvePlayerQueue(
  tracks: readonly TrackResponse[],
  queueTrackIds: readonly string[] | null,
): TrackResponse[] {
  if (queueTrackIds === null) return [...tracks];
  const tracksById = new Map(tracks.map((track) => [track.id, track]));
  return [...new Set(queueTrackIds)].flatMap((id) => {
    const track = tracksById.get(id);
    return track ? [track] : [];
  });
}

export function selectPlayerTrack(
  tracks: readonly TrackResponse[],
  activeTrackId: string | null,
): TrackResponse | null {
  if (!activeTrackId) return tracks[0] ?? null;
  return tracks.find((track) => track.id === activeTrackId) ?? null;
}

export function mergePlayerQueueTracks(
  current: readonly TrackResponse[],
  incoming: readonly TrackResponse[],
  queueTrackIds: readonly string[],
): TrackResponse[] {
  const tracksById = new Map(
    [...current, ...incoming].map((track) => [track.id, track]),
  );
  return [...new Set(queueTrackIds)].flatMap((id) => {
    const track = tracksById.get(id);
    return track ? [track] : [];
  });
}

export function haveSameTrackReferences(
  left: readonly TrackResponse[],
  right: readonly TrackResponse[],
): boolean {
  return (
    left.length === right.length &&
    left.every((track, index) => track === right[index])
  );
}

export function nextQueueTrackId(
  queue: readonly TrackResponse[],
  currentTrackId: string | null,
  offset = 1,
): string | null {
  if (!queue.length) return null;
  const matchedIndex = queue.findIndex((track) => track.id === currentTrackId);
  const currentIndex = matchedIndex >= 0 ? matchedIndex : 0;
  const nextIndex = (currentIndex + offset + queue.length) % queue.length;
  return queue[nextIndex]?.id ?? null;
}
