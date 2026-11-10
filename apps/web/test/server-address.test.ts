import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SERVER_ADDRESS,
  normalizeServerAddress,
  safeRedirectPath,
  serverLabel,
} from "../app/lib/server-address.ts";

test("normalizes common self-hosted server addresses", () => {
  assert.equal(DEFAULT_SERVER_ADDRESS, "http://127.0.0.1:17430");
  assert.equal(
    normalizeServerAddress(" 192.168.1.20:3001/ "),
    "http://192.168.1.20:3001",
  );
  assert.equal(
    normalizeServerAddress("https://music.example.com/peridot/"),
    "https://music.example.com/peridot",
  );
  assert.equal(
    serverLabel("https://music.example.com/peridot"),
    "music.example.com/peridot",
  );
});

test("only accepts local application redirect paths", () => {
  assert.equal(safeRedirectPath("/library?genre=jazz"), "/library?genre=jazz");
  assert.equal(safeRedirectPath("//example.com"), "/");
  assert.equal(safeRedirectPath("https://example.com"), "/");
  assert.equal(safeRedirectPath(["/library"]), "/");
});

test("rejects unsafe or incomplete server addresses", () => {
  assert.throws(() => normalizeServerAddress(""), /Enter the address/);
  assert.throws(
    () => normalizeServerAddress("ftp://music.example.com"),
    /HTTP or HTTPS/,
  );
  assert.throws(
    () => normalizeServerAddress("https://user:secret@example.com"),
    /without credentials/,
  );
  assert.throws(
    () => normalizeServerAddress("https://example.com?token=secret"),
    /without credentials/,
  );
});
