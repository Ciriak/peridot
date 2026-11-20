import assert from "node:assert/strict";
import test from "node:test";
import { createTestContext } from "./helpers.js";

test("playback queue state is not exposed by the server", async () => {
  const context = await createTestContext();
  try {
    const getResponse = await context.app.inject({
      method: "GET",
      url: "/api/queue",
      headers: context.authorization,
    });
    assert.equal(getResponse.statusCode, 404);

    const putResponse = await context.app.inject({
      method: "PUT",
      url: "/api/queue",
      headers: context.authorization,
      payload: {
        trackIds: [],
        activeTrackId: null,
        shuffleEnabled: false,
        shuffleTrackIds: [],
      },
    });
    assert.equal(putResponse.statusCode, 404);
  } finally {
    await context.close();
  }
});
