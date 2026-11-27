<script setup lang="ts">
import { definePageMeta, navigateTo, useI18n, useRoute } from "#imports";
import { Icon } from "@iconify/vue/offline";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from "reka-ui";
import { computed, ref, watch } from "vue";
import { useServer } from "../../composables/use-server";
import { useSession } from "../../composables/use-session";
import { useUser } from "../../composables/use-user";
import { useLocalizedMessage } from "../../composables/use-localized-message";
import { icons } from "../../lib/icons";
import { clearDownloadTasks } from "../../lib/download-tasks";
import { logoutImmediately } from "../../lib/logout";
import { clearAllOfflineTracks } from "../../lib/offline-audio";
import {
  isAuthenticationRedirectError,
  revokeSession,
  updateUserProfile,
} from "../../lib/peridot-client";
import { clearAllPeridotQueries } from "../../lib/query-persister";

definePageMeta({ layout: "settings" });

const { t } = useI18n();
const route = useRoute();
const { errorMessage } = useLocalizedMessage();
const { address } = useServer();
const { token } = useSession();
const { user } = useUser();
const displayName = ref(user.value?.displayName ?? "");
const saving = ref(false);
const saved = ref(false);
const error = ref("");
const logoutOpen = ref(false);
const loggingOut = ref(false);
const normalizedLength = computed(
  () => Array.from(displayName.value.trim().replace(/\s+/gu, " ")).length,
);
const displayNameValid = computed(
  () => normalizedLength.value >= 2 && normalizedLength.value <= 80,
);

watch(
  () => user.value?.displayName,
  (value) => {
    displayName.value = value ?? "";
  },
  { immediate: true },
);

watch(displayName, (value) => {
  if (value !== user.value?.displayName) saved.value = false;
});

async function saveProfile() {
  error.value = "";
  saved.value = false;
  if (!displayNameValid.value) {
    error.value = t("settings.account.invalid");
    return;
  }
  if (!address.value || !token.value) {
    error.value = t("settings.account.disconnected");
    return;
  }

  saving.value = true;
  try {
    const updated = await updateUserProfile(address.value, token.value, {
      displayName: displayName.value,
    });
    user.value = updated;
    displayName.value = updated.displayName;
    saved.value = true;
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    error.value = errorMessage(reason, "settings.account.saveError");
  } finally {
    saving.value = false;
  }
}

function requestLogout() {
  if (!loggingOut.value) logoutOpen.value = true;
}

async function confirmLogout() {
  if (loggingOut.value) return;
  loggingOut.value = true;
  const currentAddress = address.value;
  const currentToken = token.value;
  const redirect = route.fullPath;
  try {
    await logoutImmediately({
      clearCredentials() {
        token.value = null;
        user.value = null;
        logoutOpen.value = false;
      },
      redirectToLogin() {
        return navigateTo(
          {
            path: "/onboarding",
            query: { auth: "login", redirect },
          },
          { replace: true },
        );
      },
      clearServerSession() {
        return currentAddress && currentToken
          ? revokeSession(currentAddress, currentToken)
          : Promise.resolve();
      },
      async clearDeviceData() {
        await Promise.all([
          clearAllPeridotQueries(),
          clearAllOfflineTracks(),
          clearDownloadTasks(),
        ]);
      },
    });
  } finally {
    loggingOut.value = false;
  }
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-6">
    <div class="space-y-2">
      <h2 class="text-2xl font-semibold tracking-tight">
        {{ t("settings.account.title") }}
      </h2>
      <p class="text-sm text-muted-foreground">
        {{ t("settings.account.description") }}
      </p>
    </div>

    <form
      class="max-w-lg space-y-5 rounded-lg border bg-card p-6 text-card-foreground"
      @submit.prevent="saveProfile"
    >
      <div class="space-y-2">
        <label for="account-display-name" class="text-sm font-medium">
          {{ t("settings.account.displayName") }}
        </label>
        <Input
          id="account-display-name"
          v-model="displayName"
          type="text"
          autocomplete="nickname"
          required
          minlength="2"
          maxlength="80"
          :aria-invalid="Boolean(error)"
          :aria-describedby="
            error ? 'account-profile-error' : 'account-display-name-help'
          "
          @blur="saveProfile"
        />
        <p id="account-display-name-help" class="text-xs text-muted-foreground">
          {{ t("settings.account.displayNameHelp") }}
        </p>
        <p
          v-if="error"
          id="account-profile-error"
          role="alert"
          class="text-sm text-destructive"
        >
          {{ error }}
        </p>
        <p v-else-if="saved" role="status" class="text-sm text-success">
          {{ t("settings.account.updated") }}
        </p>
      </div>

      <p v-if="saving" role="status" class="text-sm text-muted-foreground">
        {{ t("common.saving") }}
      </p>
    </form>

    <div class="mt-auto flex justify-end">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="text-muted-foreground"
        :disabled="loggingOut"
        :aria-busy="loggingOut"
        @click="requestLogout"
      >
        <Icon :icon="icons.logout" aria-hidden="true" class="size-4" />
        {{ loggingOut ? t("navigation.loggingOut") : t("navigation.logOut") }}
      </Button>
    </div>

    <AlertDialogRoot v-model:open="logoutOpen">
      <AlertDialogPortal>
        <AlertDialogOverlay class="fixed inset-0 z-50 bg-background/80" />
        <AlertDialogContent
          class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
        >
          <AlertDialogTitle class="text-lg font-semibold">
            {{ t("navigation.logOutTitle") }}
          </AlertDialogTitle>
          <AlertDialogDescription class="text-sm text-muted-foreground">
            {{ t("navigation.logOutDescription") }}
          </AlertDialogDescription>
          <div class="mt-6 flex justify-end gap-3">
            <AlertDialogCancel as-child>
              <Button type="button" variant="outline">{{
                t("common.cancel")
              }}</Button>
            </AlertDialogCancel>
            <AlertDialogAction as-child @click="confirmLogout">
              <Button type="button" variant="destructive">{{
                t("navigation.logOut")
              }}</Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialogRoot>
  </div>
</template>
