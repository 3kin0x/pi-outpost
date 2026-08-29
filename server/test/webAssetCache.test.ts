/**
 * What the executable tells a browser it may keep.
 *
 * The failure this guards against has no error and no symptom at the time it
 * happens: a page held across an update names the previous build's asset files,
 * so the interface runs code the server no longer serves. It surfaces later, as
 * behaviour that does not match the code on disk.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cacheControlFor } from "../src/webAssetCache.ts";

describe("what may be kept across an update", () => {
  test("a content-hashed asset may be kept forever, because a new build renames it", () => {
    assert.equal(cacheControlFor("/assets/index-DISf67d.js"), "public, max-age=31536000, immutable");
    assert.equal(cacheControlFor("/assets/index-abc123.css"), "public, max-age=31536000, immutable");
  });

  test("the page is revalidated every time, because its name never changes", () => {
    // index.html is where the hashed names are written down. A held copy of it
    // pins the whole previous build, which is the stale shell in its usual form.
    assert.equal(cacheControlFor("/index.html"), "no-cache");
  });

  test("the manifest and the icons an install depends on are revalidated too", () => {
    for (const url of ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png"]) {
      assert.equal(cacheControlFor(url), "no-cache", `${url} may not be held across an update`);
    }
  });

  test("anything else at a fixed name is revalidated rather than assumed stable", () => {
    // The default is the safe one: a new asset added at a fixed name must not
    // inherit the immutable rule by accident.
    assert.equal(cacheControlFor("/favicon.svg"), "no-cache");
    assert.equal(cacheControlFor("/some-future-file.json"), "no-cache");
  });
});
