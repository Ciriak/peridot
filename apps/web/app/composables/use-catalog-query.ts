import { useState } from "#imports";
import type {
  AlbumSummaryResponse,
  ArtistSummaryResponse,
  TrackResponse,
} from "@peridot/contracts";
import { computed, ref, shallowRef, watch } from "vue";
import {
  isAuthenticationRedirectError,
  listAlbums,
  listArtists,
  listTracks,
  type CardListOptions,
  type TrackListOptions,
} from "../lib/peridot-client";
import { useServer } from "./use-server";
import { useSession } from "./use-session";

export function useCatalogRevision() {
  const revision = useState("catalog-revision", () => 0);
  const resyncVersion = useState("catalog-resync-version", () => 0);

  function applyRevision(value: number) {
    revision.value = Math.max(revision.value, value);
  }

  function requestResync() {
    resyncVersion.value += 1;
  }

  function invalidate() {
    revision.value += 1;
  }

  function reset() {
    revision.value = 0;
    resyncVersion.value += 1;
  }

  return {
    revision,
    resyncVersion,
    applyRevision,
    requestResync,
    invalidate,
    reset,
  };
}

function errorMessage(reason: unknown): string | null {
  if (isAuthenticationRedirectError(reason)) return null;
  return reason instanceof Error
    ? reason.message
    : "The server could not load this catalog view.";
}

function stableOptions(options: object): string {
  return JSON.stringify(options);
}

export function useCatalogTrackQuery(
  options: () => TrackListOptions = () => ({}),
) {
  const { address } = useServer();
  const { token } = useSession();
  const { revision, resyncVersion, applyRevision } = useCatalogRevision();
  const tracks = ref<TrackResponse[]>([]);
  const loading = ref(false);
  const loadingMore = ref(false);
  const loaded = ref(false);
  const error = ref<string | null>(null);
  const nextCursor = ref<string | null>(null);
  const hasMore = computed(() => Boolean(nextCursor.value));
  let requestVersion = 0;

  function scope(): string {
    return `${address.value ?? ""}\u0000${token.value ?? ""}`;
  }

  async function load(force = false) {
    if (!import.meta.client || loading.value) return;
    const serverAddress = address.value;
    const sessionToken = token.value;
    if (!serverAddress || !sessionToken) {
      tracks.value = [];
      loaded.value = false;
      nextCursor.value = null;
      return;
    }
    if (!force && loaded.value) return;
    const requestedScope = scope();
    const request = ++requestVersion;
    loading.value = true;
    error.value = null;
    try {
      const result = await listTracks(serverAddress, sessionToken, options());
      if (request !== requestVersion || requestedScope !== scope()) return;
      if (result.catalogRevision < revision.value) return;
      applyRevision(result.catalogRevision);
      tracks.value = result.items;
      nextCursor.value = result.nextCursor;
      loaded.value = true;
    } catch (reason) {
      if (request !== requestVersion || requestedScope !== scope()) return;
      error.value = errorMessage(reason);
    } finally {
      if (request === requestVersion) loading.value = false;
    }
  }

  async function loadMore() {
    if (
      !import.meta.client ||
      loading.value ||
      loadingMore.value ||
      !nextCursor.value ||
      !address.value ||
      !token.value
    ) {
      return;
    }
    const requestedScope = scope();
    const request = ++requestVersion;
    loadingMore.value = true;
    error.value = null;
    try {
      const result = await listTracks(address.value, token.value, {
        ...options(),
        cursor: nextCursor.value,
      });
      if (request !== requestVersion || requestedScope !== scope()) return;
      if (result.catalogRevision < revision.value) return;
      applyRevision(result.catalogRevision);
      const existing = new Set(tracks.value.map((track) => track.id));
      tracks.value = [
        ...tracks.value,
        ...result.items.filter((track) => !existing.has(track.id)),
      ];
      nextCursor.value = result.nextCursor;
      loaded.value = true;
    } catch (reason) {
      if (request !== requestVersion || requestedScope !== scope()) return;
      error.value = errorMessage(reason);
    } finally {
      if (request === requestVersion) loadingMore.value = false;
    }
  }

  const optionKey = computed(() => stableOptions(options()));
  watch([address, token, optionKey], () => {
    requestVersion += 1;
    tracks.value = [];
    loaded.value = false;
    nextCursor.value = null;
    loading.value = false;
    if (import.meta.client) void load(true);
  });
  watch([revision, resyncVersion], () => {
    if (import.meta.client && loaded.value) void load(true);
  });

  return {
    tracks,
    loading,
    loadingMore,
    loaded,
    error,
    nextCursor,
    hasMore,
    load,
    loadMore,
    reload: () => load(true),
  };
}

function useCatalogCardQuery<T>(
  fetcher: (
    address: string,
    token: string,
    options: CardListOptions,
  ) => Promise<{
    items: T[];
    nextCursor: string | null;
    catalogRevision: number;
  }>,
  options: () => CardListOptions,
  itemKey: (item: T) => string,
) {
  const { address } = useServer();
  const { token } = useSession();
  const { revision, resyncVersion, applyRevision } = useCatalogRevision();
  const items = shallowRef<T[]>([]);
  const loading = ref(false);
  const loadingMore = ref(false);
  const loaded = ref(false);
  const error = ref<string | null>(null);
  const nextCursor = ref<string | null>(null);
  const hasMore = computed(() => Boolean(nextCursor.value));
  let requestVersion = 0;

  function scope(): string {
    return `${address.value ?? ""}\u0000${token.value ?? ""}`;
  }

  async function load(force = false) {
    if (!import.meta.client || loading.value) return;
    const serverAddress = address.value;
    const sessionToken = token.value;
    if (!serverAddress || !sessionToken) {
      items.value = [];
      loaded.value = false;
      nextCursor.value = null;
      return;
    }
    if (!force && loaded.value) return;
    const requestedScope = scope();
    const request = ++requestVersion;
    loading.value = true;
    error.value = null;
    try {
      const result = await fetcher(serverAddress, sessionToken, options());
      if (request !== requestVersion || requestedScope !== scope()) return;
      if (result.catalogRevision < revision.value) return;
      applyRevision(result.catalogRevision);
      items.value = result.items;
      nextCursor.value = result.nextCursor;
      loaded.value = true;
    } catch (reason) {
      if (request !== requestVersion || requestedScope !== scope()) return;
      error.value = errorMessage(reason);
    } finally {
      if (request === requestVersion) loading.value = false;
    }
  }

  async function loadMore() {
    if (
      !import.meta.client ||
      loading.value ||
      loadingMore.value ||
      !nextCursor.value ||
      !address.value ||
      !token.value
    ) {
      return;
    }
    const requestedScope = scope();
    const request = ++requestVersion;
    loadingMore.value = true;
    error.value = null;
    try {
      const result = await fetcher(address.value, token.value, {
        ...options(),
        cursor: nextCursor.value,
      });
      if (request !== requestVersion || requestedScope !== scope()) return;
      if (result.catalogRevision < revision.value) return;
      applyRevision(result.catalogRevision);
      const existing = new Set(items.value.map(itemKey));
      items.value = [
        ...items.value,
        ...result.items.filter((item) => !existing.has(itemKey(item))),
      ];
      nextCursor.value = result.nextCursor;
    } catch (reason) {
      if (request !== requestVersion || requestedScope !== scope()) return;
      error.value = errorMessage(reason);
    } finally {
      if (request === requestVersion) loadingMore.value = false;
    }
  }

  const optionKey = computed(() => stableOptions(options()));
  watch([address, token, optionKey], () => {
    requestVersion += 1;
    items.value = [];
    loaded.value = false;
    nextCursor.value = null;
    loading.value = false;
    if (import.meta.client) void load(true);
  });
  watch([revision, resyncVersion], () => {
    if (import.meta.client && loaded.value) void load(true);
  });

  return {
    items,
    loading,
    loadingMore,
    loaded,
    error,
    nextCursor,
    hasMore,
    load,
    loadMore,
    reload: () => load(true),
  };
}

export function useCatalogAlbumQuery(
  options: () => CardListOptions = () => ({}),
) {
  return useCatalogCardQuery<AlbumSummaryResponse>(
    listAlbums,
    options,
    (album) => album.id,
  );
}

export function useCatalogArtistQuery(
  options: () => CardListOptions = () => ({}),
) {
  return useCatalogCardQuery<ArtistSummaryResponse>(
    listArtists,
    options,
    (artist) => artist.id,
  );
}
