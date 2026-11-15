<script setup lang="ts">
import {
  computed,
  definePageMeta,
  onMounted,
  ref,
  useI18n,
  watch,
} from "#imports";
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
import { useServerConnection } from "../../composables/use-server-connection";
import { useSession } from "../../composables/use-session";
import { useAdminUsersQuery } from "../../composables/use-admin-queries";
import { useUser } from "../../composables/use-user";
import { useLocalizedMessage } from "../../composables/use-localized-message";
import { icons } from "../../lib/icons";
import { gravatarUrl } from "../../lib/gravatar";
import {
  managedPasswordConfirmationMismatch,
  managedPasswordPairValid,
} from "../../lib/user-management";
import {
  createManagedUser,
  deleteManagedUser,
  isAuthenticationRedirectError,
  updateManagedUser,
} from "../../lib/peridot-client";

definePageMeta({ layout: "settings" });

const { t } = useI18n();
const { errorMessage } = useLocalizedMessage();
const { address } = useServer();
const { token } = useSession();
const { user } = useUser();
const { status: serverStatus } = useServerConnection();
const canManageUsers = computed(() => user.value?.role === "admin");
const serverLost = computed(() => serverStatus.value === "lost");
const usersQuery = useAdminUsersQuery();
const users = ref<UserResponse[]>([]);
const loading = usersQuery.loading;
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
const passwordConfirmationMismatch = computed(() =>
  managedPasswordConfirmationMismatch(
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
  return role === "admin" ? t("common.administrator") : t("common.user");
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
  if (!canManageUsers.value) return;
  pageError.value = "";
  await usersQuery.load(true);
}

watch(
  usersQuery.items,
  (items) => {
    users.value = [...items];
  },
  { immediate: true },
);
watch(usersQuery.error, (value) => {
  if (value) pageError.value = value;
});

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
      pageNotice.value = t("settings.users.created", {
        name: saved.displayName,
      });
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
      pageNotice.value = t("settings.users.updated", {
        name: saved.displayName,
      });
    } else {
      return;
    }
    closeUserDialog();
    await loadUsers();
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    formError.value = errorMessage(reason, "settings.users.saveError");
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
    pageNotice.value = t("settings.users.deleted", { name: displayName });
    await loadUsers();
  } catch (reason) {
    if (isAuthenticationRedirectError(reason)) return;
    pageError.value = errorMessage(reason, "settings.users.deleteError");
  } finally {
    deleting.value = false;
  }
}

onMounted(() => void loadUsers());
</script>

<template>
  <div class="space-y-2">
    <h2 class="text-2xl font-semibold tracking-tight">
      {{ t("settings.users.title") }}
    </h2>
    <p class="text-sm text-muted-foreground">
      {{ t("settings.users.description") }}
    </p>
  </div>

  <section
    v-if="!canManageUsers"
    role="alert"
    class="rounded-lg border bg-card p-6 text-sm text-card-foreground"
  >
    {{ t("settings.users.adminRequired") }}
  </section>

  <section v-else aria-labelledby="user-accounts-heading" class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-2">
        <h3 id="user-accounts-heading" class="text-lg font-semibold">
          {{ t("settings.users.accounts") }}
        </h3>
        <Badge variant="outline">{{ users.length }}</Badge>
      </div>
      <Button
        type="button"
        size="sm"
        :disabled="serverLost"
        @click="openCreateDialog"
      >
        <Icon :icon="icons.userPlus" aria-hidden="true" class="size-4" />
        {{ t("settings.users.add") }}
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
        <PeridotSpinner :label="t('settings.users.loading')" class="size-5" />
        {{ t("settings.users.loading") }}
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
                {{ t("common.you") }}
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
              :disabled="serverLost"
              :aria-label="
                t('settings.users.edit', { name: account.displayName })
              "
              @click="openEditDialog(account)"
            >
              <Icon :icon="icons.edit" aria-hidden="true" class="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="text-destructive"
              :disabled="account.id === user?.id || serverLost"
              :aria-label="
                t('settings.users.delete', { name: account.displayName })
              "
              :title="
                account.id === user?.id
                  ? t('settings.users.cannotDeleteSelf')
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
        {{ t("settings.users.empty") }}
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
              {{
                dialogMode === "create"
                  ? t("settings.users.addTitle")
                  : t("settings.users.editTitle")
              }}
            </DialogTitle>
            <DialogDescription class="text-sm text-muted-foreground">
              {{
                dialogMode === "create"
                  ? t("settings.users.addDescription")
                  : t("settings.users.editDescription", {
                      name: editingUser?.displayName ?? "",
                    })
              }}
            </DialogDescription>
          </div>

          <div class="space-y-2">
            <label for="managed-user-email" class="text-sm font-medium">
              {{ t("settings.account.email") }}
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
              {{ t("settings.users.displayName") }}
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
              {{ t("settings.users.displayNameHelp") }}
            </p>
          </div>

          <fieldset class="space-y-2">
            <legend class="text-sm font-medium">
              {{ t("settings.users.accountType") }}
            </legend>
            <div v-if="!editingSelf" class="flex flex-wrap gap-2">
              <Button
                type="button"
                :variant="formRole === 'member' ? 'default' : 'outline'"
                :aria-pressed="formRole === 'member'"
                @click="setRole('member')"
              >
                {{ t("common.user") }}
              </Button>
              <Button
                type="button"
                :variant="formRole === 'admin' ? 'default' : 'outline'"
                :aria-pressed="formRole === 'admin'"
                @click="setRole('admin')"
              >
                {{ t("common.administrator") }}
              </Button>
            </div>
            <p v-else class="text-xs text-muted-foreground">
              {{ t("settings.users.ownRole") }}
            </p>
          </fieldset>

          <div class="space-y-2">
            <label for="managed-user-password" class="text-sm font-medium">
              {{
                dialogMode === "create"
                  ? t("settings.users.password")
                  : t("settings.users.newPassword")
              }}
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
                  ? t("settings.users.passwordHelp")
                  : t("settings.users.passwordEditHelp")
              }}
            </p>
          </div>

          <div v-if="dialogMode === 'create' || formPassword" class="space-y-2">
            <label
              for="managed-user-password-confirmation"
              class="text-sm font-medium"
            >
              {{ t("settings.users.confirmPassword") }}
            </label>
            <Input
              id="managed-user-password-confirmation"
              v-model="formPasswordConfirmation"
              type="password"
              autocomplete="new-password"
              required
              minlength="12"
              maxlength="256"
              :aria-invalid="passwordConfirmationMismatch"
              :aria-describedby="
                passwordConfirmationMismatch
                  ? 'managed-user-password-error'
                  : undefined
              "
            />
            <p
              v-if="passwordConfirmationMismatch"
              id="managed-user-password-error"
              role="alert"
              class="text-sm text-destructive"
            >
              {{ t("onboarding.passwordsMismatch") }}
            </p>
            <p v-else class="text-xs text-muted-foreground">
              {{ t("settings.users.confirmPasswordHelp") }}
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
              {{ t("common.cancel") }}
            </Button>
            <Button
              type="submit"
              :disabled="saving || !formValid || serverLost"
              :aria-busy="saving"
            >
              {{
                saving
                  ? t("common.saving")
                  : dialogMode === "create"
                    ? t("common.createAccount")
                    : t("common.saveChanges")
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
          {{
            t("settings.users.deleteTitle", {
              name: pendingDelete?.displayName ?? "",
            })
          }}
        </AlertDialogTitle>
        <AlertDialogDescription class="text-sm text-muted-foreground">
          {{ t("settings.users.deleteDescription") }}
        </AlertDialogDescription>
        <div class="mt-6 flex justify-end gap-3">
          <AlertDialogCancel as-child>
            <Button type="button" variant="outline" :disabled="deleting">
              {{ t("common.cancel") }}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction as-child @click="confirmDelete">
            <Button
              type="button"
              variant="destructive"
              :disabled="deleting || serverLost"
              :aria-busy="deleting"
            >
              {{ deleting ? t("common.deleting") : t("common.deleteAccount") }}
            </Button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
