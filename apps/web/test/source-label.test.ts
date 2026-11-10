import assert from "node:assert/strict";
import test from "node:test";
import { sourceFolderName } from "../app/lib/source-label.ts";

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
