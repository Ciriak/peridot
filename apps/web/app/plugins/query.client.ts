import { defineNuxtPlugin } from "#imports";
import {
  QueryClient,
  VueQueryPlugin,
  onlineManager,
} from "@tanstack/vue-query";
import {
  createPeridotQueryPersister,
  registerQueryRuntime,
} from "../lib/query-persister";
import { subscribeServerReachability } from "../lib/server-connectivity";

const QUERY_STALE_TIME_MS = 30_000;
const QUERY_GC_TIME_MS = 30 * 60_000;

export default defineNuxtPlugin((nuxtApp) => {
  const persister = createPeridotQueryPersister();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: QUERY_GC_TIME_MS,
        staleTime: QUERY_STALE_TIME_MS,
        networkMode: "offlineFirst",
        persister: persister.persisterFn,
      },
      mutations: {
        networkMode: "always",
        retry: 0,
      },
    },
  });

  registerQueryRuntime({ queryClient, persister });
  onlineManager.setOnline(true);
  subscribeServerReachability((reachable) => {
    onlineManager.setOnline(reachable);
  });

  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient });
});
