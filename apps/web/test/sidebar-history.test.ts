import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("desktop shell sidebar history controls navigate back and forward", async () => {
  const layout = await readFile(
    new URL("../app/layouts/default.vue", import.meta.url),
    "utf8",
  );
  const brandPosition = layout.indexOf('logoNop"');
  const historyPosition = layout.indexOf(
    'class="hidden shrink-0 items-center gap-1 md:flex"',
  );
  const mobileClosePosition = layout.indexOf('class="md:hidden"');
  const historyControls = layout.slice(historyPosition, mobileClosePosition);

  assert.ok(brandPosition < historyPosition);
  assert.ok(historyPosition < mobileClosePosition);
  assert.match(
    layout,
    /v-if="desktopRuntime"[\s\S]*?class="hidden shrink-0 items-center gap-1 md:flex"/,
    "History controls are rendered only in the desktop shell",
  );
  assert.match(
    layout,
    /const desktopRuntime = ref\(false\)/,
    "Desktop-only controls start hidden during startup",
  );
  assert.match(
    layout,
    /onMounted\(\(\) => \{\s+desktopRuntime\.value = isTauriRuntime\(\);/,
    "The desktop shell identity is resolved after mounting",
  );
  assert.match(
    historyControls,
    /:aria-label="t\('navigation\.historyBack'\)"[\s\S]*?@click="router\.back\(\)"[\s\S]*?:icon="icons\.caretLeft"[\s\S]*?class="size-5"/,
  );
  assert.match(
    historyControls,
    /:aria-label="t\('navigation\.historyForward'\)"[\s\S]*?@click="router\.forward\(\)"[\s\S]*?:icon="icons\.caretRight"[\s\S]*?class="size-5"/,
  );
});
