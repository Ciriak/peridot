import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CredentialStore,
  CredentialStoreError,
} from "../src/credential-store.js";

const key = Buffer.alloc(32, 11).toString("base64");

test("credential store encrypts, decrypts, and uses a fresh nonce", () => {
  const store = new CredentialStore(key);
  const first = store.encrypt("discogs-secret-token");
  const second = store.encrypt("discogs-secret-token");

  assert.notEqual(first, second);
  assert.match(first, /^v1\./);
  assert.doesNotMatch(first, /discogs-secret-token/);
  assert.equal(store.decrypt(first), "discogs-secret-token");
  assert.equal(store.decrypt(second), "discogs-secret-token");
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
