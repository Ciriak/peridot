import type {
  CreateMetadataProviderRequest,
  MetadataProviderKind,
  MetadataProviderResponse,
} from "@peridot/contracts";
import type { Database } from "./database.js";
import type { MetadataProvider } from "./generated/prisma/client.js";

const PROVIDER_NAME_LIMIT = 80;
const CONTACT_LIMIT = 512;

export class MetadataProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetadataProviderError";
  }
}

function providerName(kind: MetadataProviderKind): string {
  return kind === "musicbrainz" ? "MusicBrainz" : kind;
}

function toProviderResponse(
  provider: MetadataProvider,
): MetadataProviderResponse {
  return {
    id: provider.id,
    kind: provider.kind as MetadataProviderKind,
    name: provider.name,
    contact: provider.contact,
    hasCredential: Boolean(provider.credentialCiphertext),
  };
}

function normalizeContact(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const contact = value.trim();
  if (!contact || contact.length > CONTACT_LIMIT) {
    return null;
  }
  for (const character of contact) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return null;
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    return contact.toLowerCase();
  }
  try {
    const url = new URL(contact);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export async function listMetadataProviders(
  database: Database,
): Promise<MetadataProviderResponse[]> {
  const providers = await database.metadataProvider.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return providers.map(toProviderResponse);
}

export async function orderedMetadataProviders(
  database: Database,
): Promise<MetadataProvider[]> {
  return database.metadataProvider.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export async function createMetadataProvider(
  database: Database,
  body: unknown,
): Promise<MetadataProviderResponse> {
  const value = (body ?? {}) as Partial<CreateMetadataProviderRequest>;
  if (value.kind !== "musicbrainz") {
    throw new MetadataProviderError("Choose a supported metadata provider.");
  }
  const contact = normalizeContact(value.contact);
  if (!contact) {
    throw new MetadataProviderError(
      "Enter a contact email or HTTP(S) URL for MusicBrainz.",
    );
  }
  if (value.apiKey != null && String(value.apiKey).trim()) {
    throw new MetadataProviderError("MusicBrainz does not require an API key.");
  }
  const suppliedName = typeof value.name === "string" ? value.name.trim() : "";
  if (suppliedName.length > PROVIDER_NAME_LIMIT) {
    throw new MetadataProviderError(
      `Provider names must be ${PROVIDER_NAME_LIMIT} characters or fewer.`,
    );
  }
  const duplicate = await database.metadataProvider.findUnique({
    where: { kind: value.kind },
  });
  if (duplicate) {
    throw new MetadataProviderError(
      "This metadata provider is already configured.",
    );
  }
  const position = await database.metadataProvider.count();
  const provider = await database.metadataProvider.create({
    data: {
      kind: value.kind,
      name: suppliedName || providerName(value.kind),
      contact,
      position,
    },
  });
  return toProviderResponse(provider);
}

export async function deleteMetadataProvider(
  database: Database,
  id: string,
): Promise<boolean> {
  try {
    await database.metadataProvider.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

export async function reorderMetadataProviders(
  database: Database,
  ids: unknown,
): Promise<MetadataProviderResponse[]> {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    throw new MetadataProviderError(
      "Provider order must be a list of provider ids.",
    );
  }
  const providers = await database.metadataProvider.findMany({
    select: { id: true },
  });
  const existingIds = new Set(providers.map(({ id }) => id));
  if (
    ids.length !== existingIds.size ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !existingIds.has(id))
  ) {
    throw new MetadataProviderError(
      "Provider order does not match the configured providers.",
    );
  }
  await database.$transaction(
    ids.map((id, index) =>
      database.metadataProvider.update({
        where: { id },
        data: { position: index },
      }),
    ),
  );
  return listMetadataProviders(database);
}
