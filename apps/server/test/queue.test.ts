import assert from "node:assert/strict";
import test from "node:test";
import { createTestContext } from "./helpers.js";

test("playback queue state is not exposed by the server", async () => {
  const context = await createTestContext();
  try {
    for (const method of ["GET", "PUT"] as const) {
      const response = await context.app.inject({
        method,
        url: "/api/queue",
        headers: context.authorization,
        payload:
          method === "PUT"
            ? {
                trackIds: [],
                activeTrackId: null,
                shuffleEnabled: false,
                shuffleTrackIds: [],
              }
            : undefined,
      });
      assert.equal(response.statusCode, 404);
    }
  } finally {
    await context.close();
  }
});
