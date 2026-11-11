import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const CREDENTIAL_KEY_BYTES = 32;
const ENVELOPE_VERSION = "v1";
const AAD = Buffer.from("peridot-metadata-provider-credential:v1", "utf8");

export class CredentialStoreError extends Error {
  constructor(
    message: string,
    readonly statusCode = 500,
  ) {
    super(message);
    this.name = "CredentialStoreError";
  }
}

function decodeKey(value: string): Buffer {
  const encoded = value.trim();
  if (
    !encoded ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) ||
    encoded.length % 4 !== 0
  ) {
    throw new CredentialStoreError(
      "PERIDOT_CREDENTIAL_KEY must be a base64-encoded 32-byte key.",
      503,
    );
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== CREDENTIAL_KEY_BYTES) {
    throw new CredentialStoreError(
      "PERIDOT_CREDENTIAL_KEY must decode to exactly 32 bytes.",
      503,
    );
  }
  return key;
}

export class CredentialStore {
  private readonly key: Buffer | null;

  constructor(encodedKey?: string | null) {
    this.key = encodedKey ? decodeKey(encodedKey) : null;
  }

  get configured(): boolean {
    return this.key !== null;
  }

  ensureConfigured(): void {
    if (!this.key) {
      throw new CredentialStoreError(
        "Set PERIDOT_CREDENTIAL_KEY before configuring a keyed metadata provider.",
        503,
      );
    }
  }

  encrypt(value: string): string {
    this.ensureConfigured();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key!, iv);
    cipher.setAAD(AAD);
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

  decrypt(value: string): string {
    if (!this.key) {
      throw new CredentialStoreError(
        "Set PERIDOT_CREDENTIAL_KEY to use the configured metadata provider credential.",
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
      decipher.setAAD(AAD);
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
