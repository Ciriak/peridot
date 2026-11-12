import type {
  CreateMetadataProviderRequest,
  MessageDescriptor,
  MetadataProviderResponse,
  UpdateMetadataProviderRequest,
} from "@peridot/contracts";
import type { CredentialStore } from "./credential-store.js";
import { CredentialStoreError } from "./credential-store.js";
import type { Database } from "./database.js";
import { message } from "./messages.js";
import {
  metadataProviderName,
  type MetadataProviderContext,
  type MetadataResolver,
  type MetadataResolverRegistry,
  MetadataResolverError,
} from "./metadata-resolver.js";
import type { MetadataProviderRow } from "./prisma/models.js";

const PROVIDER_NAME_LIMIT = 80;

export class MetadataProviderError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly messageDescriptor?: MessageDescriptor,
  ) {
    super(message);
    this.name = "MetadataProviderError";
  }
}

export function parseProviderConfiguration(
  value: string,
): Record<string, string> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).flatMap(
        ([key, item]) => (typeof item === "string" ? [[key, item]] : []),
      ),
    );
  } catch {
    return {};
  }
}

function toProviderResponse(
  provider: MetadataProviderRow,
): MetadataProviderResponse {
  return {
    id: provider.id,
    kind: provider.kind as MetadataProviderResponse["kind"],
    name: provider.name,
    accountLabel: provider.accountLabel,
    configuration: parseProviderConfiguration(provider.configuration),
    hasCredential: Boolean(provider.credentialCiphertext),
    enabled: Boolean(provider.enabled),
  };
}

function configurationObject(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MetadataProviderError(
      "Provider configuration must be an object.",
    );
  }
  const configuration: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") {
      throw new MetadataProviderError(
        "Provider configuration values must be strings.",
      );
    }
    configuration[key] = item;
  }
  return configuration;
}

function normalizedCredential(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new MetadataProviderError("Provider credentials must be text.");
  }
  const credential = value.trim();
  if (!credential || credential.length > 1_024) {
    throw new MetadataProviderError(
      "Enter a valid provider credential up to 1024 characters.",
    );
  }
  for (const character of credential) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) {
      throw new MetadataProviderError(
        "Provider credentials cannot contain control characters.",
      );
    }
  }
  return credential;
}

function resolverError(error: unknown): MetadataProviderError {
  if (error instanceof MetadataResolverError) {
    return new MetadataProviderError(
      error.message,
      error.statusCode,
      error.messageDescriptor,
    );
  }
  if (error instanceof CredentialStoreError) {
    return new MetadataProviderError(
      error.message,
      error.statusCode,
      message("api.message.credentialStoreError"),
    );
  }
  throw error;
}

export async function listMetadataProviders(
  database: Database,
): Promise<MetadataProviderResponse[]> {
  const providers = await database.orm.MetadataProvider.orderBy([
    (provider) => provider.position.asc(),
    (provider) => provider.createdAt.asc(),
  ]).all();
  return providers.map(toProviderResponse);
}

export async function orderedMetadataProviders(
  database: Database,
): Promise<MetadataProviderRow[]> {
  return database.orm.MetadataProvider.where({ enabled: 1 })
    .orderBy([
      (provider) => provider.position.asc(),
      (provider) => provider.createdAt.asc(),
    ])
    .all();
}

export async function providerContext(
  provider: MetadataProviderRow,
  resolver: MetadataResolver,
  credentials: CredentialStore,
): Promise<MetadataProviderContext> {
  const configuration = resolver.normalizeConfiguration(
    parseProviderConfiguration(provider.configuration),
  );
  const credential = provider.credentialCiphertext
    ? credentials.decrypt(provider.credentialCiphertext)
    : null;
  if (resolver.definition.credentialField?.required && !credential) {
    throw new MetadataResolverError(
      `${metadataProviderName(resolver.definition.kind)} requires a credential.`,
      409,
      false,
    );
  }
  return {
    id: provider.id,
    kind: resolver.definition.kind,
    name: provider.name,
    configuration,
    credential,
  };
}

export async function ensureDefaultMetadataProvider(
  database: Pick<Database, "orm">,
  contact?: string,
): Promise<void> {
  const existing = await database.orm.MetadataProvider.first({
    kind: "musicbrainz",
  });
  if (existing) return;

  const admin = contact
    ? null
    : await database.orm.User.first({ role: "admin" });
  const normalizedContact = (contact ?? admin?.email)?.trim();
  if (!normalizedContact) return;

  const { count: position } = await database.orm.MetadataProvider.aggregate(
    (aggregate) => ({ count: aggregate.count() }),
  );
  await database.orm.MetadataProvider.create({
    kind: "musicbrainz",
    name: "MusicBrainz",
    accountLabel: null,
    configuration: JSON.stringify({ contact: normalizedContact }),
    enabled: 1,
    position,
  });
}

export async function createMetadataProvider(
  database: Database,
  registry: MetadataResolverRegistry,
  credentials: CredentialStore,
  body: unknown,
): Promise<MetadataProviderResponse> {
  const value = (body ?? {}) as Partial<CreateMetadataProviderRequest>;
  if (typeof value.kind !== "string" || !value.kind.trim()) {
    throw new MetadataProviderError(
      "Choose a supported metadata provider.",
      400,
      message("api.message.invalidMetadataProvider"),
    );
  }
  let resolver: MetadataResolver;
  try {
    resolver = registry.require(value.kind);
  } catch (error) {
    throw resolverError(error);
  }
  const suppliedName = typeof value.name === "string" ? value.name.trim() : "";
  if (suppliedName.length > PROVIDER_NAME_LIMIT) {
    throw new MetadataProviderError(
      `Provider names must be ${PROVIDER_NAME_LIMIT} characters or fewer.`,
      400,
      message("api.message.metadataProviderNameTooLong"),
    );
  }
  const duplicate = await database.orm.MetadataProvider.first({
    kind: resolver.definition.kind,
  });
  if (duplicate) {
    throw new MetadataProviderError(
      "This metadata provider is already configured.",
      400,
      message("api.message.metadataProviderExists"),
    );
  }

  try {
    const configuration = resolver.normalizeConfiguration(
      configurationObject(value.configuration),
    );
    const credential = normalizedCredential(value.credential);
    if (resolver.definition.credentialField?.required && !credential) {
      throw new MetadataProviderError(
        `${metadataProviderName(resolver.definition.kind)} requires a credential.`,
        400,
        message("api.message.metadataProviderCredentialRequired", {
          provider: metadataProviderName(resolver.definition.kind),
        }),
      );
    }
    if (!resolver.definition.credentialField && credential) {
      throw new MetadataProviderError(
        `${metadataProviderName(resolver.definition.kind)} does not accept a credential.`,
        400,
        message("api.message.metadataProviderCredentialUnsupported", {
          provider: metadataProviderName(resolver.definition.kind),
        }),
      );
    }
    const context: MetadataProviderContext = {
      id: "pending",
      kind: resolver.definition.kind,
      name: suppliedName || metadataProviderName(resolver.definition.kind),
      configuration,
      credential,
    };
    if (credential) credentials.ensureConfigured();
    const accountLabel = credential
      ? await resolver.validateCredential(context, credential)
      : null;
    const encryptedCredential = credential
      ? credentials.encrypt(credential)
      : null;
    const { count: position } = await database.orm.MetadataProvider.aggregate(
      (aggregate) => ({
        count: aggregate.count(),
      }),
    );
    const provider = await database.orm.MetadataProvider.create({
      kind: resolver.definition.kind,
      name: suppliedName || metadataProviderName(resolver.definition.kind),
      accountLabel,
      configuration: JSON.stringify(configuration),
      credentialCiphertext: encryptedCredential,
      enabled: 1,
      position,
    });
    return toProviderResponse(provider);
  } catch (error) {
    throw resolverError(error);
  }
}

export async function updateMetadataProvider(
  database: Database,
  registry: MetadataResolverRegistry,
  credentials: CredentialStore,
  id: string,
  body: unknown,
): Promise<MetadataProviderResponse | null> {
  const provider = await database.orm.MetadataProvider.first({ id });
  if (!provider) return null;
  const value = (body ?? {}) as Partial<UpdateMetadataProviderRequest>;
  if (
    value.enabled === undefined &&
    value.configuration === undefined &&
    value.credential === undefined
  ) {
    throw new MetadataProviderError(
      "Choose at least one metadata provider setting to update.",
      400,
      message("api.message.metadataProviderNoFields"),
    );
  }
  try {
    const resolver = registry.require(provider.kind);
    const configuration =
      value.configuration === undefined
        ? resolver.normalizeConfiguration(
            parseProviderConfiguration(provider.configuration),
          )
        : resolver.normalizeConfiguration(
            configurationObject(value.configuration),
          );
    let accountLabel = provider.accountLabel;
    let credentialCiphertext = provider.credentialCiphertext;
    if (value.credential !== undefined && value.credential !== null) {
      if (!resolver.definition.credentialField) {
        throw new MetadataProviderError(
          `${metadataProviderName(resolver.definition.kind)} does not accept a credential.`,
          400,
          message("api.message.metadataProviderCredentialUnsupported", {
            provider: metadataProviderName(resolver.definition.kind),
          }),
        );
      }
      const credential = normalizedCredential(value.credential);
      if (credential) {
        const context: MetadataProviderContext = {
          id: provider.id,
          kind: resolver.definition.kind,
          name: provider.name,
          configuration,
          credential,
        };
        credentials.ensureConfigured();
        accountLabel = await resolver.validateCredential(context, credential);
        credentialCiphertext = credentials.encrypt(credential);
      }
    }
    if (
      resolver.definition.credentialField?.required &&
      !credentialCiphertext
    ) {
      throw new MetadataProviderError(
        `${metadataProviderName(resolver.definition.kind)} requires a credential.`,
        400,
        message("api.message.metadataProviderCredentialRequired", {
          provider: metadataProviderName(resolver.definition.kind),
        }),
      );
    }
    if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
      throw new MetadataProviderError(
        "Metadata provider enabled state must be true or false.",
        400,
        message("api.message.metadataProviderEnabledInvalid"),
      );
    }
    await database.orm.MetadataProvider.where({ id }).update({
      ...(value.enabled === undefined
        ? {}
        : { enabled: value.enabled ? 1 : 0 }),
      accountLabel,
      configuration: JSON.stringify(configuration),
      credentialCiphertext,
    });
    const updated = await database.orm.MetadataProvider.first({ id });
    return updated ? toProviderResponse(updated) : null;
  } catch (error) {
    throw resolverError(error);
  }
}

export async function reorderMetadataProviders(
  database: Database,
  ids: unknown,
): Promise<MetadataProviderResponse[]> {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    throw new MetadataProviderError(
      "Provider order must be a list of provider ids.",
      400,
      message("api.message.metadataProviderOrderInvalid"),
    );
  }
  const providers = await database.orm.MetadataProvider.select("id").all();
  const existingIds = new Set(providers.map(({ id }) => id));
  if (
    ids.length !== existingIds.size ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !existingIds.has(id))
  ) {
    throw new MetadataProviderError(
      "Provider order does not match the configured providers.",
      400,
      message("api.message.metadataProviderOrderMismatch"),
    );
  }
  await database.transaction(async (transaction) => {
    for (const [index, id] of ids.entries()) {
      await transaction.orm.MetadataProvider.where({ id }).update({
        position: index,
      });
    }
  });
  return listMetadataProviders(database);
}
