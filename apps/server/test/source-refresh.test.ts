import assert from "node:assert/strict";
import test from "node:test";
import { createTestContext, waitForTask, type TestContext } from "./helpers.js";

async function waitForScanCount(
  context: TestContext,
  expected: number,
): Promise<Awaited<ReturnType<typeof context.database.orm.Task.all>>> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const scans = await context.database.orm.Task.where({
      kind: "library_scan",
    })
      .orderBy((task) => task.createdAt.asc())
      .all();
    if (scans.length >= expected) return scans;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Automatic source refresh did not run in time");
}

test("source refresh runs at startup and on the configured cron schedule", async () => {
  const context = await createTestContext({
    enableSourceRefreshScheduler: true,
  });
  try {
    const startupScans = await waitForScanCount(context, 1);
    const startupScan = startupScans[0]!;
    assert.equal(startupScan.sourceId, null);
    assert.equal(startupScan.sourceName, null);
    await waitForTask(context, startupScan.id);

    const updated = await context.app.inject({
      method: "PUT",
      url: "/api/admin/server",
      headers: context.authorization,
      payload: {
        sourceRefresh: {
          enabled: true,
          cron: "*/1 * * * * *",
        },
      },
    });
    assert.equal(updated.statusCode, 200);
    assert.ok(updated.json().sourceRefresh.nextRunAt);

    const scheduledScans = await waitForScanCount(context, 2);
    assert.equal(scheduledScans[0]?.id, startupScan.id);
    assert.notEqual(scheduledScans[1]?.id, startupScan.id);
  } finally {
    await context.close();
  }
});
