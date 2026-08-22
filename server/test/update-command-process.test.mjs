/**
 * What `pi-outpost update` does at process level, which is where it was broken.
 *
 * Every other test of this command injects a `fetchImpl`, so the real request was
 * never on the path being asserted — and the real request unref'd its socket
 * unconditionally. `runUpdateCommand` is awaited at top level in index.ts with nothing
 * else pending, so the loop emptied before the registry answered: the command printed
 * no verdict at all and node exited 13 complaining about an unsettled top-level await.
 * Thirty-five scenarios passed over it.
 *
 * So these drive the real `registryRequest` against a real socket, in a child process
 * that awaits the command the way the binary does. The assertion that matters is not
 * the text — it is that there *is* output, and that the exit code is the command's own.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, test } from "node:test";

const UPDATE_MODULE = pathToFileURL(fileURLToPath(new URL("../src/update.ts", import.meta.url))).href;
const SERVER_DIR = fileURLToPath(new URL("..", import.meta.url));

/** The parent's environment, minus the coverage sink a child must not write into. */
function envWithoutCoverageSink() {
  const { NODE_V8_COVERAGE: _sink, ...rest } = process.env;
  return rest;
}

/** A registry that answers, for the duration of one test. */
async function withRegistry(version, body) {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ version }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  server.unref();
  try {
    return await body(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

/**
 * A registry that accepts and never answers. An unroutable address will not do: it is
 * refused in milliseconds, so nothing is ever pending and the test passes whatever the
 * code does.
 */
async function withBlackHole(body) {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    socket.unref();
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  server.unref();
  try {
    return await body(`http://127.0.0.1:${server.address().port}`);
  } finally {
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    server.close();
  }
}

/** Awaits the command at top level, as index.ts does, and exits with what it returned. */
async function runCommandInChild(registry, { timeout }) {
  const script = `
    import { runUpdateCommand } from ${JSON.stringify(UPDATE_MODULE)};
    const code = await runUpdateCommand({
      version: "0.1.0",
      checkOnly: true,
      channel: "global",
      registry: ${JSON.stringify(registry)},
    });
    process.exit(code);
  `;
  return await new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      ["--import", "tsx/esm", "--input-type=module", "--eval", script],
      { cwd: SERVER_DIR, timeout, env: envWithoutCoverageSink() },
      (error, stdout, stderr) => {
        if (error && error.killed) reject(new Error(`the command never finished:\n${stdout}${stderr}`));
        else resolve({ code: error?.code ?? 0, stdout, stderr });
      },
    );
    child.on("error", reject);
  });
}

// openlore: {"domain":"update","requirement":"UpdateReportsWhatIsAvailable","scenario":"TheCheckOutlivesNothingButItselfIsNotCutShort","specFile":"openspec/changes/add-cli-update-command/specs/update/spec.md"}
describe("a check somebody asked for", () => {
  test("prints its verdict rather than draining the process first", async () => {
    await withRegistry("9.9.9", async (registry) => {
      const { code, stdout, stderr } = await runCommandInChild(registry, { timeout: 30_000 });

      // The exit code first: 13 is node's for an unsettled top-level await, and it is
      // what this produced before the request could be ref'd. Naming it separates the
      // regression from any other non-zero exit.
      assert.notEqual(code, 13, `the process drained with the check still in flight:\n${stdout}${stderr}`);
      assert.equal(code, 0, `update --check exited ${code}:\n${stdout}${stderr}`);
      assert.match(stdout, /0\.1\.0 is installed; 9\.9\.9 is available/);
      // And nothing about an await that never settled.
      assert.doesNotMatch(stderr, /unsettled top-level await/);
    });
  });
});

// openlore: {"domain":"update","requirement":"UpdateReportsWhatIsAvailable","scenario":"TheCheckOutlivesNothingButItselfIsNotCutShort","specFile":"openspec/changes/add-cli-update-command/specs/update/spec.md"}
describe("a registry that never answers", () => {
  test("is reported as a failed check, not as silence", async () => {
    // The other half of the same property. The timeout is what turns a hang into a
    // verdict, and an unref'd timer cannot fire in a process with nothing else to do —
    // it would exit silently instead, which is the answer that stops someone looking.
    await withBlackHole(async (registry) => {
      const { code, stdout, stderr } = await runCommandInChild(registry, { timeout: 30_000 });

      assert.equal(code, 1, `expected a reported failure, got ${code}:\n${stdout}${stderr}`);
      assert.match(stdout, /could not check for updates/);
      assert.doesNotMatch(stdout, /newest published version/);
    });
  });
});
