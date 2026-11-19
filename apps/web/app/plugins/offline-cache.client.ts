import { defineNuxtPlugin } from "#imports";
import { watch } from "vue";
import { clearDownloadTasks } from "../lib/download-tasks";
import { clearAllOfflineTracks } from "../lib/offline-audio";
import { clearOfflineCatalog } from "../lib/offline-catalog";
import { clearAllPeridotQueries } from "../lib/query-persister";
import { resetServerReachability } from "../lib/server-connectivity";
import { setOfflineCatalogSnapshot } from "../composables/use-offline-catalog";
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";
import { useUser } from "../composables/use-user";

export default defineNuxtPlugin(() => {
  const { address } = useServer();
  const { token } = useSession();
  const { user } = useUser();
  let previousIdentity = `${address.value ?? ""}\u0000${user.value?.id ?? ""}`;

  watch(
    [address, () => token.value, () => user.value?.id],
    async ([nextAddress, nextToken, nextUserId]) => {
      const nextIdentity = `${nextAddress ?? ""}\u0000${nextUserId ?? ""}`;
      if (nextIdentity !== previousIdentity) {
        previousIdentity = nextIdentity;
        resetServerReachability();
        setOfflineCatalogSnapshot(null);
        await Promise.all([
          clearAllPeridotQueries(),
          clearAllOfflineTracks(),
          clearDownloadTasks(),
          clearOfflineCatalog(),
        ]);
        return;
      }
      if (!nextToken) {
        resetServerReachability();
        setOfflineCatalogSnapshot(null);
        await Promise.all([
          clearAllPeridotQueries(),
          clearAllOfflineTracks(),
          clearDownloadTasks(),
          clearOfflineCatalog(),
        ]);
      }
    },
  );
});
