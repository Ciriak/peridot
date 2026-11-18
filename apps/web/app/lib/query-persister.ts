import {
  experimental_createQueryPersister,
  type PersistedQuery,
} from "@tanstack/query-persist-client-core";
import type { QueryClient } from "@tanstack/vue-query";
import { createStore, del, entries, get, set, type UseStore } from "idb-keyval";
import type { QueryKey } from "@tanstack/vue-query";
import { isPeridotQueryKey, PERIDOT_QUERY_ROOT } from "./query-keys.ts";

export const QUERY_CACHE_BUSTER = "peridot-query-v1";
export const QUERY_CACHE_PREFIX = "peridot-query";
export const QUERY_DATABASE = "peridot-web-query";
export const CATALOG_RESTORED_PAGE_LIMIT = 1;
const QUERY_STORE = "query-cache";

export interface QueryPersisterRuntime {
  persister: ReturnType<typeof experimental_createQueryPersister>;
  queryClient: QueryClient;
}

let runtime: QueryPersisterRuntime | null = null;

function createQueryStore(): UseStore {
  return createStore(QUERY_DATABASE, QUERY_STORE);
}

export function boundPersistedCatalogQuery(
  query: PersistedQuery,
): PersistedQuery {
  if (
    query.queryKey[0] !== PERIDOT_QUERY_ROOT ||
    query.queryKey[3] !== "catalog"
  ) {
    return query;
  }
  const data = query.state.data;
  if (!data || typeof data !== "object") return query;
  const pages = Reflect.get(data, "pages");
  const pageParams = Reflect.get(data, "pageParams");
  if (
    !Array.isArray(pages) ||
    !Array.isArray(pageParams) ||
    pages.length <= CATALOG_RESTORED_PAGE_LIMIT
  ) {
    return query;
  }
  return {
    ...query,
    state: {
      ...query.state,
      data: {
        ...(data as Record<string, unknown>),
        pages: pages.slice(0, CATALOG_RESTORED_PAGE_LIMIT),
        pageParams: pageParams.slice(0, CATALOG_RESTORED_PAGE_LIMIT),
      },
    },
  };
}

export function serializePersistedQuery(query: PersistedQuery): string {
  return JSON.stringify(boundPersistedCatalogQuery(query));
}

export function createPeridotQueryPersister() {
  const store = createQueryStore();
  return experimental_createQueryPersister({
    storage: {
      getItem(key) {
        return get<string>(key, store);
      },
      setItem(key, value) {
        return set(key, value, store);
      },
      removeItem(key) {
        return del(key, store);
      },
      entries() {
        return entries<string, string>(store);
      },
    },
    buster: QUERY_CACHE_BUSTER,
    serialize: serializePersistedQuery,
    maxAge: Number.POSITIVE_INFINITY,
    prefix: QUERY_CACHE_PREFIX,
    refetchOnRestore: true,
    filters: {
      predicate(query) {
        return (
          isPeridotQueryKey(query.queryKey) && query.meta?.persist !== false
        );
      },
    },
    deserialize(value): PersistedQuery {
      return boundPersistedCatalogQuery(JSON.parse(value) as PersistedQuery);
    },
  });
}

export function registerQueryRuntime(next: QueryPersisterRuntime) {
  runtime = next;
}

export function getQueryRuntime(): QueryPersisterRuntime | null {
  return runtime;
}

export async function persistQueryKey(queryKey: QueryKey): Promise<void> {
  if (!runtime) return;
  await runtime.persister.persistQueryByKey(queryKey, runtime.queryClient);
}

export async function removePersistedQueries(
  queryKey: QueryKey,
): Promise<void> {
  if (!runtime) return;
  runtime.queryClient.removeQueries({ queryKey });
  await runtime.persister.removeQueries({ queryKey });
}

export async function clearAllPeridotQueries(): Promise<void> {
  if (!runtime) return;
  runtime.queryClient.removeQueries({
    predicate(query) {
      return isPeridotQueryKey(query.queryKey);
    },
  });
  await runtime.persister.removeQueries({
    queryKey: [PERIDOT_QUERY_ROOT],
  });
}
