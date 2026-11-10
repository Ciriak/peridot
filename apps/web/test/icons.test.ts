import assert from "node:assert/strict";
import test from "node:test";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { Icon } from "@iconify/vue/offline";
import playIcon from "@iconify-icons/basil/play-solid";
import { icons } from "../app/lib/icons.ts";

async function render(icon: typeof playIcon) {
  return renderToString(
    createSSRApp({
      render: () => h(Icon, { icon, "aria-hidden": "true", class: "size-4" }),
    }),
  );
}

test("every app icon renders SVG on the server from bundled data", async () => {
  for (const [name, icon] of Object.entries(icons)) {
    const html = await render(icon);
    assert.match(html, /<svg\b/, name);
    assert.match(html, /aria-hidden="true"/, name);
    assert.match(html, /class="[^"]*size-4/, name);
    assert.ok(html.includes(icon.body), name);
  }
});

test("transport uses basil:play-solid and a distinct pause icon", async () => {
  assert.deepEqual(icons.play, playIcon);
  assert.notEqual(await render(icons.play), await render(icons.pause));
});
