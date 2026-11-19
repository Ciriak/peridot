import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CREDENTIAL_KEY_BYTES = 32;
const ENVELOPE_VERSION = "v1";
const PERIDOT_CREDENTIAL_KEY = "PERIDOT_CREDENTIAL_KEY";
const LOCAL_KEY_FILE = "local credential encryption key file";
const CREDENTIAL_AAD = {
  "metadata-provider": Buffer.from(
    "peridot-metadata-provider-credential:v1",
    "utf8",
  ),
  source: Buffer.from("peridot-source-credential:v1", "utf8"),
} as const;

export type CredentialPurpose = keyof typeof CREDENTIAL_AAD;

export interface StoredCredentialCiphertexts {
  metadataProvider: readonly string[];
  source: readonly string[];
}

export class CredentialStoreError extends Error {
  constructor(
    message: string,
    readonly statusCode = 500,
  ) {
    super(message);
    this.name = "CredentialStoreError";
  }
}

function decodeKey(value: string, source: string): Buffer {
  const encoded = value.trim();
  if (
    !encoded ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) ||
    encoded.length % 4 !== 0
  ) {
    throw new CredentialStoreError(
      `${source} must contain a base64-encoded 32-byte key.`,
      503,
    );
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== CREDENTIAL_KEY_BYTES) {
    throw new CredentialStoreError(
      `${source} must decode to exactly 32 bytes.`,
      503,
    );
  }
  return key;
}

function databasePath(databaseUrl: string): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must be a file: URL for SQLite");
  }
  if (databaseUrl.startsWith("file://")) {
    return fileURLToPath(databaseUrl);
  }
  const value = decodeURIComponent(databaseUrl.slice("file:".length));
  if (!value) {
    throw new Error("DATABASE_URL must include a SQLite file path");
  }
  return path.resolve(value);
}

export function localCredentialKeyFile(databaseUrl: string): string {
  return `${databasePath(databaseUrl)}.key`;
}

async function readKeyFile(keyFile: string): Promise<string> {
  return (await readFile(keyFile, "utf8")).trim();
}

async function loadOrCreateLocalKey(
  keyFile: string,
  allowCreate: boolean,
): Promise<string> {
  await mkdir(path.dirname(keyFile), { recursive: true });
  try {
    return await readKeyFile(keyFile);
  } catch (error) {
    if (!(
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    )) {
      throw error;
    }
    if (!allowCreate) {
      throw new CredentialStoreError(
        "Existing metadata provider credentials require their previous encryption key. Set PERIDOT_CREDENTIAL_KEY and restart Peridot once to migrate it.",
        503,
      );
    }
  }

  const encodedKey = randomBytes(CREDENTIAL_KEY_BYTES).toString("base64");
  try {
    const handle = await open(keyFile, "wx", 0o600);
    try {
      await handle.writeFile(`${encodedKey}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    return encodedKey;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      return readKeyFile(keyFile);
    }
    throw error;
  }
}

async function writeLocalKey(
  keyFile: string,
  encodedKey: string,
): Promise<void> {
  await mkdir(path.dirname(keyFile), { recursive: true });
  const handle = await open(keyFile, "w", 0o600);
  try {
    await handle.writeFile(`${encodedKey}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export class CredentialStore {
  private readonly key: Buffer | null;

  constructor(encodedKey?: string | null, source = PERIDOT_CREDENTIAL_KEY) {
    this.key = encodedKey ? decodeKey(encodedKey, source) : null;
  }

  static async fromConfig(
    encodedKey: string | undefined,
    databaseUrl: string,
    storedCredentials: readonly string[] | StoredCredentialCiphertexts = [],
  ): Promise<CredentialStore> {
    const groups: StoredCredentialCiphertexts = Array.isArray(storedCredentials)
      ? {
          metadataProvider: storedCredentials,
          source: [],
        }
      : (storedCredentials as StoredCredentialCiphertexts);
    const storedCredentialCount =
      groups.metadataProvider.length + groups.source.length;
    if (encodedKey) {
      const store = new CredentialStore(encodedKey);
      try {
        store.validateStoredCredentials(groups);
      } catch {
        throw new CredentialStoreError(
          "PERIDOT_CREDENTIAL_KEY cannot decrypt the existing stored credentials.",
          503,
        );
      }
      if (storedCredentialCount > 0) {
        await writeLocalKey(localCredentialKeyFile(databaseUrl), encodedKey);
      }
      return store;
    }

    const keyFile = localCredentialKeyFile(databaseUrl);
    const localKey = await loadOrCreateLocalKey(
      keyFile,
      storedCredentialCount === 0,
    );
    const store = new CredentialStore(localKey, LOCAL_KEY_FILE);
    try {
      store.validateStoredCredentials(groups);
    } catch {
      throw new CredentialStoreError(
        "The local credential encryption key cannot decrypt the existing stored credentials. Set PERIDOT_CREDENTIAL_KEY to the previous key and restart Peridot once to migrate it.",
        503,
      );
    }
    return store;
  }

  get configured(): boolean {
    return this.key !== null;
  }

  ensureConfigured(): void {
    if (!this.key) {
      throw new CredentialStoreError(
        "No credential encryption key is configured.",
        503,
      );
    }
  }

  private validateStoredCredentials(
    storedCredentials: StoredCredentialCiphertexts,
  ): void {
    for (const ciphertext of storedCredentials.metadataProvider) {
      this.decrypt(ciphertext, "metadata-provider");
    }
    for (const ciphertext of storedCredentials.source) {
      this.decrypt(ciphertext, "source");
    }
  }

  encrypt(
    value: string,
    purpose: CredentialPurpose = "metadata-provider",
  ): string {
    this.ensureConfigured();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key!, iv);
    cipher.setAAD(CREDENTIAL_AAD[purpose]);
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      ENVELOPE_VERSION,
      iv.toString("base64url"),
      tag.toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(".");
  }

  decrypt(
    value: string,
    purpose: CredentialPurpose = "metadata-provider",
  ): string {
    if (!this.key) {
      throw new CredentialStoreError(
        "No credential encryption key is configured.",
        503,
      );
    }
    const [version, encodedIv, encodedTag, encodedCiphertext, extra] =
      value.split(".");
    if (
      version !== ENVELOPE_VERSION ||
      !encodedIv ||
      !encodedTag ||
      encodedCiphertext === undefined ||
      extra !== undefined
    ) {
      throw new CredentialStoreError(
        "The stored metadata provider credential is invalid.",
      );
    }
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        Buffer.from(encodedIv, "base64url"),
      );
      decipher.setAAD(CREDENTIAL_AAD[purpose]);
      decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(encodedCiphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new CredentialStoreError(
        "The stored metadata provider credential could not be decrypted.",
      );
    }
  }
}
