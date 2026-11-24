import assert from "node:assert/strict";
import test from "node:test";
import { createTestContext } from "./helpers.js";

test("legacy Track, Source, and Torznab routes are absent", async () => {
  const context = await createTestContext();
  try {
    for (const [method, url] of [
      ["GET", "/api/tracks"],
      ["POST", "/api/tracks/resolve"],
      ["GET", "/api/tracks/example"],
      ["GET", "/api/admin/sources"],
      ["GET", "/api/torznab"],
      ["GET", "/api/torznab/status"],
      ["POST", "/api/torznab/import"],
    ] as const) {
      const response = await context.app.inject({
        method,
        url,
        headers: context.authorization,
      });
      assert.equal(response.statusCode, 404, `${method} ${url}`);
    }

    const media = await context.app.inject({
      method: "GET",
      url: "/api/media",
      headers: context.authorization,
    });
    assert.equal(media.statusCode, 200);
    assert.deepEqual(media.json().items, []);
  } finally {
    await context.close();
  }
});
