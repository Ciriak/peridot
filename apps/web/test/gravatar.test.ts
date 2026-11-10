import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { gravatarUrl } from "../app/lib/gravatar.ts";

test("gravatar urls hash the normalized email", () => {
  const hash = createHash("md5").update("user@example.com").digest("hex");
  assert.equal(
    gravatarUrl(" USER@EXAMPLE.com "),
    `https://www.gravatar.com/avatar/${hash}?d=404&s=64`,
  );
});

test("gravatar urls accept a custom size", () => {
  const hash = createHash("md5").update("user@example.com").digest("hex");
  assert.equal(
    gravatarUrl("user@example.com", 128),
    `https://www.gravatar.com/avatar/${hash}?d=404&s=128`,
  );
});
