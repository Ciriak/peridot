<script setup lang="ts">
import { definePageMeta, useI18n } from "#imports";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import { computed, ref, watch } from "vue";
import { useServer } from "../../composables/use-server";
import { useSession } from "../../composables/use-session";
import { useUser } from "../../composables/use-user";
import { useLocalizedMessage } from "../../composables/use-localized-message";
import {
  isAuthenticationRedirectError,
  updateUserProfile,
} from "../../lib/peridot-client";

definePageMeta({ layout: "settings" });

const { t } = useI18n();
const { errorMessage } = useLocalizedMessage();
const { address } = useServer();
const { token } = useSession();
const { user } = useUser();
const displayName = ref(user.value?.displayName ?? "");
const saving = ref(false);
const saved = ref(false);
const error = ref("");
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
</script>

<template>
  <div class="space-y-6">
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
        <label for="account-email" class="text-sm font-medium">{{
          t("settings.account.email")
        }}</label>
        <Input
          id="account-email"
          :model-value="user?.email ?? ''"
          type="email"
          readonly
          autocomplete="email"
        />
        <p class="text-xs text-muted-foreground">
          {{ t("settings.account.emailHelp") }}
        </p>
      </div>

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

      <Button
        type="submit"
        :disabled="saving || !displayNameValid"
        :aria-busy="saving"
      >
        {{ saving ? t("common.saving") : t("common.saveChanges") }}
      </Button>
    </form>
  </div>
</template>
