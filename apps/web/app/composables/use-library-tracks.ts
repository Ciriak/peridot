import { useState } from "#imports";
import type { TrackResponse } from "@peridot/contracts";
import { listTracks } from "../lib/peridot-client";
import { useServer } from "./use-server";
import { useSession } from "./use-session";

export function useLibraryTracks() {
  const { address } = useServer();
  const { token } = useSession();
  const tracks = useState<TrackResponse[]>("library-tracks", () => []);
  const loading = useState("library-tracks-loading", () => false);
  const loaded = useState("library-tracks-loaded", () => false);
  const refreshQueued = useState("library-tracks-refresh-queued", () => false);
  const error = useState<string | null>("library-tracks-error", () => null);

  async function load(force = false) {
    if (loading.value) {
      if (force) refreshQueued.value = true;
      return;
    }
    if (!force && loaded.value) return;

    const serverAddress = address.value;
    const sessionToken = token.value;
    if (!serverAddress || !sessionToken) {
      tracks.value = [];
      loaded.value = false;
      error.value = null;
      return;
    }

    loading.value = true;
    error.value = null;
    try {
      tracks.value = (await listTracks(serverAddress, sessionToken)).items;
      loaded.value = true;
    } catch (reason) {
      error.value =
        reason instanceof Error
          ? reason.message
          : "The server could not load your library.";
    } finally {
      loading.value = false;
      if (refreshQueued.value) {
        refreshQueued.value = false;
        void load(true);
      }
    }
  }

  return {
    tracks,
    loading,
    loaded,
    error,
    load,
    reload: () => load(true),
  };
}
