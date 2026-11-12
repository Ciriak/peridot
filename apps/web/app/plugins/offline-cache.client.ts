import { defineNuxtPlugin } from "#imports";
import { watch } from "vue";
import { clearAllOfflineTracks } from "../lib/offline-audio";
import { clearAllPeridotQueries } from "../lib/query-persister";
import { resetServerReachability } from "../lib/server-connectivity";
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
        await Promise.all([clearAllPeridotQueries(), clearAllOfflineTracks()]);
        return;
      }
      if (!nextToken) {
        resetServerReachability();
        await Promise.all([clearAllPeridotQueries(), clearAllOfflineTracks()]);
      }
    },
  );
});
