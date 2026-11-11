import { onMounted, ref, watch } from "vue";
import {
  addRecentAlbum,
  readPersistedSearchRecents,
  savePersistedSearchRecents,
  type SearchRecentAlbum,
} from "../lib/search-recents";
import { useServer } from "./use-server";
import { useUser } from "./use-user";

export function useSearchRecents() {
  const { address } = useServer();
  const { user } = useUser();
  const recents = ref<SearchRecentAlbum[]>([]);

  function scope() {
    if (!address.value || !user.value?.id) return null;
    return { serverAddress: address.value, userId: user.value.id };
  }

  function load() {
    if (!import.meta.client) return;
    const currentScope = scope();
    recents.value = currentScope
      ? readPersistedSearchRecents(window.localStorage, currentScope)
      : [];
  }

  function remember(album: SearchRecentAlbum) {
    recents.value = addRecentAlbum(recents.value, album);
    const currentScope = scope();
    if (import.meta.client && currentScope) {
      savePersistedSearchRecents(
        window.localStorage,
        currentScope,
        recents.value,
      );
    }
  }

  onMounted(load);
  watch([address, () => user.value?.id], load);

  return { recents, remember };
}
