<script setup lang="ts">
import { definePageMeta, navigateTo, useHead, useRoute } from "#imports";
import logo from "@peridot/ui/assets/brand/logo.svg";
import logoW from "@peridot/ui/assets/brand/logo-w.png";
import { Button } from "@peridot/ui/components/ui/button";
import { Gradient } from "@peridot/ui/components/ui/gradient";
import { Input } from "@peridot/ui/components/ui/input";
import { Spinner } from "@peridot/ui/components/ui/spinner";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useServer } from "../composables/use-server";
import { useSession } from "../composables/use-session";
import { useUser } from "../composables/use-user";
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
useHead({ title: "Set up Peridot" });
const route = useRoute();
const { address, configure } = useServer();
const { token } = useSession();
const { user } = useUser();
const serverAddress = ref(address.value ?? DEFAULT_SERVER_ADDRESS);
const selectedAddress = ref("");
const step = ref<"server" | "account">("server");
const requiresAdminUser = ref(false);
const email = ref("");
const username = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);
const addressScanState = ref<"idle" | "checking" | "found" | "not-found">(
  "idle",
);
const discoveryState = ref<"scanning" | "complete" | "failed">("scanning");
const discoveredServers = ref<DiscoveredServer[]>([]);
const manualEntryOpen = ref(false);
let addressScanTimer: ReturnType<typeof setTimeout> | undefined;
let networkScanTimer: ReturnType<typeof setTimeout> | undefined;
let addressScanSequence = 0;

function rememberServer(server: DiscoveredServer) {
  if (
    !discoveredServers.value.some((item) => item.address === server.address)
  ) {
    discoveredServers.value.push(server);
  }
}

function revealManualEntry() {
  manualEntryOpen.value = true;
  void nextTick(() => {
    document.querySelector<HTMLInputElement>("#server-address")?.focus();
  });
}

async function scanAddress(value: string) {
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
    rememberServer({ address: normalized, host: new URL(normalized).host });
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
    addressScanTimer = setTimeout(() => void scanAddress(value), 450);
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

async function selectDiscoveredServer(server: DiscoveredServer) {
  serverAddress.value = server.address;
  await connectToServer();
}

onMounted(() => void scanLocalNetwork());
onBeforeUnmount(() => {
  if (addressScanTimer) clearTimeout(addressScanTimer);
  if (networkScanTimer) clearTimeout(networkScanTimer);
  addressScanSequence += 1;
});

async function connectToServer() {
  error.value = "";
  loading.value = true;
  try {
    selectedAddress.value = normalizeServerAddress(serverAddress.value);
    const status = await fetchAuthStatus(selectedAddress.value);
    requiresAdminUser.value = status.requiresAdminUser;
    step.value = "account";
    if (networkScanTimer) clearTimeout(networkScanTimer);
  } catch (reason) {
    error.value =
      reason instanceof Error
        ? reason.message
        : "Could not connect to Peridot.";
  } finally {
    loading.value = false;
  }
}

async function finishOnboarding() {
  error.value = "";
  loading.value = true;
  try {
    const session = requiresAdminUser.value
      ? await createAdministrator(selectedAddress.value, {
          email: email.value,
          username: username.value,
          password: password.value,
        })
      : await createUserSession(selectedAddress.value, {
          identifier: username.value,
          password: password.value,
        });
    configure(selectedAddress.value);
    token.value = session.token;
    user.value = session.user;
    await navigateTo(safeRedirectPath(route.query.redirect), { replace: true });
  } catch (reason) {
    error.value =
      reason instanceof Error
        ? reason.message
        : "Peridot could not complete account setup.";
  } finally {
    loading.value = false;
  }
}

function changeServer() {
  error.value = "";
  email.value = "";
  password.value = "";
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
        <img :src="logo" alt="Peridot" class="mx-auto size-16" />
        <h1 id="onboarding-title" class="text-3xl font-semibold tracking-tight">
          {{
            step === "server"
              ? "Your music starts at home."
              : requiresAdminUser
                ? "Create your administrator."
                : "Welcome back."
          }}
        </h1>
        <p class="text-sm text-muted-foreground">
          {{
            step === "server"
              ? "Connect to your self-hosted Peridot server."
              : requiresAdminUser
                ? "This server has no users yet. Its first account is required and receives administrator privileges."
                : "Sign in to continue to this Peridot server."
          }}
        </p>
      </div>
      <div v-if="step === 'server'" class="space-y-4">
        <section aria-label="Server discovery" class="space-y-3">
          <div class="flex items-center gap-3">
            <Spinner
              label="Looking for a server on this network"
              class="size-6"
            />
            <p aria-hidden="true" class="text-sm text-muted-foreground">
              Looking for a server on this network
            </p>
          </div>
          <div v-if="discoveredServers.length" class="space-y-2">
            <h2 class="text-sm font-medium">Servers found</h2>
            <ul class="space-y-2">
              <li v-for="server in discoveredServers" :key="server.address">
                <Button
                  type="button"
                  class="h-auto w-full justify-between gap-2 py-3"
                  @click="selectDiscoveredServer(server)"
                >
                  <span class="truncate">{{ server.address }}</span>
                  <img
                    :src="logoW"
                    alt=""
                    aria-hidden="true"
                    class="size-4 shrink-0"
                  />
                </Button>
              </li>
            </ul>
          </div>
          <p
            v-if="discoveryState === 'failed'"
            role="status"
            class="rounded-md border p-3 text-xs text-muted-foreground"
          >
            Discovery unavailable.
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
              Enter the server address manually
            </Button>
          </div>
          <div v-else id="manual-server-entry" class="space-y-2">
            <label for="server-address" class="text-sm font-medium">
              Server URL
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
                  ? "Checking this address…"
                  : addressScanState === "found"
                    ? "Peridot instance found."
                    : "No server responded at this address."
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
        <div v-if="requiresAdminUser" class="space-y-2">
          <label for="email" class="text-sm font-medium">Email</label>
          <Input
            id="email"
            v-model="email"
            type="email"
            autocomplete="email"
            required
            maxlength="254"
          />
        </div>
        <div class="space-y-2">
          <label for="username" class="text-sm font-medium">{{
            requiresAdminUser ? "Username" : "Username or email"
          }}</label>
          <Input
            id="username"
            v-model="username"
            autocomplete="username"
            required
            :minlength="requiresAdminUser ? 3 : undefined"
            :maxlength="requiresAdminUser ? 32 : 254"
            :aria-describedby="requiresAdminUser ? 'username-help' : undefined"
          />
          <p
            v-if="requiresAdminUser"
            id="username-help"
            class="text-xs text-muted-foreground"
          >
            Use 3–32 letters, numbers, dots, underscores, or hyphens.
          </p>
        </div>
        <div class="space-y-2">
          <label for="password" class="text-sm font-medium">Password</label>
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
            Use at least 12 characters.
          </p>
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
            Back
          </Button>
          <Button type="submit" class="flex-1" :disabled="loading">
            {{
              loading
                ? "Please wait…"
                : requiresAdminUser
                  ? "Create administrator"
                  : "Sign in"
            }}
          </Button>
        </div>
      </form>
    </section>
  </Gradient>
</template>
