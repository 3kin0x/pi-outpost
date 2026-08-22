/**
 * When a browser is opened, and where it is sent.
 *
 * The decision is the interesting part. The obvious test — "is there a terminal" —
 * gets the case that most needs opening exactly backwards, so it is asserted here in
 * both directions.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { browsableUrl, openBrowser, shouldOpenBrowser } from "../src/openBrowser.ts";

describe("whether to open a browser", () => {
  test("a desktop platform opens by default", () => {
    assert.equal(shouldOpenBrowser({ platform: "darwin", env: {} }), true);
    assert.equal(shouldOpenBrowser({ platform: "win32", env: {} }), true);
  });

  test("no terminal is not the absence of a person", () => {
    // A double-clicked executable has no TTY and is exactly the case that needs
    // opening: there is no terminal for the address to be printed to.
    assert.equal(shouldOpenBrowser({ platform: "darwin", env: {} }), true);
  });

  test("Linux needs a display server to be named", () => {
    assert.equal(shouldOpenBrowser({ platform: "linux", env: {} }), false);
    assert.equal(shouldOpenBrowser({ platform: "linux", env: { DISPLAY: ":0" } }), true);
    assert.equal(shouldOpenBrowser({ platform: "linux", env: { WAYLAND_DISPLAY: "wayland-0" } }), true);
  });

  test("a runner never has anyone watching", () => {
    assert.equal(shouldOpenBrowser({ platform: "darwin", env: { CI: "true" } }), false);
    // and CI=false is how some runners say "not one"
    assert.equal(shouldOpenBrowser({ platform: "darwin", env: { CI: "false" } }), true);
  });

  test("configuration overrides the platform, and the flags override both", () => {
    assert.equal(shouldOpenBrowser({ platform: "darwin", env: {}, configured: false }), false);
    assert.equal(shouldOpenBrowser({ platform: "linux", env: {}, configured: true }), true);
    assert.equal(shouldOpenBrowser({ platform: "darwin", env: {}, configured: false, explicit: true }), true);
    assert.equal(shouldOpenBrowser({ platform: "linux", env: { DISPLAY: ":0" }, explicit: false }), false);
    // even where nothing could show it: an explicit request is answered, not second-guessed
    assert.equal(shouldOpenBrowser({ platform: "linux", env: { CI: "true" }, explicit: true }), true);
  });
});

describe("where the browser is sent", () => {
  test("the bound port, which is the only true one when the OS chose it", () => {
    assert.equal(browsableUrl({ address: "127.0.0.1", port: 51234 }), "http://127.0.0.1:51234/");
  });

  test("a wildcard bind is not an address a browser can reach", () => {
    assert.equal(browsableUrl({ address: "0.0.0.0", port: 3141 }), "http://127.0.0.1:3141/");
    assert.equal(browsableUrl({ address: "::", port: 3141 }), "http://127.0.0.1:3141/");
  });

  test("a literal IPv6 address gets its brackets back", () => {
    assert.equal(browsableUrl({ address: "::1", port: 3141 }), "http://[::1]:3141/");
  });
});

describe("launching it", () => {
  test("an opener that is not there answers false rather than throwing", async () => {
    // Asked for an opener no machine has: the caller must get a verdict it can print,
    // not an exception that would take the server down with it. Asserted as `false`
    // and not merely as a boolean, because the first version of this resolved `true`
    // synchronously after `spawn` — before the `error` event could fire — so every
    // failed open reported success and the "open it yourself" line was unreachable.
    // The opener asked for is the one this host cannot have: `cmd` does not exist on a
    // unix box, and `xdg-open` does not exist on Windows. Naming a platform directly
    // would be flaky in the other direction — a Linux runner may well have xdg-open,
    // and the open would succeed.
    const absentHere: NodeJS.Platform = process.platform === "win32" ? "linux" : "win32";
    const opened = await openBrowser("http://127.0.0.1:3141/", absentHere);
    assert.equal(opened, false);
  });
});
