<script setup lang="ts">
import { definePageMeta } from "#imports";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import { computed, ref, watch } from "vue";
import { useServer } from "../../composables/use-server";
import { useSession } from "../../composables/use-session";
import { useUser } from "../../composables/use-user";
import {
  isAuthenticationRedirectError,
  updateUserProfile,
} from "../../lib/peridot-client";

definePageMeta({ layout: "settings" });

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
    error.value = "Use a display name between 2 and 80 characters.";
    return;
  }
  if (!address.value || !token.value) {
    error.value = "Connect to your Peridot server and sign in again.";
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
    error.value =
      reason instanceof Error
        ? reason.message
        : "Peridot could not update your profile.";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <h2 class="text-2xl font-semibold tracking-tight">Profile</h2>
      <p class="text-sm text-muted-foreground">
        Manage the profile shown to other people who use this server.
      </p>
    </div>

    <form
      class="max-w-lg space-y-5 rounded-lg border bg-card p-6 text-card-foreground"
      @submit.prevent="saveProfile"
    >
      <div class="space-y-2">
        <label for="account-email" class="text-sm font-medium">Email</label>
        <Input
          id="account-email"
          :model-value="user?.email ?? ''"
          type="email"
          readonly
          autocomplete="email"
        />
        <p class="text-xs text-muted-foreground">
          Your email is your sign-in address and cannot be changed here.
        </p>
      </div>

      <div class="space-y-2">
        <label for="account-display-name" class="text-sm font-medium">
          Display name
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
          Use 2–80 characters. Display names are unique across this server.
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
          Display name updated.
        </p>
      </div>

      <Button
        type="submit"
        :disabled="saving || !displayNameValid"
        :aria-busy="saving"
      >
        {{ saving ? "Saving…" : "Save changes" }}
      </Button>
    </form>
  </div>
</template>
