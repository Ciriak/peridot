import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { shouldAutoLoadMore } from "../app/lib/auto-load-more.ts";

const idleVisiblePage = {
  isIntersecting: true,
  enabled: true,
  loading: false,
  itemCount: 60,
  lastRequestedItemCount: null,
  armed: true,
};

test("automatic pagination requests the next page at a visible sentinel", () => {
  assert.equal(shouldAutoLoadMore(idleVisiblePage), true);
  assert.equal(
    shouldAutoLoadMore({ ...idleVisiblePage, isIntersecting: false }),
    false,
  );
  assert.equal(
    shouldAutoLoadMore({ ...idleVisiblePage, enabled: false }),
    false,
  );
  assert.equal(
    shouldAutoLoadMore({ ...idleVisiblePage, loading: true }),
    false,
  );
  assert.equal(shouldAutoLoadMore({ ...idleVisiblePage, armed: false }), false);
});

test("automatic pagination waits for new items before requesting again", () => {
  assert.equal(
    shouldAutoLoadMore({
      ...idleVisiblePage,
      lastRequestedItemCount: idleVisiblePage.itemCount,
    }),
    false,
  );
  assert.equal(
    shouldAutoLoadMore({
      ...idleVisiblePage,
      itemCount: 120,
      lastRequestedItemCount: idleVisiblePage.itemCount,
    }),
    true,
  );
});

test("automatic pagination re-arms only after the sentinel leaves view", () => {
  const afterRequest = {
    ...idleVisiblePage,
    armed: false,
  };
  assert.equal(shouldAutoLoadMore(afterRequest), false);
  assert.equal(
    shouldAutoLoadMore({
      ...afterRequest,
      isIntersecting: false,
      armed: true,
    }),
    false,
  );
  assert.equal(
    shouldAutoLoadMore({
      ...afterRequest,
      itemCount: 120,
      armed: true,
    }),
    true,
  );
});

test("paginated app surfaces use automatic load triggers without manual buttons", async () => {
  const paths = [
    "../app/components/TrackTable.vue",
    "../app/components/VirtualCardGrid.vue",
    "../app/pages/albums/index.vue",
    "../app/pages/artists/index.vue",
    "../app/pages/artists/[artist].vue",
    "../app/pages/audiobooks/index.vue",
    "../app/pages/playlists/index.vue",
    "../app/pages/podcasts/index.vue",
    "../app/pages/search.vue",
    "../app/pages/settings/tasks.vue",
  ];
  const sources = await Promise.all(
    paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );

  for (const source of sources) {
    assert.doesNotMatch(source, /@click="loadMore/);
    assert.doesNotMatch(source, /t\(["'][^"']*\.loadMore["']\)/);
  }

  const search = sources.at(-2)!;
  const tasks = sources.at(-1)!;
  assert.doesNotMatch(search, /AutoLoadMore/);
  assert.match(tasks, /AutoLoadMore/);
  assert.match(sources[0]!, /useVirtualLoadMore/);
  assert.match(sources[1]!, /useVirtualLoadMore/);

  const trigger = await readFile(
    new URL("../app/components/AutoLoadMore.vue", import.meta.url),
    "utf8",
  );
  assert.match(trigger, /useIntersectionObserver/);
  assert.match(trigger, /shouldAutoLoadMore/);
  assert.match(trigger, /armed\.value = false/);
  assert.match(trigger, /if \(!intersecting\) armed\.value = true/);
  assert.doesNotMatch(trigger, /<Button|<button/);
});
