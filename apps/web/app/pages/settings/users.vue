<script setup lang="ts">
import { computed, definePageMeta, onMounted, ref } from "#imports";
import { Icon } from "@iconify/vue/offline";
import logo from "@peridot/ui/assets/brand/logo.svg";
import type {
  CreateUserRequest,
  UpdateUserRequest,
  UserResponse,
  UserRole,
} from "@peridot/contracts";
import { Badge } from "@peridot/ui/components/ui/badge";
import { Button } from "@peridot/ui/components/ui/button";
import { Input } from "@peridot/ui/components/ui/input";
import { PeridotSpinner } from "@peridot/ui/components/ui/spinner";
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import { useServer } from "../../composables/use-server";
import { useSession } from "../../composables/use-session";
import { useUser } from "../../composables/use-user";
import { icons } from "../../lib/icons";
import { gravatarUrl } from "../../lib/gravatar";
import {
  managedPasswordConfirmationError,
  managedPasswordPairValid,
} from "../../lib/user-management";
import {
  createManagedUser,
  deleteManagedUser,
  isAuthenticationRedirectError,
  listUsers,
  updateManagedUser,
} from "../../lib/peridot-client";

definePageMeta({ layout: "settings" });

const { address } = useServer();
const { token } = useSession();
const { user } = useUser();
const canManageUsers = computed(() => user.value?.role === "admin");
const users = ref<UserResponse[]>([]);
const loading = ref(true);
const pageError = ref("");
const pageNotice = ref("");
const failedAvatarKeys = ref<Set<string>>(new Set());

const userDialogOpen = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const editingUser = ref<UserResponse | null>(null);
const formEmail = ref("");
const formDisplayName = ref("");
const formPassword = ref("");
const formPasswordConfirmation = ref("");
const formRole = ref<UserRole>("member");
const formError = ref("");
const saving = ref(false);

const deleteOpen = ref(false);
const pendingDelete = ref<UserResponse | null>(null);
const deleting = ref(false);

const editingSelf = computed(() => editingUser.value?.id === user.value?.id);
const normalizedDisplayNameLength = computed(
  () => Array.from(formDisplayName.value.trim().replace(/\s+/gu, " ")).length,
);
const passwordRequired = computed(() => dialogMode.value === "create");
const passwordPairValid = computed(() =>
  managedPasswordPairValid(
    formPassword.value,
    formPasswordConfirmation.value,
    passwordRequired.value,
  ),
);
const passwordConfirmationError = computed(() =>
  managedPasswordConfirmationError(
    formPassword.value,
    formPasswordConfirmation.value,
  ),
);
const formValid = computed(
  () =>
    Boolean(formEmail.value.trim()) &&
    normalizedDisplayNameLength.value >= 2 &&
    normalizedDisplayNameLength.value <= 80 &&
    passwordPairValid.value,
);

function roleLabel(role: UserRole): string {
  return role === "admin" ? "Administrator" : "User";
}

function avatarKey(account: UserResponse): string {
  return `${account.id}\u0000${account.email}`;
}

function avatarSource(account: UserResponse): string {
  return failedAvatarKeys.value.has(avatarKey(account))
    ? logo
    : gravatarUrl(account.email, 80);
}

function markAvatarFailed(account: UserResponse) {
  failedAvatarKeys.value = new Set([
    ...failedAvatarKeys.value,
    avatarKey(account),
  ]);
}

function resetForm() {
  editingUser.value = null;
  formEmail.value = "";
  formDisplayName.value = "";
  formPassword.value = "";
  formPasswordConfirmation.value = "";
  formRole.value = "member";
  formError.value = "";
}

function openCreateDialog() {
  resetForm();
  dialogMode.value = "create";
  userDialogOpen.value = true;
}

function openEditDialog(account: UserResponse) {
  resetForm();
  dialogMode.value = "edit";
  editingUser.value = account;
  formEmail.value = account.email;
  formDisplayName.value = account.displayName;
  formRole.value = account.role;
  userDialogOpen.value = true;
}

function closeUserDialog() {
  userDialogOpen.value = false;
  resetForm();
}

function setRole(role: UserRole) {
  if (editingSelf.value) return;
  formRole.value = role;
}

async function loadUsers() {
  if (!canManageUsers.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  pageError.value = "";
  try {
    const result = await listUsers(address.value ?? "", token.value ?? "");
    users.value = result.items;
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    pageError.value =
      reason instanceof Error
        ? reason.message
        : "Could not load user accounts.";
  } finally {
    loading.value = false;
  }
}

async function saveAccount() {
  if (!formValid.value || saving.value) return;
  formError.value = "";
  pageNotice.value = "";
  saving.value = true;
  try {
    let saved: UserResponse;
    if (dialogMode.value === "create") {
      const account: CreateUserRequest = {
        email: formEmail.value,
        displayName: formDisplayName.value,
        password: formPassword.value,
        role: formRole.value,
      };
      saved = await createManagedUser(
        address.value ?? "",
        token.value ?? "",
        account,
      );
      pageNotice.value = `Created ${saved.displayName}.`;
    } else if (editingUser.value) {
      const update: UpdateUserRequest = {
        email: formEmail.value,
        displayName: formDisplayName.value,
      };
      if (!editingSelf.value) update.role = formRole.value;
      if (formPassword.value) update.password = formPassword.value;
      saved = await updateManagedUser(
        address.value ?? "",
        token.value ?? "",
        editingUser.value.id,
        update,
      );
      if (saved.id === user.value?.id) user.value = saved;
      pageNotice.value = `Updated ${saved.displayName}.`;
    } else {
      return;
    }
    closeUserDialog();
    await loadUsers();
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    formError.value =
      reason instanceof Error
        ? reason.message
        : "Peridot could not save this account.";
  } finally {
    saving.value = false;
  }
}

function requestDelete(account: UserResponse) {
  if (account.id === user.value?.id) return;
  pendingDelete.value = account;
  pageError.value = "";
  pageNotice.value = "";
  deleteOpen.value = true;
}

async function confirmDelete() {
  if (!pendingDelete.value || deleting.value) return;
  deleting.value = true;
  pageError.value = "";
  try {
    const displayName = pendingDelete.value.displayName;
    await deleteManagedUser(
      address.value ?? "",
      token.value ?? "",
      pendingDelete.value.id,
    );
    pendingDelete.value = null;
    pageNotice.value = `Deleted ${displayName}.`;
    await loadUsers();
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    pageError.value =
      reason instanceof Error
        ? reason.message
        : "Peridot could not delete this account.";
  } finally {
    deleting.value = false;
  }
}

onMounted(() => void loadUsers());
</script>

<template>
  <div class="space-y-2">
    <h2 class="text-2xl font-semibold tracking-tight">User Management</h2>
    <p class="text-sm text-muted-foreground">
      Create accounts and control who can administer this Peridot server.
    </p>
  </div>

  <section
    v-if="!canManageUsers"
    role="alert"
    class="rounded-lg border bg-card p-6 text-sm text-card-foreground"
  >
    Administrator access is required to manage user accounts.
  </section>

  <section v-else aria-labelledby="user-accounts-heading" class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-2">
        <h3 id="user-accounts-heading" class="text-lg font-semibold">
          User accounts
        </h3>
        <Badge variant="outline">{{ users.length }}</Badge>
      </div>
      <Button type="button" size="sm" @click="openCreateDialog">
        <Icon :icon="icons.userPlus" aria-hidden="true" class="size-4" />
        Add account
      </Button>
    </div>

    <p v-if="pageError" role="alert" class="text-sm text-destructive">
      {{ pageError }}
    </p>
    <p v-else-if="pageNotice" role="status" class="text-sm text-success">
      {{ pageNotice }}
    </p>

    <div class="rounded-lg border bg-card text-card-foreground">
      <div
        v-if="loading && !users.length"
        role="status"
        class="flex items-center gap-2 p-6 text-sm text-muted-foreground"
      >
        <PeridotSpinner class="size-5" />
        Loading user accounts…
      </div>
      <ul v-else-if="users.length" class="divide-y">
        <li
          v-for="account in users"
          :key="account.id"
          class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
        >
          <img
            :src="avatarSource(account)"
            alt=""
            class="size-10 shrink-0 rounded-full object-cover"
            @error="markAvatarFailed(account)"
          />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="truncate font-medium">{{ account.displayName }}</p>
              <Badge
                :variant="account.role === 'admin' ? 'default' : 'secondary'"
              >
                {{ roleLabel(account.role) }}
              </Badge>
              <Badge v-if="account.id === user?.id" variant="outline">
                You
              </Badge>
            </div>
            <p class="truncate text-sm text-muted-foreground">
              {{ account.email }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              :aria-label="`Edit ${account.displayName}`"
              @click="openEditDialog(account)"
            >
              <Icon :icon="icons.edit" aria-hidden="true" class="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="text-destructive"
              :disabled="account.id === user?.id"
              :aria-label="`Delete ${account.displayName}`"
              :title="
                account.id === user?.id
                  ? 'You cannot delete your own account'
                  : undefined
              "
              @click="requestDelete(account)"
            >
              <Icon :icon="icons.trash" aria-hidden="true" class="size-4" />
            </Button>
          </div>
        </li>
      </ul>
      <p v-else class="p-6 text-sm text-muted-foreground">
        No user accounts found.
      </p>
    </div>
  </section>

  <DialogRoot v-model:open="userDialogOpen">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 max-h-dvh w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
      >
        <form class="space-y-5" @submit.prevent="saveAccount">
          <div class="space-y-1">
            <DialogTitle class="text-lg font-semibold">
              {{ dialogMode === "create" ? "Add account" : "Edit account" }}
            </DialogTitle>
            <DialogDescription class="text-sm text-muted-foreground">
              {{
                dialogMode === "create"
                  ? "Create a user or another administrator account."
                  : `Update ${editingUser?.displayName ?? "this account"}.`
              }}
            </DialogDescription>
          </div>

          <div class="space-y-2">
            <label for="managed-user-email" class="text-sm font-medium">
              Email
            </label>
            <Input
              id="managed-user-email"
              v-model="formEmail"
              type="email"
              autocomplete="email"
              required
              maxlength="254"
            />
          </div>

          <div class="space-y-2">
            <label for="managed-user-display-name" class="text-sm font-medium">
              Display name
            </label>
            <Input
              id="managed-user-display-name"
              v-model="formDisplayName"
              autocomplete="nickname"
              required
              minlength="2"
              maxlength="80"
            />
            <p class="text-xs text-muted-foreground">
              Use 2–80 characters. Display names are unique across this server.
            </p>
          </div>

          <fieldset class="space-y-2">
            <legend class="text-sm font-medium">Account type</legend>
            <div v-if="!editingSelf" class="flex flex-wrap gap-2">
              <Button
                type="button"
                :variant="formRole === 'member' ? 'default' : 'outline'"
                :aria-pressed="formRole === 'member'"
                @click="setRole('member')"
              >
                User
              </Button>
              <Button
                type="button"
                :variant="formRole === 'admin' ? 'default' : 'outline'"
                :aria-pressed="formRole === 'admin'"
                @click="setRole('admin')"
              >
                Administrator
              </Button>
            </div>
            <p v-else class="text-xs text-muted-foreground">
              Your own administrator role cannot be changed here.
            </p>
          </fieldset>

          <div class="space-y-2">
            <label for="managed-user-password" class="text-sm font-medium">
              {{ dialogMode === "create" ? "Password" : "New password" }}
            </label>
            <Input
              id="managed-user-password"
              v-model="formPassword"
              type="password"
              autocomplete="new-password"
              :required="dialogMode === 'create'"
              :minlength="dialogMode === 'create' ? 12 : undefined"
              maxlength="256"
            />
            <p class="text-xs text-muted-foreground">
              {{
                dialogMode === "create"
                  ? "Use at least 12 characters."
                  : "Leave blank to keep the current password. Otherwise, use at least 12 characters."
              }}
            </p>
          </div>

          <div v-if="dialogMode === 'create' || formPassword" class="space-y-2">
            <label
              for="managed-user-password-confirmation"
              class="text-sm font-medium"
            >
              Confirm password
            </label>
            <Input
              id="managed-user-password-confirmation"
              v-model="formPasswordConfirmation"
              type="password"
              autocomplete="new-password"
              required
              minlength="12"
              maxlength="256"
              :aria-invalid="Boolean(passwordConfirmationError)"
              :aria-describedby="
                passwordConfirmationError
                  ? 'managed-user-password-error'
                  : undefined
              "
            />
            <p
              v-if="passwordConfirmationError"
              id="managed-user-password-error"
              role="alert"
              class="text-sm text-destructive"
            >
              {{ passwordConfirmationError }}
            </p>
            <p v-else class="text-xs text-muted-foreground">
              Enter the same password again.
            </p>
          </div>

          <p v-if="formError" role="alert" class="text-sm text-destructive">
            {{ formError }}
          </p>

          <div class="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              :disabled="saving"
              @click="closeUserDialog"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              :disabled="saving || !formValid"
              :aria-busy="saving"
            >
              {{
                saving
                  ? "Saving…"
                  : dialogMode === "create"
                    ? "Create account"
                    : "Save changes"
              }}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <AlertDialogRoot v-model:open="deleteOpen">
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-50 bg-background/80" />
      <AlertDialogContent
        class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-lg"
      >
        <AlertDialogTitle class="text-lg font-semibold">
          Delete {{ pendingDelete?.displayName }}?
        </AlertDialogTitle>
        <AlertDialogDescription class="text-sm text-muted-foreground">
          This permanently deletes the account and its sessions, likes, queue,
          and playback history. Their audio library is not changed.
        </AlertDialogDescription>
        <div class="mt-6 flex justify-end gap-3">
          <AlertDialogCancel as-child>
            <Button type="button" variant="outline" :disabled="deleting">
              Cancel
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction as-child @click="confirmDelete">
            <Button
              type="button"
              variant="destructive"
              :disabled="deleting"
              :aria-busy="deleting"
            >
              {{ deleting ? "Deleting…" : "Delete account" }}
            </Button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
