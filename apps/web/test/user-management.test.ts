import assert from "node:assert/strict";
import test from "node:test";
import {
  managedPasswordConfirmationError,
  managedPasswordPairValid,
} from "../app/lib/user-management.ts";

test("new account passwords require matching confirmation", () => {
  assert.equal(managedPasswordPairValid("", "", true), false);
  assert.equal(
    managedPasswordPairValid("managed-user-password", "", true),
    false,
  );
  assert.equal(
    managedPasswordPairValid(
      "managed-user-password",
      "managed-user-passwrod",
      true,
    ),
    false,
  );
  assert.equal(
    managedPasswordPairValid(
      "managed-user-password",
      "managed-user-password",
      true,
    ),
    true,
  );
});

test("edited passwords require confirmation while blank keeps the current password", () => {
  assert.equal(managedPasswordPairValid("", "", false), true);
  assert.equal(
    managedPasswordPairValid("replacement-password", "", false),
    false,
  );
  assert.equal(
    managedPasswordPairValid(
      "replacement-password",
      "replacement-passwrod",
      false,
    ),
    false,
  );
  assert.equal(
    managedPasswordPairValid(
      "replacement-password",
      "replacement-password",
      false,
    ),
    true,
  );
  assert.equal(
    managedPasswordConfirmationError(
      "replacement-password",
      "replacement-passwrod",
    ),
    "Passwords do not match.",
  );
});
