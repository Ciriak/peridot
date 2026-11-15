import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  CredentialStore,
  CredentialStoreError,
  localCredentialKeyFile,
} from "../src/credential-store.js";

const key = Buffer.alloc(32, 11).toString("base64");

test("credential store encrypts, decrypts, and uses a fresh nonce", () => {
  const store = new CredentialStore(key);
  const first = store.encrypt("discogs-secret-token");
  const second = store.encrypt("discogs-secret-token");
  const source = store.encrypt("jellyfin-api-key", "source");

  assert.notEqual(first, second);
  assert.match(first, /^v1\./);
  assert.doesNotMatch(first, /discogs-secret-token/);
  assert.equal(store.decrypt(first), "discogs-secret-token");
  assert.equal(store.decrypt(second), "discogs-secret-token");
  assert.equal(store.decrypt(source, "source"), "jellyfin-api-key");
  assert.throws(() => store.decrypt(source), /could not be decrypted/);
});

test("credential store rejects tampering and a missing master key", () => {
  const store = new CredentialStore(key);
  const envelope = store.encrypt("discogs-secret-token");
  const [version, iv, tag, ciphertext] = envelope.split(".");
  const tampered = [version, iv, tag, `${ciphertext}A`].join(".");

  assert.throws(
    () => store.decrypt(tampered),
    (error: unknown) =>
      error instanceof CredentialStoreError &&
      /could not be decrypted/.test(error.message),
  );

  const missing = new CredentialStore();
  assert.throws(
    () => missing.encrypt("discogs-secret-token"),
    (error: unknown) =>
      error instanceof CredentialStoreError && error.statusCode === 503,
  );
});

test("credential store creates and reuses a local key file", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "peridot-credential-key-"));
  const databaseUrl = `file:${path.join(root, "library.db").replaceAll("\\", "/")}`;
  const keyFile = localCredentialKeyFile(databaseUrl);
  try {
    const first = await CredentialStore.fromConfig(undefined, databaseUrl);
    const storedKey = (await readFile(keyFile, "utf8")).trim();
    assert.equal(Buffer.from(storedKey, "base64").length, 32);
    assert.equal((await stat(keyFile)).isFile(), true);

    const encrypted = first.encrypt("discogs-secret-token");
    const second = await CredentialStore.fromConfig(undefined, databaseUrl);
    assert.equal(second.decrypt(encrypted), "discogs-secret-token");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("credential store imports an explicit key into the local key file", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "peridot-credential-key-"));
  const databaseUrl = `file:${path.join(root, "library.db").replaceAll("\\", "/")}`;
  const keyFile = localCredentialKeyFile(databaseUrl);
  const encrypted = new CredentialStore(key).encrypt("discogs-secret-token");
  try {
    const store = await CredentialStore.fromConfig(key, databaseUrl, [
      encrypted,
    ]);
    assert.equal(store.configured, true);
    assert.equal((await readFile(keyFile, "utf8")).trim(), key);

    const local = await CredentialStore.fromConfig(undefined, databaseUrl, [
      encrypted,
    ]);
    assert.equal(store.decrypt(encrypted), "discogs-secret-token");
    assert.equal(local.decrypt(encrypted), "discogs-secret-token");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("credential store does not copy an explicit key without stored credentials", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "peridot-credential-key-"));
  const databaseUrl = `file:${path.join(root, "library.db").replaceAll("\\", "/")}`;
  try {
    const store = await CredentialStore.fromConfig(key, databaseUrl);
    assert.equal(store.configured, true);
    await assert.rejects(stat(localCredentialKeyFile(databaseUrl)), {
      code: "ENOENT",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("credential store refuses to replace a missing key for stored credentials", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "peridot-credential-key-"));
  const databaseUrl = `file:${path.join(root, "library.db").replaceAll("\\", "/")}`;
  const encrypted = new CredentialStore(key).encrypt("discogs-secret-token");
  try {
    await assert.rejects(
      CredentialStore.fromConfig(undefined, databaseUrl, [encrypted]),
      /Set PERIDOT_CREDENTIAL_KEY and restart Peridot once to migrate it/,
    );
    await assert.rejects(stat(localCredentialKeyFile(databaseUrl)), {
      code: "ENOENT",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("credential store imports a working explicit key over a stale local key", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "peridot-credential-key-"));
  const databaseUrl = `file:${path.join(root, "library.db").replaceAll("\\", "/")}`;
  const encrypted = new CredentialStore(key).encrypt("discogs-secret-token");
  try {
    await CredentialStore.fromConfig(undefined, databaseUrl);
    const migrated = await CredentialStore.fromConfig(key, databaseUrl, [
      encrypted,
    ]);
    assert.equal(migrated.decrypt(encrypted), "discogs-secret-token");
    assert.equal(
      (await readFile(localCredentialKeyFile(databaseUrl), "utf8")).trim(),
      key,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("credential store rejects an invalid local key file", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "peridot-credential-key-"));
  const databaseUrl = `file:${path.join(root, "library.db").replaceAll("\\", "/")}`;
  const keyFile = localCredentialKeyFile(databaseUrl);
  try {
    await writeFile(keyFile, "not-a-credential-key", "utf8");
    await assert.rejects(
      CredentialStore.fromConfig(undefined, databaseUrl),
      /local credential encryption key file must contain/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
