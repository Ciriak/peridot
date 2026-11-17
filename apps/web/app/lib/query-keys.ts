import type { QueryKey } from "@tanstack/vue-query";
import type {
  CardListOptions,
  PlaylistListOptions,
  TrackListOptions,
} from "./peridot-client";

export const PERIDOT_QUERY_ROOT = "peridot";

export interface PeridotQueryScope {
  serverAddress: string;
  userId: string;
}

export function peridotScopeKey(scope: PeridotQueryScope): QueryKey {
  return [PERIDOT_QUERY_ROOT, scope.serverAddress, scope.userId];
}

export function isPeridotQueryKey(key: QueryKey): boolean {
  return key[0] === PERIDOT_QUERY_ROOT;
}

export const queryKeys = {
  scope: peridotScopeKey,
  tracks(scope: PeridotQueryScope, options: TrackListOptions) {
    return [...peridotScopeKey(scope), "catalog", "tracks", options];
  },
  albums(scope: PeridotQueryScope, options: CardListOptions) {
    return [...peridotScopeKey(scope), "catalog", "albums", options];
  },
  audiobooks(scope: PeridotQueryScope, options: CardListOptions) {
    return [...peridotScopeKey(scope), "catalog", "audiobooks", options];
  },
  podcasts(scope: PeridotQueryScope, options: CardListOptions) {
    return [...peridotScopeKey(scope), "catalog", "podcasts", options];
  },
  artists(scope: PeridotQueryScope, options: CardListOptions) {
    return [...peridotScopeKey(scope), "catalog", "artists", options];
  },
  likes(scope: PeridotQueryScope) {
    return [...peridotScopeKey(scope), "likes"];
  },
  playlistsRoot(scope: PeridotQueryScope) {
    return [...peridotScopeKey(scope), "playlists"];
  },
  playlists(scope: PeridotQueryScope, options: PlaylistListOptions = {}) {
    return [...queryKeys.playlistsRoot(scope), { list: options }];
  },
  playlist(scope: PeridotQueryScope, playlistId: string) {
    return [...queryKeys.playlistsRoot(scope), { detail: playlistId }];
  },
  quickPicks(scope: PeridotQueryScope) {
    return [...peridotScopeKey(scope), "quick-picks"];
  },
  queue(scope: PeridotQueryScope) {
    return [...peridotScopeKey(scope), "queue"];
  },
  tasks(scope: PeridotQueryScope, options: Record<string, unknown> = {}) {
    return [...peridotScopeKey(scope), "tasks", options];
  },
  serverSettings(scope: PeridotQueryScope) {
    return [...peridotScopeKey(scope), "admin", "server"];
  },
  updates(scope: PeridotQueryScope) {
    return [...peridotScopeKey(scope), "admin", "updates"];
  },
  metadataProviders(scope: PeridotQueryScope) {
    return [...peridotScopeKey(scope), "admin", "metadata-providers"];
  },
  metadataProviderDefinitions(scope: PeridotQueryScope) {
    return [
      ...peridotScopeKey(scope),
      "admin",
      "metadata-provider-definitions",
    ];
  },
  sources(scope: PeridotQueryScope) {
    return [...peridotScopeKey(scope), "admin", "sources"];
  },
  plugins(scope: PeridotQueryScope) {
    return [...peridotScopeKey(scope), "admin", "plugins"];
  },
  users(scope: PeridotQueryScope) {
    return [...peridotScopeKey(scope), "admin", "users"];
  },
  logs(scope: PeridotQueryScope, after = 0) {
    return [...peridotScopeKey(scope), "admin", "logs", { after }];
  },
  directories(
    scope: PeridotQueryScope,
    parent: string | undefined,
    options?: { persist?: boolean },
  ) {
    return [
      ...peridotScopeKey(scope),
      "filesystem",
      "directories",
      { parent: parent ?? null, persist: options?.persist ?? false },
    ];
  },
  metadataCandidates(
    scope: PeridotQueryScope,
    trackId: string,
    query?: string,
  ) {
    return [
      ...peridotScopeKey(scope),
      "metadata-candidates",
      "track",
      trackId,
      { query: query?.trim() || null },
    ];
  },
  artistMetadataCandidates(
    scope: PeridotQueryScope,
    artistId: string,
    query?: string,
  ) {
    return [
      ...peridotScopeKey(scope),
      "metadata-candidates",
      "artist",
      artistId,
      { query: query?.trim() || null },
    ];
  },
} as const;

export type PeridotQueryKey = ReturnType<
  (typeof queryKeys)[Exclude<keyof typeof queryKeys, "scope">]
>;
