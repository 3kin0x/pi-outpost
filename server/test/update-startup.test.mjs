/**
 * The two properties of the startup update check that only exist at process level.
 *
 * Everything else about the notice is a pure decision, unit-tested next door. These
 * two are not decisions — they are consequences of how the check is scheduled, and
 * both fail silently in the one situation nobody reproduces by hand: a registry that
 * accepts the connection and then says nothing at all.
 *
 * That registry is a real socket here, not an unroutable address. The obvious choice
 * is a reserved one like 192.0.2.1, and it is wrong: on a host with no route to it
 * the connection is refused in about 150 ms, so nothing is ever pending and both
 * tests pass whatever the code does. A listener that accepts and never replies hangs
 * for the full timeout, on every machine, which is the only version of this that can
 * fail.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, test } from "node:test";
import { startServer } from "./harness.mjs";

const SERVER_SRC = fileURLToPath(new URL("../src", import.meta.url));

/**
 * Accepts, holds the socket, answers nothing.
 *
 * Everything it owns is unref'd — the listener and every socket it accepts. A black
 * hole that keeps its own test process alive is the same bug these tests are about,
 * one level up: the assertions passed on CI and then the run sat for two minutes and
 * was cancelled, because nothing was left to do and something was still holding the
 * loop. `after` closes it too; the unrefs mean a mis-ordered teardown cannot hang.
 */
const sockets = new Set();
const blackHole = net.createServer((socket) => {
  socket.unref();
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});
await new Promise((resolve) => blackHole.listen(0, "127.0.0.1", resolve));
blackHole.unref();
const BLACK_HOLE = `http://127.0.0.1:${blackHole.address().port}`;

after(async () => {
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => blackHole.close(resolve));
});

// openlore: {"domain":"update","requirement":"StartupNoticeIsNonBlocking","scenario":"StartupIsNotDelayedByTheCheck","specFile":"openspec/changes/add-cli-update-command/specs/update/spec.md"}
describe("a registry that never answers", () => {
  test("does not delay the server accepting connections", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pi-outpost-update-startup-"));
    let server;
    try {
      const began = Date.now();
      server = await startServer(root, { updateCheck: true, updateRegistry: BLACK_HOLE });
      // startServer resolves on the first /health answer, so this interval contains
      // the whole startup. The registry timeout is 10s; anything near it means the
      // check was awaited somewhere on the startup path.
      const elapsed = Date.now() - began;
      assert.ok(elapsed < 10_000, `startup took ${elapsed} ms with an unresponsive registry`);

      const health = await fetch(`${server.base}/health`);
      assert.equal(health.status, 200);
    } finally {
      if (server) await server.stop();
      await rm(root, { recursive: true, force: true });
    }
  });
});

// openlore: {"domain":"update","requirement":"StartupNoticeIsNonBlocking","scenario":"PendingCheckDoesNotHoldTheProcessOpen","specFile":"openspec/changes/add-cli-update-command/specs/update/spec.md"}
describe("a check still in flight", () => {
  test("does not keep the process alive", async () => {
    // Not the server: it holds a listening socket open by design, so it could never
    // show this either way. A process whose *only* pending work is the check exits
    // immediately when that work cannot hold the loop, and waits out the full
    // registry timeout when it can — which is the regression this guards.
    const agentDir = await mkdtemp(path.join(tmpdir(), "pi-outpost-unref-"));
    const script = `
      import { runStartupUpdateNotice } from ${JSON.stringify(path.join(SERVER_SRC, "update.ts"))};
      void runStartupUpdateNotice({
        version: "0.8.0",
        agentDir: ${JSON.stringify(agentDir)},
        settings: { updateCheck: true },
        channel: "global",
        registry: ${JSON.stringify(BLACK_HOLE)},
        log: () => {},
      });
    `;

    const began = Date.now();
    try {
      const code = await new Promise((resolve, reject) => {
        const child = execFile(
          process.execPath,
          ["--import", "tsx/esm", "--input-type=module", "--eval", script],
          { cwd: path.dirname(SERVER_SRC), timeout: 9_000 },
          (error) => {
            if (error && error.killed) reject(new Error("the process was still alive with a check in flight"));
            else resolve(error?.code ?? 0);
          },
        );
        child.on("error", reject);
      });

      const elapsed = Date.now() - began;
      assert.equal(code, 0);
      // Generous, because it starts a runtime and a TypeScript loader. What it has
      // to separate from is a full 10s registry timeout.
      assert.ok(elapsed < 8_000, `the process lingered ${elapsed} ms for a pending check`);
    } finally {
      await rm(agentDir, { recursive: true, force: true });
    }
  });
});
