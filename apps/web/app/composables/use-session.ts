import { useCookie } from "#imports";

export function useSession() {
  const token = useCookie<string | null>("peridot-session", {
    default: () => null,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
  return { token };
}
