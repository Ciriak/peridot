<script setup lang="ts">
import { useI18n } from "#imports";
import { Icon } from "@iconify/vue/offline";
import type { AdminMediaFieldValue } from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import { computed, ref, watch } from "vue";
import { icons } from "../lib/icons";

type Editor =
  | "text"
  | "textarea"
  | "number"
  | "datetime"
  | "select"
  | "boolean"
  | "list"
  | "json";

const props = withDefaults(
  defineProps<{
    label: string;
    value: AdminMediaFieldValue;
    editor?: Editor;
    options?: readonly { label: string; value: string }[];
    manual?: boolean;
    readonly?: boolean;
    save?: (value: AdminMediaFieldValue) => Promise<void>;
    reset?: () => Promise<void>;
  }>(),
  {
    editor: "text",
    options: () => [],
    manual: false,
    readonly: false,
  },
);
const { t } = useI18n();
const focused = ref(false);
const draft = ref("");
const state = ref<"idle" | "saving" | "saved" | "error">("idle");
const errorText = ref("");
const saving = computed(() => state.value === "saving");

function datetimeLocal(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function displayValue(value: AdminMediaFieldValue): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return props.editor === "json"
      ? JSON.stringify(value, null, 2)
      : value.join(", ");
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (props.editor === "datetime") return datetimeLocal(String(value));
  return String(value);
}

function syncDraft() {
  if (focused.value || saving.value) return;
  draft.value = displayValue(props.value);
}

watch(() => props.value, syncDraft, { immediate: true });

function parseDraft(): AdminMediaFieldValue {
  const value = draft.value.trim();
  if (props.editor === "number") {
    return value === "" ? null : Number(value);
  }
  if (props.editor === "boolean") return value === "true";
  if (props.editor === "list") {
    return value
      ? value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];
  }
  if (props.editor === "json") {
    if (!value) return [];
    return JSON.parse(value) as AdminMediaFieldValue;
  }
  if (props.editor === "datetime") {
    return value ? new Date(value).toISOString() : null;
  }
  return draft.value;
}

function sameAsCurrent(next: AdminMediaFieldValue): boolean {
  if (Array.isArray(next) && Array.isArray(props.value)) {
    return JSON.stringify(next) === JSON.stringify(props.value);
  }
  const current = props.value ?? null;
  const normalized = next === "" ? null : next;
  return normalized === current;
}

async function commit() {
  if (props.readonly || !props.save || saving.value) return;
  let next: AdminMediaFieldValue;
  try {
    next = parseDraft();
    if (sameAsCurrent(next)) {
      state.value = "idle";
      return;
    }
  } catch {
    state.value = "error";
    errorText.value = t("settings.medias.invalidJson");
    return;
  }
  state.value = "saving";
  errorText.value = "";
  try {
    await props.save(next);
    state.value = "saved";
    draft.value = displayValue(next);
  } catch (error) {
    state.value = "error";
    errorText.value =
      error instanceof Error ? error.message : t("settings.medias.saveError");
    draft.value = displayValue(props.value);
  }
}

async function resetValue() {
  if (!props.reset || saving.value) return;
  state.value = "saving";
  errorText.value = "";
  try {
    await props.reset();
    state.value = "saved";
  } catch (error) {
    state.value = "error";
    errorText.value =
      error instanceof Error ? error.message : t("settings.medias.resetError");
  }
}

function cancel() {
  focused.value = false;
  state.value = "idle";
  errorText.value = "";
  draft.value = displayValue(props.value);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    cancel();
    (event.target as HTMLElement).blur();
    return;
  }
  if (
    event.key === "Enter" &&
    (props.editor !== "textarea" || event.ctrlKey || event.metaKey)
  ) {
    event.preventDefault();
    void commit().then(() => (event.target as HTMLElement).blur());
  }
}
</script>

<template>
  <div class="space-y-1.5">
    <div class="flex min-h-5 items-center gap-2">
      <label
        :for="`admin-field-${label.replaceAll(' ', '-')}`"
        class="text-xs font-medium text-muted-foreground"
      >
        {{ label }}
      </label>
      <Badge v-if="manual" variant="secondary" class="px-1.5 py-0 text-xs">
        {{ t("settings.medias.manual") }}
      </Badge>
      <PeridotSpinner
        v-if="saving"
        :label="t('common.saving')"
        class="ml-auto size-3.5"
      />
      <Icon
        v-else-if="state === 'saved'"
        :icon="icons.check"
        aria-hidden="true"
        class="ml-auto size-3.5 text-success"
      />
      <Button
        v-if="manual && reset && !readonly"
        type="button"
        variant="ghost"
        size="icon-sm"
        :disabled="saving"
        :aria-label="t('settings.medias.resetField', { field: label })"
        @click="resetValue"
      >
        <Icon :icon="icons.restart" aria-hidden="true" class="size-3.5" />
      </Button>
    </div>

    <slot v-if="readonly">
      <Input :model-value="displayValue(value)" readonly />
    </slot>
    <textarea
      v-else-if="editor === 'textarea' || editor === 'json'"
      :id="`admin-field-${label.replaceAll(' ', '-')}`"
      v-model="draft"
      rows="3"
      :readonly="readonly"
      class="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      @focus="focused = true"
      @blur="
        focused = false;
        void commit();
      "
      @keydown="onKeydown"
    />
    <select
      v-else-if="editor === 'select' || editor === 'boolean'"
      :id="`admin-field-${label.replaceAll(' ', '-')}`"
      v-model="draft"
      class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      @focus="focused = true"
      @blur="
        focused = false;
        void commit();
      "
      @keydown="onKeydown"
    >
      <option v-if="!options.length && editor !== 'boolean'" value="">
        {{ t("common.notConfigured") }}
      </option>
      <option
        v-for="option in editor === 'boolean'
          ? [
              { label: t('common.enable'), value: 'true' },
              { label: t('common.disable'), value: 'false' },
            ]
          : options"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>
    <Input
      v-else
      :id="`admin-field-${label.replaceAll(' ', '-')}`"
      v-model="draft"
      :type="
        editor === 'number'
          ? 'number'
          : editor === 'datetime'
            ? 'datetime-local'
            : 'text'
      "
      :readonly="readonly"
      @focus="focused = true"
      @blur="
        focused = false;
        void commit();
      "
      @keydown="onKeydown"
    />
    <p v-if="errorText" role="alert" class="text-xs text-destructive">
      {{ errorText }}
    </p>
  </div>
</template>
