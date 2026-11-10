import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type ViteDevServer } from "vite";
import vue from "@vitejs/plugin-vue";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";

let server: ViteDevServer;
before(async () => {
  server = await createServer({
    configFile: false,
    plugins: [vue()],
    server: { middlewareMode: true },
    appType: "custom",
  });
});
after(async () => {
  await server?.close();
});
async function render(name: string, props: Record<string, unknown>, text = "") {
  const { default: component } = await server.ssrLoadModule(
    `/src/components/ui/${name.toLowerCase()}/${name}.vue`,
  );
  return renderToString(
    createSSRApp({ render: () => h(component, props, () => text) }),
  );
}
test("disabled actions remain native disabled buttons with their accessible label", async () => {
  const html = await render(
    "Button",
    { disabled: true, "aria-label": "Next track", variant: "ghost" },
    "Next",
  );
  assert.match(html, /<button[^>]*disabled/);
  assert.match(html, /aria-label="Next track"/);
  assert.match(html, /data-slot="button"/);
});
test("search input preserves its initial model and accessible name during SSR", async () => {
  const html = await render("Input", {
    modelValue: "Ambient",
    "aria-label": "Search demo library",
  });
  assert.match(html, /value="Ambient"/);
  assert.match(html, /aria-label="Search demo library"/);
});
test("player slider renders initial progress and exposes bounds and a named thumb during SSR", async () => {
  const html = await render("Slider", {
    modelValue: [72],
    min: 0,
    max: 246,
    thumbLabel: "Playback position",
  });
  assert.match(html, /role="slider"/);
  assert.match(html, /right:70\.73170731707317%/);
  assert.match(html, /aria-valuemin="0"/);
  assert.match(html, /aria-valuemax="246"/);
  assert.match(html, /aria-label="Playback position"/);
});
