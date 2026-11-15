import { useCookie } from "#imports";
import { computed } from "vue";
import { normalizeServerAddress, serverLabel } from "../lib/server-address";

export function useServer() {
  const address = useCookie<string | null>("peridot-server", {
    default: () => null,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return {
    address,
    label: computed(() => (address.value ? serverLabel(address.value) : "")),
    configure(value: string) {
      address.value = normalizeServerAddress(value);
    },
  };
}
