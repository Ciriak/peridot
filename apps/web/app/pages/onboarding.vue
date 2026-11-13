<script setup lang="ts">
import {
  definePageMeta,
  navigateTo,
  useHead,
  useI18n,
  useRoute,
} from "#imports";
import logo from "@peridot/ui/assets/brand/logo.svg";
import { Button } from "@peridot/ui/components/ui/button";
import { Gradient } from "@peridot/ui/components/ui/gradient";
import { Input } from "@peridot/ui/components/ui/input";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";
import { useUser } from "../composables/use-user";
import { useLocalizedMessage } from "../composables/use-localized-message";
import {
  createAdministrator,
  createUserSession,
  discoverLocalServers,
  fetchAuthStatus,
  type DiscoveredServer,
} from "../lib/peridot-client";
import {
  DEFAULT_SERVER_ADDRESS,
  normalizeServerAddress,
  safeRedirectPath,
} from "../lib/server-address";

definePageMeta({ layout: false });
const { t } = useI18n();
const { errorMessage } = useLocalizedMessage();
useHead({ title: t("onboarding.title") });
const route = useRoute();
const { address, configure } = useServer();
const { token } = useSession();
const { user } = useUser();
const serverAddress = ref(address.value ?? DEFAULT_SERVER_ADDRESS);
const selectedAddress = ref("");
const opensAccountStep =
  (route.query.auth === "login" || route.query.auth === "setup") &&
  Boolean(address.value);
const step = ref<"server" | "account">(opensAccountStep ? "account" : "server");
const requiresAdminUser = ref(false);
const email = ref("");
const displayName = ref("");
const password = ref("");
const confirmPassword = ref("");
const error = ref("");
const loading = ref(false);
const confirmationError = computed(() =>
  requiresAdminUser.value &&
  confirmPassword.value.length > 0 &&
  password.value !== confirmPassword.value
    ? t("onboarding.passwordsMismatch")
    : "",
);
const addressScanState = ref<"idle" | "checking" | "found" | "not-found">(
  "idle",
);
const discoveryState = ref<"scanning" | "complete" | "failed">("scanning");
const discoveredServers = ref<DiscoveredServer[]>([]);
const selectedServer = ref<DiscoveredServer | null>(null);
const selectedServerHostname = computed(() => {
  const server = selectedServer.value;
  if (!server) return "";
  try {
    return new URL(server.address).hostname;
  } catch {
    return server.host;
  }
});
const manualEntryOpen = ref(false);
let addressScanTimer: ReturnType<typeof setTimeout> | undefined;
let networkScanTimer: ReturnType<typeof setTimeout> | undefined;
let addressScanSequence = 0;

function rememberServer(server: DiscoveredServer, select = false) {
  let remembered = discoveredServers.value.find(
    (item) => item.address === server.address,
  );
  if (!remembered) {
    remembered = server;
    discoveredServers.value.push(remembered);
  }
  if (select || !selectedServer.value) {
    selectedServer.value = remembered;
  }
}

function revealManualEntry() {
  manualEntryOpen.value = true;
  void nextTick(() => {
    document.querySelector<HTMLInputElement>("#server-address")?.focus();
  });
}

async function scanAddress(value: string, select = false) {
  const sequence = ++addressScanSequence;
  let normalized: string;
  try {
    normalized = normalizeServerAddress(value);
  } catch {
    addressScanState.value = "idle";
    return;
  }
  addressScanState.value = "checking";
  try {
    await fetchAuthStatus(normalized);
    if (sequence !== addressScanSequence) return;
    addressScanState.value = "found";
    rememberServer(
      { address: normalized, host: new URL(normalized).host },
      select,
    );
  } catch {
    if (sequence === addressScanSequence) {
      addressScanState.value = "not-found";
    }
  }
}

watch(
  serverAddress,
  (value) => {
    if (addressScanTimer) clearTimeout(addressScanTimer);
    addressScanState.value = "idle";
    addressScanTimer = setTimeout(
      () => void scanAddress(value, manualEntryOpen.value),
      450,
    );
  },
  { immediate: true },
);

async function scanLocalNetwork() {
  if (step.value !== "server") return;
  discoveryState.value = "scanning";
  try {
    const result = await discoverLocalServers();
    for (const server of result.items) rememberServer(server);
    discoveryState.value = "complete";
  } catch {
    discoveryState.value = "failed";
  } finally {
    if (step.value === "server") {
      networkScanTimer = setTimeout(() => void scanLocalNetwork(), 10_000);
    }
  }
}

onMounted(() => {
  if (opensAccountStep) {
    void connectToServer();
  }
  void scanLocalNetwork();
});
onBeforeUnmount(() => {
  if (addressScanTimer) clearTimeout(addressScanTimer);
  if (networkScanTimer) clearTimeout(networkScanTimer);
  addressScanSequence += 1;
});

async function connectToServer(serverAddressOverride?: string) {
  error.value = "";
  loading.value = true;
  try {
    selectedAddress.value = normalizeServerAddress(
      serverAddressOverride ??
        selectedServer.value?.address ??
        serverAddress.value,
    );
    const status = await fetchAuthStatus(selectedAddress.value);
    requiresAdminUser.value = status.requiresAdminUser;
    step.value = "account";
    if (networkScanTimer) clearTimeout(networkScanTimer);
  } catch (reason) {
    step.value = "server";
    error.value = errorMessage(reason, "onboarding.connectError");
  } finally {
    loading.value = false;
  }
}

async function finishOnboarding() {
  error.value = "";
  if (requiresAdminUser.value && password.value !== confirmPassword.value) {
    error.value = t("onboarding.passwordsMismatch");
    return;
  }
  loading.value = true;
  try {
    const session = requiresAdminUser.value
      ? await createAdministrator(selectedAddress.value, {
          email: email.value,
          displayName: displayName.value,
          password: password.value,
        })
      : await createUserSession(selectedAddress.value, {
          email: email.value,
          password: password.value,
        });
    configure(selectedAddress.value);
    token.value = session.token;
    user.value = session.user;
    await navigateTo(safeRedirectPath(route.query.redirect), { replace: true });
  } catch (reason) {
    error.value = errorMessage(reason, "onboarding.setupError");
  } finally {
    loading.value = false;
  }
}

function changeServer() {
  error.value = "";
  email.value = "";
  displayName.value = "";
  password.value = "";
  confirmPassword.value = "";
  user.value = null;
  step.value = "server";
  void scanLocalNetwork();
}
</script>

<template>
  <Gradient
    as="main"
    :colors="['var(--primary)']"
    class="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground"
  >
    <section
      aria-labelledby="onboarding-title"
      class="mx-auto w-full max-w-lg space-y-8 rounded-xl border bg-card p-6 text-card-foreground shadow-xl sm:p-10"
    >
      <div class="space-y-3 text-center">
        <img :src="logo" :alt="t('app.name')" class="mx-auto size-16" />
        <h1 id="onboarding-title" class="text-3xl font-semibold tracking-tight">
          {{
            step === "server"
              ? t("onboarding.serverHeading")
              : requiresAdminUser
                ? t("onboarding.adminHeading")
                : t("onboarding.loginHeading")
          }}
        </h1>
        <p class="text-sm text-muted-foreground">
          {{
            step === "server"
              ? t("onboarding.serverDescription")
              : requiresAdminUser
                ? t("onboarding.adminDescription")
                : t("onboarding.loginDescription")
          }}
        </p>
      </div>
      <div v-if="step === 'server'" class="space-y-4">
        <section :aria-label="t('onboarding.discovery')" class="space-y-3">
          <div v-if="!selectedServer" class="flex items-center gap-3">
            <PeridotSpinner :label="t('onboarding.looking')" class="size-6" />
            <p aria-hidden="true" class="text-sm text-muted-foreground">
              {{ t("onboarding.looking") }}
            </p>
          </div>
          <h2 v-if="selectedServer" class="text-center text-sm font-medium">
            {{ t("onboarding.serverFoundOn") }}
            <strong>{{ selectedServerHostname }}</strong>
          </h2>
          <Button
            type="button"
            class="h-12 w-full text-base"
            :disabled="loading || !selectedServer"
            @click="connectToServer(selectedServer?.address)"
          >
            {{
              loading ? t("onboarding.pleaseWait") : t("onboarding.continue")
            }}
          </Button>
          <p
            v-if="discoveryState === 'failed'"
            role="status"
            class="rounded-md border p-3 text-xs text-muted-foreground"
          >
            {{ t("onboarding.discoveryUnavailable") }}
          </p>
        </section>
        <div class="border-t pt-4">
          <div v-if="!manualEntryOpen" class="flex justify-center">
            <Button
              type="button"
              variant="link"
              size="sm"
              aria-controls="manual-server-entry"
              @click="revealManualEntry"
            >
              {{ t("onboarding.manualEntry") }}
            </Button>
          </div>
          <div v-else id="manual-server-entry" class="space-y-2">
            <label for="server-address" class="text-sm font-medium">
              {{ t("onboarding.serverUrl") }}
            </label>
            <Input
              id="server-address"
              v-model="serverAddress"
              type="text"
              inputmode="url"
              autocomplete="url"
              placeholder="http://192.168.1.20:17430"
              :aria-invalid="Boolean(error)"
              :aria-describedby="error ? 'server-error' : undefined"
            />
            <p
              v-if="addressScanState !== 'idle'"
              role="status"
              class="text-xs"
              :class="
                addressScanState === 'found'
                  ? 'text-primary'
                  : 'text-muted-foreground'
              "
            >
              {{
                addressScanState === "checking"
                  ? t("onboarding.checking")
                  : addressScanState === "found"
                    ? t("onboarding.found")
                    : t("onboarding.notFound")
              }}
            </p>
          </div>
        </div>
        <p
          v-if="error"
          id="server-error"
          role="alert"
          class="text-sm text-destructive"
        >
          {{ error }}
        </p>
      </div>
      <form v-else class="space-y-4" @submit.prevent="finishOnboarding">
        <div class="space-y-2">
          <label for="email" class="text-sm font-medium">{{
            t("onboarding.email")
          }}</label>
          <Input
            id="email"
            v-model="email"
            type="email"
            autocomplete="email"
            required
            maxlength="254"
          />
        </div>
        <div v-if="requiresAdminUser" class="space-y-2">
          <label for="display-name" class="text-sm font-medium">
            {{ t("onboarding.displayName") }}
          </label>
          <Input
            id="display-name"
            v-model="displayName"
            autocomplete="nickname"
            required
            minlength="2"
            maxlength="80"
            aria-describedby="display-name-help"
          />
          <p id="display-name-help" class="text-xs text-muted-foreground">
            {{ t("onboarding.displayNameHelp") }}
          </p>
        </div>
        <div class="space-y-2">
          <label for="password" class="text-sm font-medium">{{
            t("onboarding.password")
          }}</label>
          <Input
            id="password"
            v-model="password"
            type="password"
            :autocomplete="
              requiresAdminUser ? 'new-password' : 'current-password'
            "
            required
            :minlength="requiresAdminUser ? 12 : undefined"
            :aria-invalid="Boolean(error)"
            :aria-describedby="error ? 'account-error' : undefined"
          />
          <p v-if="requiresAdminUser" class="text-xs text-muted-foreground">
            {{ t("onboarding.passwordHelp") }}
          </p>
        </div>
        <div v-if="requiresAdminUser" class="space-y-2">
          <label for="confirm-password" class="text-sm font-medium">
            {{ t("onboarding.confirmPassword") }}
          </label>
          <Input
            id="confirm-password"
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            required
            minlength="12"
            :aria-invalid="Boolean(confirmationError)"
            :aria-describedby="
              confirmationError
                ? 'confirm-password-error'
                : 'confirm-password-help'
            "
          />
          <p
            v-if="confirmationError"
            id="confirm-password-error"
            role="alert"
            class="text-sm text-destructive"
          >
            {{ confirmationError }}
          </p>
          <p
            v-else
            id="confirm-password-help"
            class="text-xs text-muted-foreground"
          >
            {{ t("onboarding.confirmPasswordHelp") }}
          </p>
        </div>
        <div>
          <p
            v-if="error"
            id="account-error"
            role="alert"
            class="text-sm text-destructive"
          >
            {{ error }}
          </p>
        </div>
        <div class="flex gap-3">
          <Button
            type="button"
            variant="outline"
            class="flex-1"
            @click="changeServer"
          >
            {{ t("onboarding.back") }}
          </Button>
          <Button
            type="submit"
            class="flex-1"
            :disabled="loading || Boolean(confirmationError)"
          >
            {{
              loading
                ? t("onboarding.pleaseWait")
                : requiresAdminUser
                  ? t("onboarding.createAdministrator")
                  : t("onboarding.signIn")
            }}
          </Button>
        </div>
      </form>
    </section>
  </Gradient>
</template>
