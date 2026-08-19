/**
 * A live embed, for pressing the buttons by hand.
 *
 * The browser suite boots this same shape and tears it down in the same second;
 * what a person needs is the shape left running. So: the built host page on its
 * own origin, and two servers behind it — a plain one (sandbox configured, so
 * Settings has something to show) and one whose session already holds the
 * seeded transcript (diagrams and the table).
 *
 *   npm run bench
 *
 * Serves `dist/`, so build first: web, then @pi-outpost/embed, then
 * `npm run build:e2e-host` — an unbuilt fix is invisible here.
 */
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SEEDED_MESSAGES } from "../e2e/fixtures/seeded-transcript";
// @ts-expect-error -- .mjs harness, no types
import { makeWorkspace, startServer } from "../server/test/harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..");
const HOST_DIST = path.join(REPO, "e2e/dist-host");
const HOST_PORT = Number(process.env.BENCH_PORT ?? 4321);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json",
};

function serveHostPage(port: number): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const requested = new URL(request.url ?? "/", "http://localhost").pathname;
    const relative = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
    const file = path.join(HOST_DIST, relative);
    if (!file.startsWith(HOST_DIST + path.sep) && file !== path.join(HOST_DIST, "index.html")) {
      response.writeHead(403).end();
      return;
    }
    readFile(file).then(
      (bytes) => {
        response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
        response.end(bytes);
      },
      () => response.writeHead(404).end(),
    );
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

/** No real provider key: nothing here talks to a model, and PI_OFFLINE keeps it that way. */
function onlyOneFakeProvider(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const name of Object.keys(process.env)) {
    if (/API_KEY|AUTH_TOKEN|_TOKEN$/.test(name)) env[name] = undefined;
  }
  env.ANTHROPIC_API_KEY = "sk-ant-not-a-real-key";
  return env;
}

const host = await serveHostPage(HOST_PORT);

const root = await makeWorkspace({
  "readme.md": "# workspace\n\nA file the browser is allowed to see.\n",
  "docs/notes.md": "# notes\n\nAnother file, so the tree has a folder in it.\n",
  ".pi/prompts/greet.md": "---\ndescription: say hello\n---\n\nSay hello.\n",
});
const plain = await startServer(
  root,
  {
    // Fixed ports, unlike the browser suite's: a bench whose URL changes every
    // run is a bench nobody keeps open in a tab.
    server: { allowedOrigins: [host.url], port: HOST_PORT + 1 },
    branding: { title: "bench" },
    noPromptTemplates: false,
  },
  { env: onlyOneFakeProvider() },
);

const diagramRoot = await makeWorkspace({ "readme.md": "# diagrams\n" });
const fakeConfig = path.join(diagramRoot, "fake-rpc.json");
await writeFile(fakeConfig, JSON.stringify({ messages: SEEDED_MESSAGES, state: { sessionId: "diagrams-1" } }));
const diagrams = await startServer(
  diagramRoot,
  {
    server: { allowedOrigins: [host.url], port: HOST_PORT + 2 },
    branding: { title: "bench diagrams", defaultTheme: "light" },
    agentRuntime: {
      mode: "rpc",
      executable: process.execPath,
      args: [path.join(REPO, "server/test/fixtures/fake-pi-rpc.mjs")],
      startupTimeoutMs: 20_000,
    },
    // RPC refuses a sandbox it cannot enforce on a child that builds its own tools.
    sandbox: undefined,
  },
  { env: { ...onlyOneFakeProvider(), FAKE_PI_RPC_CONFIG: fakeConfig } },
);

const link = (server: string) => `${host.url}/?server=${encodeURIComponent(server)}&theme=light`;
console.log("\n  embed bench — the widget inside a host page that fights it\n");
console.log(`  settings, files, sessions   ${link(plain.base)}`);
console.log(`  seeded transcript           ${link(diagrams.base)}   (diagrams + table)`);
console.log("\n  ctrl-c to stop\n");

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await diagrams.stop();
  await plain.stop();
  await host.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
