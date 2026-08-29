/**
 * When a browser is opened, and where it is sent.
 *
 * The decision is the interesting part. The obvious test — "is there a terminal" —
 * gets the case that most needs opening exactly backwards, so it is asserted here in
 * both directions.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  OWN_WINDOW_BROWSERS,
  browsableUrl,
  chooseOpener,
  openBrowser,
  ownWindowOpenerFor,
  shouldOpenBrowser,
} from "../src/openBrowser.ts";

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

// ---------------------------------------------------------------------------
// A window of its own — and what happens where none can be presented.
// ---------------------------------------------------------------------------
describe("presenting the interface in a window of its own", () => {
  /** A machine where exactly these candidates exist. */
  const machineWith = (...present: string[]) => (candidate: string) => present.includes(candidate);
  const NOTHING = () => false;
  const URL = "http://127.0.0.1:3141/";

  // openlore: scenario=ItOpensInAWindowOfItsOwn spec=cli
  test("every platform's candidates produce a command asking for the window", () => {
    // Driven off the production list: a candidate removed there fails here rather
    // than passing against a copy this test kept.
    for (const [platform, candidates] of Object.entries(OWN_WINDOW_BROWSERS)) {
      for (const candidate of candidates) {
        const opener = ownWindowOpenerFor(platform as NodeJS.Platform, URL, machineWith(candidate));
        assert.ok(opener, `${platform}: ${candidate} produced no opener`);
        assert.ok(
          opener.args.includes(`--app=${URL}`),
          `${platform}: ${candidate} does not ask for a window of its own`,
        );
      }
    }
  });

  test("the first candidate present is the one used", () => {
    const candidates = OWN_WINDOW_BROWSERS.win32;
    // Both present: the order in the list is the answer, not whichever the
    // filesystem happened to return first.
    const opener = ownWindowOpenerFor("win32", URL, machineWith(candidates[0], candidates[1]));
    assert.equal(opener?.command, candidates[0]);
  });

  test("macOS goes through `open`, since an app bundle is not a program to spawn", () => {
    const bundle = OWN_WINDOW_BROWSERS.darwin[0];
    const opener = ownWindowOpenerFor("darwin", URL, machineWith(bundle));
    assert.equal(opener?.command, "open");
    // `-n` asks for a new instance: an already-running browser would otherwise
    // raise its own window and ignore the request.
    assert.deepEqual(opener?.args, ["-na", bundle, "--args", `--app=${URL}`]);
  });

  // openlore: scenario=WhereNoOwnWindowIsPossible spec=cli
  test("a machine with no candidate gets no own-window opener", () => {
    for (const platform of Object.keys(OWN_WINDOW_BROWSERS)) {
      assert.equal(ownWindowOpenerFor(platform as NodeJS.Platform, URL, NOTHING), undefined);
    }
    // And a platform nothing is listed for, which must not throw.
    assert.equal(ownWindowOpenerFor("aix", URL, NOTHING), undefined);
  });

  // openlore: scenario=TheOperatorCanAskForATab spec=cli
  test("asking for a tab uses the platform's own opener, even where a window was possible", () => {
    // The whole difference between the two shapes is which command is chosen, so
    // that is what this asserts. Driving `openBrowser` instead would measure
    // whether a spawn succeeded, which depends on what the machine running the
    // test happens to have installed — green on a runner with xdg-open, red on a
    // laptop without it, and about nothing this change controls either way.
    const present = () => true;
    for (const platform of ["darwin", "win32", "linux"] as const) {
      const own = ownWindowOpenerFor(platform, URL, present);
      assert.ok(own, `${platform}: expected a window opener to be possible`);
      const chosen = chooseOpener(platform, URL, "browser", present);
      assert.notDeepEqual(chosen, own, `${platform}: a tab was asked for and the window opener was chosen`);
      assert.ok(
        !chosen.args.some((arg) => arg.startsWith("--app=")),
        `${platform}: the chosen command still asks for a window of its own`,
      );
    }
  });

  test("asking for a window on a machine that has none falls back to what this always did", () => {
    // The fallback is what makes a window of its own safe as the default: the
    // worst case is exactly what this did before. Asserted as the command chosen,
    // which is the same on every machine, rather than as a spawn that succeeds or
    // fails depending on what is installed where the test runs.
    for (const platform of ["darwin", "win32", "linux"] as const) {
      const withNone = chooseOpener(platform, URL, "window", () => false);
      const asATab = chooseOpener(platform, URL, "browser", () => false);
      assert.deepEqual(withNone, asATab, `${platform}: the fallback is not the platform opener`);
    }
  });
});
