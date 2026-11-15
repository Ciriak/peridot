import { defineNuxtRouteMiddleware, navigateTo } from "#imports";
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";

export default defineNuxtRouteMiddleware((to) => {
  if (to.path === "/onboarding") return;
  const { address } = useServer();
  const { token } = useSession();
  if (!address.value || !token.value) {
    return navigateTo({
      path: "/onboarding",
      query: { redirect: to.fullPath },
    });
  }
});
