import { useState } from "#imports";
import { computed, watch } from "vue";
import {
  defaultLibrarySettings,
  hasPersistedLibrarySettings,
  readPersistedLibrarySettings,
  savePersistedLibrarySettings,
  type LibrarySettings,
} from "../lib/library-settings";
import {
  fetchUserPreferences,
  initializeUserPreferences,
  isAuthenticationRedirectError,
  updateUserPreferences,
} from "../lib/peridot-client";
import { useLocalizedMessage } from "./use-localized-message";
import { useQueryScope } from "./use-query-scope";
import { useServerConnection } from "./use-server-connection";
import { useSession } from "./use-session";

type PreferenceVerification = "idle" | "verifying" | "verified" | "error";

export function useLibrarySettings() {
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { status } = useServerConnection();
  const { errorMessage } = useLocalizedMessage();
  const settings = useState<LibrarySettings>(
    "library-settings",
    defaultLibrarySettings,
  );
  const verification = useState<PreferenceVerification>(
    "library-settings-verification",
    () => "idle",
  );
  const verificationScope = useState<string | null>(
    "library-settings-verification-scope",
    () => null,
  );
  const verificationError = useState<string | null>(
    "library-settings-error",
    () => null,
  );
  const saving = useState("library-settings-saving", () => false);
  let verificationRequest: Promise<void> | null = null;

  function scopeKey() {
    return scope.value
      ? `${scope.value.serverAddress}\u0000${scope.value.userId}`
      : null;
  }

  function apply(next: LibrarySettings) {
    settings.value = next;
    if (import.meta.client && scope.value) {
      savePersistedLibrarySettings(window.localStorage, scope.value, next);
    }
  }

  function load() {
    if (!import.meta.client) {
      settings.value = defaultLibrarySettings();
      return;
    }
    settings.value = scope.value
      ? readPersistedLibrarySettings(window.localStorage, scope.value)
      : defaultLibrarySettings();
  }

  async function verify(): Promise<void> {
    const currentScope = scope.value;
    const currentToken = token.value;
    const key = scopeKey();
    if (
      !currentScope ||
      !currentToken ||
      status.value !== "connected" ||
      !key
    ) {
      return;
    }
    if (verification.value === "verified" && verificationScope.value === key) {
      return;
    }
    if (verification.value === "verifying" && verificationScope.value === key) {
      return;
    }
    if (verificationRequest && verificationScope.value === key) {
      return verificationRequest;
    }

    verificationScope.value = key;
    verification.value = "verifying";
    verificationError.value = null;
    verificationRequest = (async () => {
      try {
        let preferences = await fetchUserPreferences(
          currentScope.serverAddress,
          currentToken,
        );
        if (!preferences.initialized) {
          const localSettings = hasPersistedLibrarySettings(
            window.localStorage,
            currentScope,
          )
            ? readPersistedLibrarySettings(window.localStorage, currentScope)
            : defaultLibrarySettings();
          preferences = await initializeUserPreferences(
            currentScope.serverAddress,
            currentToken,
            { likedTitlesOffline: localSettings.likedTitlesOffline },
          );
        }
        if (
          scope.value?.serverAddress !== currentScope.serverAddress ||
          scope.value?.userId !== currentScope.userId ||
          token.value !== currentToken
        ) {
          return;
        }
        apply({
          likedTitlesOffline: preferences.likedTitlesOffline,
        });
        verification.value = "verified";
      } catch (reason) {
        if (isAuthenticationRedirectError(reason)) return;
        verification.value = "error";
        verificationError.value = errorMessage(
          reason,
          "settings.library.preferenceSyncError",
        );
      } finally {
        verificationRequest = null;
      }
    })();
    return verificationRequest;
  }

  async function setLikedTitlesOffline(value: boolean): Promise<boolean> {
    const currentScope = scope.value;
    const currentToken = token.value;
    if (
      !currentScope ||
      !currentToken ||
      status.value !== "connected" ||
      verification.value !== "verified" ||
      saving.value
    ) {
      return false;
    }
    saving.value = true;
    verificationError.value = null;
    try {
      const preferences = await updateUserPreferences(
        currentScope.serverAddress,
        currentToken,
        { likedTitlesOffline: value },
      );
      if (
        scope.value?.serverAddress !== currentScope.serverAddress ||
        scope.value?.userId !== currentScope.userId ||
        token.value !== currentToken
      ) {
        return false;
      }
      apply({
        likedTitlesOffline: preferences.likedTitlesOffline,
      });
      return true;
    } catch (reason) {
      if (isAuthenticationRedirectError(reason)) return false;
      verificationError.value = errorMessage(
        reason,
        "settings.library.preferenceSaveError",
      );
      return false;
    } finally {
      saving.value = false;
    }
  }

  watch(
    scope,
    () => {
      const nextKey = scopeKey();
      load();
      if (nextKey !== verificationScope.value) {
        verification.value = "idle";
        verificationScope.value = null;
        verificationError.value = null;
      }
    },
    { immediate: true },
  );
  watch(
    [scope, token, status],
    () => {
      if (status.value === "connected" && scope.value && token.value) {
        void verify();
      }
    },
    { immediate: true },
  );

  return {
    likedTitlesOffline: computed(() => settings.value.likedTitlesOffline),
    verification: computed(() => verification.value),
    verificationError: computed(() => verificationError.value),
    saving: computed(() => saving.value),
    verified: computed(() => verification.value === "verified"),
    verify,
    setLikedTitlesOffline,
  };
}
