import { defineNuxtPlugin, navigateTo, useRoute } from "#imports";
import { useSession } from "../composables/use-session";
import { useUser } from "../composables/use-user";
import {
  setAuthenticationRedirectHandler,
  type AuthenticationRedirectReason,
} from "../lib/peridot-client";

export default defineNuxtPlugin(() => {
  const route = useRoute();
  const { token } = useSession();
  const { user } = useUser();
  let redirecting = false;

  async function openOnboarding(
    reason: AuthenticationRedirectReason,
    redirect: string,
  ) {
    try {
      await navigateTo(
        {
          path: "/onboarding",
          query: { auth: reason, redirect },
        },
        { replace: true },
      );
    } finally {
      redirecting = false;
    }
  }

  setAuthenticationRedirectHandler((reason) => {
    if (!token.value || redirecting) return;

    const redirect = route.fullPath;
    token.value = null;
    user.value = null;
    if (route.path === "/onboarding") return;

    redirecting = true;
    void openOnboarding(reason, redirect);
  });
});
