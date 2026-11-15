import { useCookie } from "#imports";
import type { UserResponse } from "@peridot/contracts";

export function useUser() {
  const user = useCookie<UserResponse | null>("peridot-user", {
    default: () => null,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
  return { user };
}
