import { createServer } from "node:http";
import { access, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SEEDED_MESSAGES } from "./fixtures/seeded-transcript";
// The same harness the server's own integration tests use: a real server, in its
// own process group, against a throwaway workspace, with PI_OFFLINE set so the
// SDK's model runtime never reaches the network.
// @ts-expect-error -- .mjs harness, no types; the shape is asserted below
import { makeWorkspace, startServer } from "../server/test/harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..");
const HOST_DIST = path.join(HERE, "dist-host");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json",
};

/**
 * Serves the built host page on its own origin.
 *
 * Its own origin matters: a widget loaded same-origin with the backend would
 * never exercise the cross-origin path that every real host application takes.
 */
function serveHostPage(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const requested = new URL(request.url ?? "/", "http://localhost").pathname;
    const relative = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
    // Name arithmetic, then a containment check: this serves a build directory
    // to a browser we control, and it still does not get to read outside it.
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
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
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

/**
 * The environment the test server gets: no provider key except one that is not
 * real.
 *
 * Both halves matter. Without the removals the run inherits whatever the
 * developer has configured, and the suite passes on their machine and fails on a
 * runner that has nothing — which is exactly what happened the first time this
 * job ran in CI: with no key at all the app renders the onboarding screen ("No
 * model provider is set up yet") and there is no composer to find. Without the
 * fake key it would now fail everywhere instead.
 *
 * The key is never used: PI_OFFLINE keeps the runtime off the network and no
 * test sends a message. It exists so the interface under test is the interface,
 * not the setup wizard.
 */
function onlyOneFakeProvider(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const name of Object.keys(process.env)) {
    if (/API_KEY|AUTH_TOKEN|_TOKEN$/.test(name)) env[name] = undefined;
  }
  env.ANTHROPIC_API_KEY = "sk-ant-not-a-real-key";
  return env;
}

/**
 * Newest mtime under `dir` among the files a build actually consumes.
 *
 * Extensions, not everything: notes and fixtures sit next to source, and a
 * gate that rebuilds the world because a README was edited is a gate people
 * learn to work around.
 */
async function newestChange(dir: string): Promise<number> {
  const skip = new Set(["node_modules", "dist", "dist-host", "coverage", ".turbo"]);
  const built = /\.(ts|tsx|js|jsx|mjs|cjs|css|html|json)$/;
  let newest = 0;
  const walk = async (at: string): Promise<void> => {
    const entries = await readdir(at, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".") || skip.has(entry.name)) continue;
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (built.test(entry.name)) newest = Math.max(newest, (await stat(full)).mtimeMs);
    }
  };
  await walk(dir);
  return newest;
}

/**
 * Refuses to run a browser suite against a build older than its own source.
 *
 * Existence was the only check, and existence is not the question: a stale
 * bundle serves yesterday's behaviour perfectly happily. A fix can then be
 * written, the suite run, and every assertion pass or fail against code that is
 * not the code under test — which is exactly what happened while an overlay fix
 * sat unbuilt and the widget kept showing the bug it had already lost.
 *
 * Reads mtimes, so it assumes the build ran in the same checkout as the sources
 * it is compared against — true of this repo's CI, which builds and runs the
 * browser job together. Restoring `web/dist`, `embed/dist` or `dist-host` from a
 * cache across jobs would hand this function timestamps older than a fresh
 * checkout's, and it would refuse a build that is in fact current.
 */
async function assertFresh(artifact: string, sources: readonly string[], command: string): Promise<void> {
  const built = (await stat(artifact)).mtimeMs;
  for (const source of sources) {
    const changed = await newestChange(path.join(REPO, source));
    if (changed > built) {
      throw new Error(
        `${path.relative(REPO, artifact)} is older than ${source} — run \`${command}\` first ` +
          `(built ${new Date(built).toISOString()}, ${source} changed ${new Date(changed).toISOString()})`,
      );
    }
  }
}

/**
 * Boots what both specs need and hands the URLs to the workers through the
 * environment. Returning a function registers it as the teardown.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  // Both specs read a built artifact rather than source. Saying which one is
  // missing beats the cascade of 404s and blank pages that follows otherwise.
  const required = [
    [path.join(REPO, "web/dist/index.html"), "npm run build --workspace web", ["web/src", "ui/src", "shared/src"]],
    [
      path.join(REPO, "embed/dist/pi-outpost-embed.js"),
      "npm run build --workspace @pi-outpost/embed",
      ["embed/src", "ui/src", "web/src", "shared/src"],
    ],
    [path.join(HOST_DIST, "index.html"), "npm run build:e2e-host", ["e2e/host", "embed/dist"]],
  ] as const;
  for (const [file, command, sources] of required) {
    await access(file).catch(() => {
      throw new Error(`missing ${path.relative(REPO, file)} — run \`${command}\` first`);
    });
    await assertFresh(file, sources, command);
  }

  const host = await serveHostPage();

  const root = await makeWorkspace({
    "readme.md": "# workspace\n\nA file the browser is allowed to see.\n",
    // A prompt template, so `/` has something to autocomplete. Discovered from
    // the workspace's own .pi/prompts, the same way a real project's are.
    ".pi/prompts/greet.md": "---\ndescription: say hello\n---\n\nSay hello.\n",
  });
  const server = await startServer(
    root,
    {
      // The host page is a different origin, which is the whole point of the widget.
      server: { allowedOrigins: [host.url] },
      branding: { title: "embed smoke" },
      // The harness disables template discovery; this server wants it, so `/`
      // has a command to complete.
      noPromptTemplates: false,
    },
    { env: onlyOneFakeProvider() },
  );

  // A second server, token-protected. The widget then sends `Authorization`,
  // which is not a CORS-safelisted header, so the browser preflights every
  // request — the one path a curl-shaped test cannot exercise, because curl
  // never sends a preflight of its own accord.
  const guarded = await startServer(
    await makeWorkspace({ "readme.md": "# guarded workspace\n" }),
    {
      server: { allowedOrigins: [host.url], token: E2E_TOKEN },
      branding: { title: "guarded smoke" },
    },
    { env: onlyOneFakeProvider() },
  );

  // A third server, whose session already holds the diagrams. Its own server
  // because the transcript comes from a scripted RPC child rather than the
  // embedded runtime, and because it is the one configured to open light —
  // `branding.defaultTheme` is untestable on a server whose host page names a
  // theme of its own.
  const diagramRoot = await makeWorkspace({ "readme.md": "# diagrams\n" });
  const fakeConfig = path.join(diagramRoot, "fake-rpc.json");
  await writeFile(
    fakeConfig,
    JSON.stringify({ messages: SEEDED_MESSAGES, state: { sessionId: "diagrams-1" } }),
  );
  const diagrams = await startServer(
    diagramRoot,
    {
      server: { allowedOrigins: [host.url] },
      branding: { title: "diagram smoke", defaultTheme: "light" },
      agentRuntime: {
        mode: "rpc",
        executable: process.execPath,
        args: [path.join(REPO, "server/test/fixtures/fake-pi-rpc.mjs")],
        startupTimeoutMs: 20_000,
      },
      // RPC refuses to pair with a sandbox it cannot enforce on a child that
      // builds its own tools; the harness sandboxes by default.
      sandbox: undefined,
    },
    { env: { ...onlyOneFakeProvider(), FAKE_PI_RPC_CONFIG: fakeConfig } },
  );

  process.env.PI_E2E_HOST_URL = host.url;
  process.env.PI_E2E_SERVER_URL = server.base;
  process.env.PI_E2E_GUARDED_URL = guarded.base;
  process.env.PI_E2E_DIAGRAMS_URL = diagrams.base;
  process.env.PI_E2E_TOKEN = E2E_TOKEN;

  return async () => {
    await diagrams.stop();
    await guarded.stop();
    await server.stop();
    await host.close();
  };
}

/** Not a secret: a literal the guarded test server checks against. */
const E2E_TOKEN = "e2e-smoke-token";
