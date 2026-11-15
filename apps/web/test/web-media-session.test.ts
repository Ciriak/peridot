import assert from "node:assert/strict";
import test from "node:test";
import { configureWebMediaSession } from "../app/lib/web-media-session.ts";

test("web media session routes standard transport actions", () => {
  const handlers = new Map<string, MediaSessionActionHandler | null>();
  const calls: string[] = [];
  const cleanup = configureWebMediaSession(
    {
      setActionHandler(action, handler) {
        handlers.set(action, handler);
      },
    },
    {
      play: () => calls.push("play"),
      pause: () => calls.push("pause"),
      next: () => calls.push("next"),
      previous: () => calls.push("previous"),
      seek: (seconds) => calls.push(`seek:${seconds}`),
    },
  );

  handlers.get("play")?.({ action: "play" });
  handlers.get("pause")?.({ action: "pause" });
  handlers.get("nexttrack")?.({ action: "nexttrack" });
  handlers.get("previoustrack")?.({ action: "previoustrack" });
  handlers.get("seekto")?.({ action: "seekto", seekTime: 42 });

  assert.deepEqual(calls, ["play", "pause", "next", "previous", "seek:42"]);

  cleanup();
  assert.deepEqual(
    [...handlers.entries()].filter(([, handler]) => handler !== null),
    [],
  );
});
