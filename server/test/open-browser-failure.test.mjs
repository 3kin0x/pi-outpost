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
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { startServer } from "./harness.mjs";

// openlore: {"domain":"cli","requirement":"StartingOpensTheInterface","scenario":"AFailedOpenIsNotAFailedStart","specFile":"openspec/changes/ship-standalone-executables/specs/cli/spec.md"}
describe("a failed browser open", () => {
  test("leaves the server started, serving, and still printing its address", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pi-outpost-open-fail-"));
    let server;
    try {
      server = await startServer(
        root,
        // The harness switches opening off for the whole suite; this is the one test
        // that needs it on.
        { openBrowser: true },
        // PATH emptied, so `open`/`xdg-open`/`start` resolves to nothing. CI is cleared
        // too, or shouldOpenBrowser would decline before the opener is ever reached and
        // the test would pass without touching the path it is about.
        { env: { PATH: "", CI: undefined } },
      );

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
