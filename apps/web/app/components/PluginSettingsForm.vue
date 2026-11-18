<script setup lang="ts">
import type {
  PluginConfigurationFieldDefinition,
  PluginResponse,
} from "@peridot/contracts";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "#imports";
import { useLocalizedMessage } from "../composables/use-localized-message";
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";
import {
  isAuthenticationRedirectError,
  updatePluginSettings,
} from "../lib/peridot-client";

const props = defineProps<{ plugin: PluginResponse }>();
const emit = defineEmits<{ saved: [plugin: PluginResponse] }>();
const { t } = useI18n();
const { translate, errorMessage } = useLocalizedMessage();
const { address } = useServer();
const { token } = useSession();
const configuration = reactive<Record<string, string>>({});
const credentials = reactive<Record<string, string>>({});
const saving = ref(false);
const saveError = ref("");
const saved = ref(false);
const fields = computed(() => props.plugin.settings.fields);

function reset() {
  for (const key of Object.keys(configuration)) delete configuration[key];
  for (const key of Object.keys(credentials)) delete credentials[key];
  for (const field of fields.value) {
    configuration[field.key] = field.secret
      ? ""
      : (props.plugin.settings.configuration[field.key] ?? "");
    if (field.secret) credentials[field.key] = "";
  }
  saveError.value = "";
  saved.value = false;
}

watch(
  () => props.plugin,
  () => reset(),
  { immediate: true, deep: true },
);

function inputValue(field: PluginConfigurationFieldDefinition): string {
  return field.secret
    ? (credentials[field.key] ?? "")
    : (configuration[field.key] ?? "");
}

function setInputValue(
  field: PluginConfigurationFieldDefinition,
  value: string | number,
) {
  if (field.secret) credentials[field.key] = String(value);
  else configuration[field.key] = String(value);
  saved.value = false;
}

async function save() {
  if (!address.value || !token.value || saving.value) return;
  saving.value = true;
  saveError.value = "";
  saved.value = false;
  try {
    const credentialValues = Object.fromEntries(
      fields.value
        .filter((field) => field.secret)
        .flatMap((field) => {
          const value = credentials[field.key]?.trim() ?? "";
          return value ? [[field.key, value] as const] : [];
        }),
    );
    const updated = await updatePluginSettings(
      address.value,
      token.value,
      props.plugin.id,
      {
        configuration: { ...configuration },
        ...(Object.keys(credentialValues).length
          ? { credentials: credentialValues }
          : {}),
      },
    );
    saved.value = true;
    emit("saved", updated);
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    saveError.value = errorMessage(
      reason,
      "settings.plugins.settingsSaveError",
    );
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form
    v-if="fields.length"
    class="mt-4 space-y-3 border-t pt-4"
    @submit.prevent="save"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h5 class="text-sm font-semibold">
        {{ t("settings.plugins.settings") }}
      </h5>
      <p
        class="text-xs text-muted-foreground"
        :class="{ 'text-primary': plugin.settings.configured }"
      >
        {{
          plugin.settings.configured
            ? t("settings.plugins.configured")
            : t("settings.plugins.notConfigured")
        }}
      </p>
    </div>
    <div v-for="field in fields" :key="field.key" class="space-y-1.5">
      <label
        :for="`plugin-${plugin.id}-${field.key}`"
        class="text-sm font-medium"
      >
        {{ translate(field.labelMessage, field.key) }}
        <span v-if="field.required" class="text-destructive">*</span>
      </label>
      <Input
        :id="`plugin-${plugin.id}-${field.key}`"
        :model-value="inputValue(field)"
        :type="field.type === 'password' ? 'password' : field.type"
        :required="field.required"
        :autocomplete="field.secret ? 'new-password' : 'off'"
        :placeholder="
          field.placeholderMessage
            ? translate(field.placeholderMessage)
            : undefined
        "
        @update:model-value="setInputValue(field, $event)"
      />
      <p v-if="field.helpMessage" class="text-xs text-muted-foreground">
        {{ translate(field.helpMessage) }}
      </p>
    </div>
    <p v-if="saveError" role="alert" class="text-sm text-destructive">
      {{ saveError }}
    </p>
    <p v-else-if="saved" role="status" class="text-sm text-muted-foreground">
      {{ t("settings.plugins.settingsSaved") }}
    </p>
    <Button type="submit" size="sm" :disabled="saving || !address || !token">
      {{
        saving
          ? t("settings.plugins.savingSettings")
          : t("settings.plugins.saveSettings")
      }}
    </Button>
  </form>
</template>
