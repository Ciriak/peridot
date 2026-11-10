import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";

test("health endpoint responds without database or external services", async () => {
  const app = buildApp();
  try {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: "ok", service: "peridot" });
    assert.equal((await app.inject("/api/missing")).statusCode, 404);
  } finally {
    await app.close();
  }
});
