import assert from "node:assert/strict";
import test from "node:test";
import { serializeError, summarizeError } from "../src/error-format.js";

test("error summaries include codes and nested causes", () => {
  const error = new Error("The database could not be read.", {
    cause: Object.assign(new Error("database disk image is malformed"), {
      code: "SQLITE_CORRUPT",
    }),
  });

  assert.equal(
    summarizeError(error),
    "Error: The database could not be read.; caused by Error: database disk image is malformed (code SQLITE_CORRUPT)",
  );
  const serialized = serializeError(error);
  assert.equal(serialized.type, "Error");
  assert.match(String(serialized.stack), /The database could not be read/);
  assert.deepEqual(
    (serialized.cause as Record<string, unknown>).code,
    "SQLITE_CORRUPT",
  );
});

test("error summaries accept serialized Pino error records", () => {
  assert.equal(
    summarizeError({
      type: "SqliteError",
      message: "database disk image is malformed",
      code: 11,
    }),
    "SqliteError: database disk image is malformed (code 11)",
  );
});
