import { computed } from "vue";
import type { PeridotQueryScope } from "../lib/query-keys";
import { useServer } from "./use-server";
import { useUser } from "./use-user";

export function useQueryScope() {
  const { address } = useServer();
  const { user } = useUser();
  const scope = computed<PeridotQueryScope | null>(() => {
    if (!address.value || !user.value?.id) return null;
    return {
      serverAddress: address.value,
      userId: user.value.id,
    };
  });
  return { address, user, scope };
}
