import { watchDebounced } from "@vueuse/core";
import { ref } from "vue";

export const LIST_SEARCH_DEBOUNCE_MS = 250;

export function useListSearch() {
  const query = ref("");
  const searchQuery = ref("");

  watchDebounced(
    query,
    (value) => {
      searchQuery.value = value.trim();
    },
    { debounce: LIST_SEARCH_DEBOUNCE_MS },
  );

  function clear() {
    query.value = "";
    searchQuery.value = "";
  }

  return { query, searchQuery, clear };
}
