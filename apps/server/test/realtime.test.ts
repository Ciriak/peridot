import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  RealtimeCatalogChangedEvent,
  RealtimeHelloMessage,
  RealtimeLogAppendedEvent,
  RealtimeResyncRequiredMessage,
  RealtimeServerMessage,
  RealtimeSubscribedMessage,
  RealtimeTaskUpdatedEvent,
  RealtimeTicketResponse,
} from "@peridot/contracts";
import type { WebSocket } from "ws";
import { redactRealtimeTicket } from "../src/realtime.js";
import { createMemberSession, createTestContext } from "./helpers.js";

function messageQueue(socket: WebSocket) {
  const messages: RealtimeServerMessage[] = [];
  const waiters: Array<(message: RealtimeServerMessage) => void> = [];
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString()) as RealtimeServerMessage;
    const waiter = waiters.shift();
    if (waiter) waiter(message);
    else messages.push(message);
  });
  return () =>
    new Promise<RealtimeServerMessage>((resolve, reject) => {
      const message = messages.shift();
      if (message) return resolve(message);
      const timer = setTimeout(
        () => reject(new Error("WebSocket timed out")),
        2_000,
      );
      waiters.push((next) => {
        clearTimeout(timer);
        resolve(next);
      });
    });
}

function waitForClose(socket: WebSocket): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("WebSocket close timed out")),
      2_000,
    );
    socket.once("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function ticket(
  context: Awaited<ReturnType<typeof createTestContext>>,
  authorization = context.authorization,
) {
  const response = await context.app.inject({
    method: "POST",
    url: "/api/realtime/ticket",
    headers: authorization,
  });
  assert.equal(response.statusCode, 200);
  return response.json<RealtimeTicketResponse>();
}

test("realtime tickets are removed from logged URLs", () => {
  assert.equal(
    redactRealtimeTicket("/api/realtime?ticket=secret&after=1"),
    "/api/realtime?ticket=[redacted]&after=1",
  );
});

test("realtime tickets authenticate, subscribe, replay, and authorize logs", async () => {
  const context = await createTestContext();
  try {
    const issued = await ticket(context);
    const socket = await context.app.injectWS(
      `/api/realtime?ticket=${issued.ticket}`,
      { headers: { origin: "http://127.0.0.1:3000" } },
    );
    try {
      const nextMessage = messageQueue(socket);
      socket.send(
        JSON.stringify({ type: "subscribe", topics: ["logs", "catalog"] }),
      );
      const hello = (await nextMessage()) as RealtimeHelloMessage;
      assert.equal(hello.type, "hello");
      assert.equal(hello.protocolVersion, 1);
      const subscribed = (await nextMessage()) as RealtimeSubscribedMessage;
      assert.deepEqual(
        new Set(subscribed.topics),
        new Set(["logs", "catalog"]),
      );

      context.logBuffer.add("info", "realtime log entry");
      const log = (await nextMessage()) as RealtimeLogAppendedEvent;
      assert.equal(log.type, "log.appended");
      assert.equal(log.entry.message, "realtime log entry");

      socket.send(
        JSON.stringify({ type: "subscribe", topics: ["catalog"], after: 9999 }),
      );
      await nextMessage();
      const resync = (await nextMessage()) as RealtimeResyncRequiredMessage;
      assert.equal(resync.type, "resync.required");
    } finally {
      socket.terminate();
    }

    const reused = await context.app.injectWS(
      `/api/realtime?ticket=${issued.ticket}`,
      { headers: { origin: "http://127.0.0.1:3000" } },
    );
    assert.equal(await waitForClose(reused), 4401);
  } finally {
    await context.close();
  }
});

test("realtime rejects origins and member log subscriptions", async () => {
  const context = await createTestContext();
  try {
    const blockedTicket = await ticket(context);
    const blocked = await context.app.injectWS(
      `/api/realtime?ticket=${blockedTicket.ticket}`,
      { headers: { origin: "https://untrusted.example" } },
    );
    assert.equal(await waitForClose(blocked), 4403);

    const member = await createMemberSession(context);
    const memberTicket = await ticket(context, member);
    const socket = await context.app.injectWS(
      `/api/realtime?ticket=${memberTicket.ticket}`,
      { headers: { origin: "http://127.0.0.1:3000" } },
    );
    try {
      const nextMessage = messageQueue(socket);
      socket.send(JSON.stringify({ type: "subscribe", topics: ["logs"] }));
      await nextMessage();
      const error = await nextMessage();
      assert.equal(error.type, "error");
    } finally {
      socket.terminate();
    }
  } finally {
    await context.close();
  }
});

test("catalog events are constant-size revision markers", async () => {
  const context = await createTestContext();
  try {
    const issued = await ticket(context);
    const socket = await context.app.injectWS(
      `/api/realtime?ticket=${issued.ticket}`,
      { headers: { origin: "http://127.0.0.1:3000" } },
    );
    try {
      const nextMessage = messageQueue(socket);
      socket.send(JSON.stringify({ type: "subscribe", topics: ["catalog"] }));
      await nextMessage();
      await nextMessage();
      const response = await context.app.inject({
        method: "POST",
        url: "/api/admin/metadata/reset",
        headers: context.authorization,
      });
      assert.equal(response.statusCode, 200);
      const event = (await nextMessage()) as RealtimeCatalogChangedEvent;
      assert.equal(event.type, "catalog.changed");
      assert.equal("items" in event, false);
      assert.equal(typeof event.revision, "number");
      assert.equal(typeof event.changedCount, "number");
    } finally {
      socket.terminate();
    }
  } finally {
    await context.close();
  }
});

test("task events follow authenticated task transitions", async () => {
  const context = await createTestContext();
  try {
    const issued = await ticket(context);
    const socket = await context.app.injectWS(
      `/api/realtime?ticket=${issued.ticket}`,
      { headers: { origin: "http://127.0.0.1:3000" } },
    );
    try {
      const nextMessage = messageQueue(socket);
      socket.send(JSON.stringify({ type: "subscribe", topics: ["tasks"] }));
      await nextMessage();
      await nextMessage();
      const scan = await context.app.inject({
        method: "POST",
        url: "/api/library/scans",
        headers: context.authorization,
      });
      assert.equal(scan.statusCode, 202);
      const event = (await nextMessage()) as RealtimeTaskUpdatedEvent;
      assert.equal(event.type, "task.updated");
      assert.equal(event.task.id, scan.json<{ id: string }>().id);
      assert.ok(["queued", "running", "completed"].includes(event.task.status));
    } finally {
      socket.terminate();
    }
  } finally {
    await context.close();
  }
});

test("revoking a session closes its realtime connection", async () => {
  const context = await createTestContext();
  try {
    const issued = await ticket(context);
    const socket = await context.app.injectWS(
      `/api/realtime?ticket=${issued.ticket}`,
      { headers: { origin: "http://127.0.0.1:3000" } },
    );
    const nextMessage = messageQueue(socket);
    socket.send(JSON.stringify({ type: "subscribe", topics: ["tasks"] }));
    await nextMessage();
    await nextMessage();
    const revoked = await context.app.inject({
      method: "DELETE",
      url: "/api/auth/session",
      headers: context.authorization,
    });
    assert.equal(revoked.statusCode, 204);
    assert.equal(await waitForClose(socket), 4401);
  } finally {
    await context.close();
  }
});
