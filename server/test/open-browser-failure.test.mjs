/**
 * A browser that will not start is not a reason for a server to stop.
 *
 * The unit test beside this one proves `openBrowser` answers `false` instead of
 * throwing. That is half the contract: the other half is what the server does with
 * that answer, and it lives at the call site in index.ts, which deliberately does not
 * await the outcome. Nothing asserted that. A regression that awaited the promise, or
 * let a rejection escape, would take the server down at the exact moment it had just
 * finished starting — and every existing test would stay green, because the suite
 * turns browser-opening off.
 *
 * So this one turns it on and guarantees the opener fails: the child's PATH is emptied,
 * so the platform opener cannot be found and `spawn` fails with ENOENT. That also keeps
 * the test honest about the developer's desktop — a run that opened a real tab would
 * mean the opener had *not* failed, and the test would not be exercising this at all.
 *
 * The web UI is supplied by the test rather than assumed. A server with no interface of
 * its own has nothing to open and correctly declines to try, so on a machine where
 * `web/dist` has not been built this would pass locally and assert nothing — which is
 * exactly what it did on CI, where nothing builds the UI before the server suite.
 *
 * POSIX only, and not out of laziness. Emptying PATH is a precise instrument on unix —
 * node is spawned by absolute path, so only the opener lookup breaks. On Windows it is
 * a blunt one: it breaks enough of the child's environment that the server never comes
 * up, the harness waits out its deadline, and the whole run is interrupted rather than
 * failed. The half of this contract that is platform-independent — that a failed open
 * yields `false` instead of throwing — is asserted on every platform by
 * openBrowser.test.ts. What is left here is the wiring, which is the same code
 * everywhere.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { startServer } from "./harness.mjs";

// openlore: {"domain":"cli","requirement":"StartingOpensTheInterface","scenario":"AFailedOpenIsNotAFailedStart","specFile":"openspec/changes/ship-standalone-executables/specs/cli/spec.md"}
describe("a failed browser open", { skip: process.platform === "win32" ? "PATH cannot be emptied safely on Windows" : false }, () => {
  test("leaves the server started, serving, and still printing its address", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pi-outpost-open-fail-"));
    let server;
    try {
      // An interface for the server to have. Without one it opens nothing, by design,
      // and this test would assert against a decision it never reached.
      const webDist = path.join(root, "web-dist");
      await mkdir(webDist, { recursive: true });
      await writeFile(path.join(webDist, "index.html"), "<!doctype html><title>stub</title>");

      server = await startServer(
        root,
        // The harness switches opening off for the whole suite; this is the one test
        // that needs it on.
        { openBrowser: true },
        // PATH emptied, so `open`/`xdg-open`/`start` resolves to nothing. CI is cleared
        // too, or shouldOpenBrowser would decline before the opener is ever reached and
        // the test would pass without touching the path it is about.
        { env: { PATH: "", CI: undefined, PI_OUTPOST_WEB_DIST: webDist } },
      );

      // Fail loudly rather than silently skipping: if the server is not serving an
      // interface, the rest of this test proves nothing.
      assert.match(server.log(), /serving web UI from/);

      // startServer only resolves once /health answers, so reaching here already means
      // the server survived the open attempt. Assert it deliberately rather than
      // leaning on that: this is the thing being tested.
      const health = await fetch(`${server.base}/health`);
      assert.equal(health.status, 200);

      // And the address is printed either way — it is what the operator would have
      // used before any of this existed.
      assert.match(server.log(), /\[server\] http:\/\/127\.0\.0\.1:\d+\//);

      // The open must actually have been attempted and actually have failed, or the
      // two assertions above would hold for a server that never tried — which is how
      // this test would rot into passing for the wrong reason.
      assert.match(server.log(), /could not open a browser/);
    } finally {
      if (server) await server.stop();
      await rm(root, { recursive: true, force: true });
    }
  });
});
