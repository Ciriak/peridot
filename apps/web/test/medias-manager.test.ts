import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("the medias manager is an administrator-only paged datatable", async () => {
  const [layout, page] = await Promise.all([
    source("../app/layouts/settings.vue"),
    source("../app/pages/settings/medias.vue"),
  ]);
  assert.match(layout, /labelKey: "settings\.medias"/);
  assert.match(layout, /to: "\/settings\/medias"/);
  assert.match(layout, /wideContent/);
  assert.match(page, /role="table"/);
  assert.doesNotMatch(page, /settings\.medias\.description/);
  assert.doesNotMatch(page, /settings\.medias\.title/);
  assert.match(page, /min-h-0 flex-1 overflow-auto/);
  assert.match(page, /sticky top-0/);
  assert.match(page, /:title="media\.updatedAt"/);
  assert.match(page, /settings\.medias\.filters/);
  assert.match(page, /refDebounced/);
  assert.match(page, /pageNumbers/);
  assert.match(page, /pageSize/);
  assert.match(page, /settings\.medias\.adminRequired/);
  assert.match(page, /MediaManagerDrawer/);
  assert.match(page, /createAdminMedia/);
  assert.match(page, /deleteAdminMedia/);
  assert.match(page, /updateAdminMediaField/);
  assert.match(page, /resetAdminMediaField/);
});

test("the media detail drawer exposes inline media and copy fields", async () => {
  const [drawer, editor] = await Promise.all([
    source("../app/components/MediaManagerDrawer.vue"),
    source("../app/components/AdminFieldEditor.vue"),
  ]);
  for (const field of [
    "mediaType",
    "title",
    "artist",
    "album",
    "genres",
    "metadataMode",
    "metadataProviderId",
    "metadataDetails",
    "coverId",
    "librarySourceId",
    "relativePath",
    "mimeType",
    "fileSizeBytes",
    "fileModifiedAt",
    "audioLossless",
    "audioBitrate",
    "recordingIdentityKeys",
  ]) {
    assert.match(drawer, new RegExp(`['"]${field}['"]`), field);
  }
  assert.match(drawer, /settings\.medias\.createCopy|createCopy/);
  assert.match(drawer, /settings\.medias\.deleteFile/);
  assert.match(drawer, /settings\.medias\.deleteMedia/);
  assert.match(editor, /@blur=/);
  assert.match(editor, /event\.key === "Enter"/);
  assert.match(editor, /event\.key === "Escape"/);
  assert.match(editor, /settings\.medias\.manual/);
  assert.match(editor, /settings\.medias\.resetField/);
});

test("media manager API calls use encoded administrator routes", async () => {
  const client = await source("../app/lib/peridot-client.ts");
  assert.match(client, /\/api\/admin\/medias/);
  assert.match(client, /overrides\/\$\{encodeURIComponent\(field\)\}/);
  assert.match(client, /copies\/\$\{encodeURIComponent\(copyId\)\}/);
  assert.match(client, /listAdminMedias/);
  assert.match(client, /createAdminMediaCopy/);
});
