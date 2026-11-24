import assert from "node:assert/strict";
import test from "node:test";
import { icons } from "../app/lib/icons.ts";
import {
  sourceFolderName,
  sourceKindIcon,
  sourceKindLabelKey,
} from "../app/lib/source-label.ts";

test("source folder names support Windows and POSIX paths", () => {
  assert.equal(sourceFolderName("D:\\Music\\Albums"), "Albums");
  assert.equal(sourceFolderName("D:\\Music\\Albums\\"), "Albums");
  assert.equal(sourceFolderName("/srv/music/library"), "library");
  assert.equal(sourceFolderName("/srv/music/library/"), "library");
});

test("source folder names preserve filesystem roots and trim surrounding space", () => {
  assert.equal(sourceFolderName(" /srv/library "), "library");
  assert.equal(sourceFolderName("/"), "/");
  assert.equal(sourceFolderName("D:\\"), "D:");
  assert.equal(sourceFolderName(""), "");
});

test("source kinds map to bundled icons and localized labels", () => {
  assert.equal(sourceKindIcon("path"), icons.folder);
  assert.equal(sourceKindIcon("jellyfin"), icons.jellyfin);
  assert.equal(sourceKindIcon("torznab"), icons.globe);
  assert.equal(sourceKindIcon(null), null);
  assert.equal(sourceKindIcon(undefined), null);

  assert.equal(sourceKindLabelKey("path"), "settings.sources.path");
  assert.equal(
    sourceKindLabelKey("jellyfin"),
    "settings.sources.jellyfin.title",
  );
  assert.equal(sourceKindLabelKey("torznab"), "indexer.title");
  assert.equal(sourceKindLabelKey(null), null);
});
