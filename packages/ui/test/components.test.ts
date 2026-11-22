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
async function render(
  name: string,
  props: Record<string, unknown>,
  text?: string,
  directory = name.toLowerCase(),
) {
  const { default: component } = await server.ssrLoadModule(
    `/src/components/ui/${directory}/${name}.vue`,
  );
  return renderToString(
    createSSRApp({
      render: () =>
        text === undefined
          ? h(component, props)
          : h(component, props, () => text),
    }),
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
    "aria-label": "Search library",
  });
  assert.match(html, /value="Ambient"/);
  assert.match(html, /aria-label="Search library"/);
});
test("Kbd renders keyboard keys with shadcn key styling", async () => {
  const html = await render("Kbd", { class: "shortcut-key" }, "Ctrl", "kbd");
  assert.match(html, /^<kbd class="[^"]*bg-muted[^"]*shortcut-key"/);
  assert.match(html, /Ctrl<!--\]--><\/kbd>/);
});
test("Sonner exposes an accessible, themed toaster without local inline styles", async () => {
  const html = await render(
    "Sonner",
    {
      class: "app-toaster",
      containerAriaLabel: "Notifications",
      position: "top-right",
      theme: "dark",
      visibleToasts: 3,
    },
    undefined,
    "sonner",
  );
  assert.match(html, /data-sonner-toaster/);
  assert.match(html, /data-x-position="right"/);
  assert.match(html, /aria-label="Notifications/);
  assert.match(html, /class="[^"]*toaster group[^"]*app-toaster/);
});
test("switch renders its checked state and accessible name", async () => {
  const html = await render("Switch", {
    modelValue: true,
    "aria-label": "Enable MusicBrainz",
  });
  assert.match(html, /data-slot="switch"/);
  assert.match(html, /data-state="checked"/);
  assert.match(html, /aria-label="Enable MusicBrainz"/);
  assert.match(html, /role="switch"/);
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
test("slider can render a flat, thumbless progress line while retaining its range control", async () => {
  const html = await render("Slider", {
    modelValue: [22],
    min: 0,
    max: 100,
    thumbLabel: "Track position",
    trackClass: "rounded-none",
    hideThumb: true,
  });
  assert.match(html, /data-slot="slider-track"[^>]*class="[^"]*rounded-none/);
  assert.match(
    html,
    /data-slot="slider-thumb"[^>]*class="[^"]*pointer-events-none opacity-0/,
  );
  assert.match(html, /role="slider"/);
});
test("PeridotSpinner uses the animated brand asset with an accessible reduced-motion fallback", async () => {
  const html = await render(
    "PeridotSpinner",
    {
      label: "Scanning for servers",
      class: "size-4",
    },
    "",
    "spinner",
  );
  assert.match(html, /data-slot="peridot-spinner"/);
  assert.match(html, /role="status"/);
  assert.match(html, /class="[^"]*size-4/);
  assert.match(html, /data:image\/svg\+xml/);
  assert.match(html, /animateTransform/);
  assert.match(html, /motion-reduce:hidden/);
  assert.match(html, /clipPath/);
  assert.match(html, /motion-reduce:block/);
  assert.match(html, />Scanning for servers<\/span>/);
});
test("Spinner uses the classic shadcn animated loader icon", async () => {
  const html = await render(
    "Spinner",
    { class: "size-6", label: "Loading search results" },
    "",
    "spinner",
  );
  assert.match(html, /<svg/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-label="Loading search results"/);
  assert.match(html, /class="[^"]*size-6/);
  assert.match(html, /animate-spin/);
});
test("ProgressCircle starts its first rendered arc at zero while exposing current progress", async () => {
  const html = await render(
    "ProgressCircle",
    {
      class: "custom-progress",
      label: "Importing album",
      showValue: true,
      size: "lg",
      value: 42.4,
      variant: "success",
    },
    undefined,
    "progress-circle",
  );
  assert.match(html, /data-slot="progress-circle"/);
  assert.match(html, /data-state="determinate"/);
  assert.match(html, /data-size="lg"/);
  assert.match(html, /data-variant="success"/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-label="Importing album"/);
  assert.match(html, /aria-valuemin="0"/);
  assert.match(html, /aria-valuemax="100"/);
  assert.match(html, /aria-valuenow="42\.4"/);
  assert.match(html, /aria-valuetext="42%"/);
  assert.match(html, /stroke-dasharray="100"/);
  assert.match(html, /stroke-dashoffset="100"/);
  assert.match(html, /stroke-width="6"/);
  assert.match(html, /class="[^"]*size-16/);
  assert.match(html, /class="[^"]*stroke-success/);
  assert.match(html, /class="[^"]*custom-progress/);
  assert.match(html, /motion-safe:animate-spin/);
  const indicator =
    html.match(
      /<circle[^>]*data-slot="progress-circle-indicator"[^>]*>/,
    )?.[0] ?? "";
  assert.match(indicator, /motion-safe:transition-all/);
  assert.match(indicator, /motion-safe:duration-300/);
  assert.match(indicator, /motion-reduce:transition-none/);
  assert.match(html, /42%<!--\]-->/);
});
test("ProgressCircle accepts a configurable stroke width", async () => {
  const html = await render(
    "ProgressCircle",
    { label: "Upload", stroke: 3, value: 50 },
    undefined,
    "progress-circle",
  );
  assert.match(html, /stroke-width="3"/);
});
test("ProgressCircle clamps finite values and treats zero as determinate", async () => {
  const zero = await render(
    "ProgressCircle",
    { label: "Upload", showValue: true, value: 0 },
    undefined,
    "progress-circle",
  );
  assert.match(zero, /data-state="determinate"/);
  assert.match(zero, /aria-valuenow="0"/);
  assert.match(zero, /stroke-dashoffset="100"/);
  assert.match(zero, /0%<!--\]-->/);

  const aboveRange = await render(
    "ProgressCircle",
    { label: "Upload", value: 140 },
    undefined,
    "progress-circle",
  );
  assert.match(aboveRange, /aria-valuenow="100"/);
  assert.match(aboveRange, /stroke-dashoffset="100"/);

  const belowRange = await render(
    "ProgressCircle",
    { label: "Upload", value: -20 },
    undefined,
    "progress-circle",
  );
  assert.match(belowRange, /aria-valuenow="0"/);
  assert.match(belowRange, /stroke-dashoffset="100"/);
});
test("ProgressCircle renders an indeterminate reduced-motion-safe spinner", async () => {
  for (const value of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY]) {
    const html = await render(
      "ProgressCircle",
      { label: "Loading task progress", value, showValue: true },
      undefined,
      "progress-circle",
    );
    assert.match(html, /data-state="indeterminate"/);
    assert.match(html, /aria-label="Loading task progress"/);
    assert.doesNotMatch(html, /aria-valuenow/);
    assert.doesNotMatch(html, /aria-valuetext/);
    assert.match(html, /stroke-dasharray="25 75"/);
    assert.match(html, /stroke-dashoffset="0"/);
    assert.match(html, /motion-safe:animate-spin/);
    assert.doesNotMatch(html, />\d+%<\/span>/);
  }
});
test("ProgressCircle center slot takes precedence over the built-in percentage", async () => {
  const html = await render(
    "ProgressCircle",
    { label: "Uploading", showValue: true, value: 68 },
    "Done",
    "progress-circle",
  );
  assert.match(html, /Done<!--\]-->/);
  assert.doesNotMatch(html, />68%<\/span>/);
});
test("ProgressCircle exports its component and variants", async () => {
  const progressCircle = await server.ssrLoadModule(
    "/src/components/ui/progress-circle/index.ts",
  );
  assert.ok(progressCircle.ProgressCircle);
  assert.equal(typeof progressCircle.progressCircleVariants, "function");
});
test("ScrollingText preserves arbitrary slotted links and its activation mode", async () => {
  const { default: component } = await server.ssrLoadModule(
    "/src/components/ui/scrolling-text/ScrollingText.vue",
  );
  const html = await renderToString(
    createSSRApp({
      render: () =>
        h(
          component,
          { class: "w-full", mode: "always" },
          {
            default: () =>
              h(
                "a",
                {
                  class: "inline-block",
                  href: "/artists/aurora",
                  "data-track-id": "track-1",
                },
                "A very long track title",
              ),
          },
        ),
    }),
  );

  assert.match(html, /data-slot="scrolling-text"/);
  assert.match(html, /data-mode="always"/);
  assert.match(html, /class="[^"]*overflow-hidden[^"]*w-full/);
  assert.match(html, /class="inline-block w-max"/);
  assert.match(
    html,
    /<a class="inline-block" href="\/artists\/aurora" data-track-id="track-1">A very long track title<\/a>/,
  );
  assert.equal(
    (html.match(/A very long track title/g) ?? []).length,
    1,
    "Slotted content is rendered once rather than duplicated for the animation",
  );
});
test("ScrollingText calculations enforce its overflow threshold and timing defaults", async () => {
  const timing = await server.ssrLoadModule("/src/lib/scrolling-text.ts");

  assert.equal(timing.SCROLLING_TEXT_SPEED_PX_PER_SECOND, 30);
  assert.equal(timing.SCROLLING_TEXT_HOLD_MS, 1500);
  assert.equal(timing.scrollingTextActivatesAutomatically("hover"), false);
  assert.equal(timing.scrollingTextActivatesAutomatically("always"), true);
  assert.equal(timing.scrollingTextOverflowDistance(320, 200), 120);
  assert.equal(timing.scrollingTextOverflowDistance(200, 200), 0);
  assert.equal(timing.scrollingTextOverflowDistance(201, 200), 0);
  assert.equal(timing.scrollingTextOverflowDistance(Number.NaN, 200), 0);
  assert.equal(timing.scrollingTextTravelDuration(120), 4000);
  assert.equal(timing.scrollingTextLoopDuration(120), 11000);
  assert.equal(timing.scrollingTextLoopDuration(0), 0);
  assert.deepEqual(
    timing
      .scrollingTextKeyframes(120)
      .map((frame: { offset: number; transform: string }) => [
        frame.offset,
        frame.transform,
      ]),
    [
      [0, "translateX(0)"],
      [4 / 11, "translateX(-120px)"],
      [5.5 / 11, "translateX(-120px)"],
      [9.5 / 11, "translateX(0)"],
      [1, "translateX(0)"],
    ],
  );
});
test("gradient keeps primary blobs decorative and content above them", async () => {
  const html = await render(
    "Gradient",
    {
      as: "main",
      class: "min-h-dvh",
      colors: ["var(--primary)"],
      intensity: "strong",
      speed: 2,
    },
    "Onboarding",
  );
  assert.match(html, /^<main[^>]*data-slot="gradient"/);
  assert.match(html, /aria-hidden="true"/);
  assert.equal(
    (html.match(/gradient__axis gradient__axis--/g) ?? []).length,
    5,
  );
  assert.equal(
    (html.match(/--gradient-color-\d:var\(--primary\)/g) ?? []).length,
    5,
  );
  assert.match(html, /--gradient-strength:1/);
  assert.match(html, /--gradient-speed:2/);
  assert.match(html, /class="gradient__grain"/);
  assert.match(html, /class="gradient__content"/);
  assert.match(html, /Onboarding/);

  const withoutGrain = await render("Gradient", { grain: false });
  assert.doesNotMatch(withoutGrain, /gradient__grain/);
});
