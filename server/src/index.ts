/**
 * Pi-outpost server: bridges a pi AgentSession to WebSocket clients.
 *
 * SECURITY: binds to 127.0.0.1 only (protects against the network) and
 * validates the Origin header on WebSocket upgrades (protects against
 * malicious webpages in the user's own browser — WS is exempt from CORS).
 * The agent has bash/edit/write tools: never weaken either check.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import type { WebSocket } from "ws";
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionServices,
  getAgentDir,
  type SessionInfo,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import {
  type ClientMessage,
  type ContextUsage,
  type CredentialStatus,
  type ExtensionUIResponse,
  type GitRevision,
  type ModelChoice,
  type ServerMessage,
  type SessionSnapshot,
  type SessionSummary,
  THINKING_LEVELS,
  type TreeNode,
  type WireImage,
  WORKTREE_REVISION,
} from "@pi-outpost/shared";
import {
  type AgentRuntime,
  type RuntimeEvent,
  type RuntimeTreeNode,
  RuntimeUnsupportedError,
} from "./agentRuntime.ts";
import { createEmbeddedRuntime } from "./embeddedRuntime.ts";
import { createRpcRuntime } from "./rpcRuntime.ts";
import { rpcResourceArgs, resolveToolsExtension } from "./rpcResourceArgs.ts";
import { TOOLS_ENV_VAR, type PiOutpostToolsSettings } from "./piOutpostTools.ts";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CliError, helpText, parseCli, readSecret, runInit } from "./cli.ts";
import { BuildExeError, buildExecutable } from "./buildExe.ts";
import { browsableUrl, openBrowser, shouldOpenBrowser } from "./openBrowser.ts";
import { allSkillPaths, ConfigWriteError, type EditableSettings, loadConfig, NoConfigError, persistEditableSettings } from "./config.ts";
import { listServerDirectories, ServerDirectoryError } from "./serverDirectories.ts";
import {
  CredentialError,
  CredentialSyncError,
  knownProviders,
  type ProviderDeclaration,
  providerConfig,
  storeApiKey,
  storeProvider,
  tlsHint,
  validBaseUrl,
  validProviderId,
} from "./credentials.ts";
import { assistantToItem, contentText, customMessageToItem, historyToItems, structuredExchangeField, truncate } from "./convert.ts";
import { configureExtensionRender, renderToolCallHtml, renderToolResultHtml } from "./extensionRender.ts";
import {
  assertWithinRoot,
  createDirectoryFromBrowser,
  createFileFromBrowser,
  copyFileFromBrowser,
  deleteFileFromBrowser,
  FileBrowserError,
  isPdfPath,
  listDirectory,
  MAX_PREVIEW_BYTES,
  MAX_UPLOAD_BASE64_LENGTH,
  moveFileFromBrowser,
  openFileNative,
  readFileForPreview,
  readFileRaw,
  renameFileFromBrowser,
  resolveBrowserRoot,
  resolveWritableRoot,
  searchFiles,
  uploadFileFromBrowser,
  writeFileFromBrowser,
} from "./fileBrowser.ts";
import { GitError, gitFileLog, gitHeadContent, gitLog, gitRevisionContent, gitShow, gitStatus, probeGit } from "./git.ts";
import { createDocxExtractToolDefinition } from "./docxTool.ts";
import { createXlsxExtractToolDefinition } from "./xlsxTool.ts";
import { createPptxExtractToolDefinition } from "./pptxTool.ts";
import { createStructuredExchangeToolDefinition } from "./structuredExchangeTool.ts";
import { createPdfExtractToolDefinition } from "./pdfTool.ts";
import { createDirectoryWatcher, type DirectoryWatcher } from "./fileWatcher.ts";
import { createSandboxedTools, isWithin, realResolve } from "./sandbox.ts";
import {
  firstExchange,
  generateSessionTitle,
  hasBeenNamed,
  MAX_NAME_LENGTH,
  MAX_QUERY_LENGTH,
  sanitizeName,
  searchSessions,
  toSummary,
} from "./sessions.ts";
import { seaExtensionFactories } from "./sea-extensions.ts";
// Generated at build time (cli/scripts/build.mjs, server/scripts/build-sea.mjs).
// Empty map in dev — see the comment at the static-serving block below.
import { EMBEDDED_WEB } from "./embedded-web.ts";

// Replaced at bundle time; `typeof` on an undeclared name is safe, so a source run says "dev".
declare const __PI_OUTPOST_VERSION__: string;
const VERSION = typeof __PI_OUTPOST_VERSION__ === "string" ? __PI_OUTPOST_VERSION__ : "dev";

// Resolved at bundle time (not from the SDK's runtime VERSION, which walks up
// from __dirname for package.json and resolves the wrong file inside a SEA
// bundle). `typeof` guard lets source runs fall back to "dev".
declare const __PI_SDK_VERSION__: string;
const PI_SDK_VERSION = typeof __PI_SDK_VERSION__ === "string" ? __PI_SDK_VERSION__ : "dev";

// npm workspace scripts run with cwd=server/ — INIT_CWD is where `npm run` was invoked
const LAUNCH_DIR = process.env.INIT_CWD ?? process.cwd();

/** `[config] …` messages already carry their own tag — don't stack a second one. */
function complain(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message.startsWith("[") ? message : `[pi] ${message}`);
}

const cli = (() => {
  try {
    return parseCli(process.argv.slice(2));
  } catch (error) {
    complain(error);
    process.exit(2);
  }
})();

if (cli.command === "help") {
  console.log(helpText());
  process.exit(0);
}
if (cli.command === "version") {
  console.log(VERSION);
  process.exit(0);
}
if (cli.command === "init") {
  try {
    // The same directory discovery will search — writing where a later start won't
    // look would be a cruel joke under any `npm run` wrapper.
    const written = runInit(LAUNCH_DIR, cli.init);
    console.log(`[pi] wrote ${written}\n[pi] edit it, then run: pi-outpost`);
    process.exit(0);
  } catch (error) {
    complain(error);
    process.exit(1);
  }
}

// Before the configuration is loaded, deliberately: building an executable has
// nothing to do with how a server would be configured, and refusing to build one
// because no config file exists would be an obstacle invented for its own sake.
if (cli.command === "build-exe") {
  try {
    const built = buildExecutable({ out: cli.buildExe.out, force: cli.buildExe.force, cwd: LAUNCH_DIR });
    console.log(`[pi] wrote ${built.path} (${built.method})\n[pi] run it: ${built.path}`);
    process.exit(0);
  } catch (error) {
    if (error instanceof BuildExeError) {
      console.error(`[pi] ${error.message}`);
      process.exit(1);
    }
    complain(error);
    process.exit(1);
  }
}

const config = (() => {
  try {
    return loadConfig(LAUNCH_DIR, cli.flags);
  } catch (error) {
    if (error instanceof NoConfigError) {
      console.error(
        [
          "[pi] no configuration file found. Looked in:",
          ...error.searched.map((candidate) => `      ${candidate}`),
          "",
          "      Create one with:  pi-outpost init          (here)",
          "                        pi-outpost init --global (for every directory)",
          "      Or point at one:  pi-outpost --config <path>",
        ].join("\n"),
      );
      process.exit(1);
    }
    complain(error);
    process.exit(1);
  }
})();
// Answers "which of the four files am I actually running, and who won each setting"
// without starting anything. The token is the one thing never echoed back.
if (cli.command === "config") {
  const { token, ...rest } = config;
  console.log(JSON.stringify({ ...rest, token: token ? "<set>" : undefined }, null, 2));
  process.exit(0);
}

const PORT = config.port;
const HOST = config.host;
const AGENT_CWD = config.cwd;
const AGENT_DIR = config.agentDir ?? getAgentDir();
// Own agentDir ⇒ own session store, fully separate from ~/.pi/agent
const SESSION_DIR = config.agentDir ? path.join(config.agentDir, "sessions") : undefined;

// Store a key where *this* configuration will look for it, then leave: an isolated
// agentDir starts with no auth.json, and copying one in by hand was the only way.
if (cli.command === "login") {
  try {
    if (!validProviderId(cli.login.provider)) {
      throw new CliError("login needs a provider: pi-outpost login --provider anthropic");
    }
    // A typo would otherwise store a key nothing reads, and say "stored" — leaving a
    // server that still reports no credentials, for no visible reason.
    const known = await knownProviders(AGENT_DIR);
    if (!known.includes(cli.login.provider)) {
      throw new CliError(`unknown provider "${cli.login.provider}" — known: ${known.join(", ")}`);
    }
    const key = await readSecret(`API key for ${cli.login.provider} (not echoed): `);
    const written = await storeApiKey(AGENT_DIR, cli.login.provider, key);
    console.log(`[pi] stored ${cli.login.provider} credentials in ${written}\n[pi] run: pi-outpost`);
    process.exit(0);
  } catch (error) {
    complain(error);
    process.exit(1);
  }
}

/**
 * Reads nothing and writes nothing: it validates a document the agent composed and
 * hands it to the interface. There is no path argument to confine, so unlike every
 * other custom tool it is the same tool on both sides of the sandbox.
 */
const structuredExchangeTool = createStructuredExchangeToolDefinition();

let sandboxedTools = config.sandbox
  ? [
      ...(await createSandboxedTools(config.sandbox, config.pdf.maxBytes, config.docx.maxBytes, config.xlsx.maxBytes, config.pptx.maxBytes)),
      structuredExchangeTool,
    ]
  : undefined;
let BROWSER_ROOT = await resolveBrowserRoot(config);
let WRITABLE_ROOT = await resolveWritableRoot(config, BROWSER_ROOT);
let GIT = await probeGit(BROWSER_ROOT);

/**
 * Watches the directories the browser has listed, so the tree follows the disk
 * whoever changed it — this process, the agent through bash, or nothing here at
 * all. Rebuilt when the sandbox root moves: a watch is a handle on a path under
 * the *old* root, and the client drops its cached tree on a session replace for
 * the same reason.
 */
function buildFileWatcher(): DirectoryWatcher | undefined {
  if (!config.files.watch) return undefined;
  return createDirectoryWatcher({
    root: BROWSER_ROOT,
    onChange: (relPath) => broadcast({ type: "directory_changed", path: relPath }),
  });
}
let fileWatcher = buildFileWatcher();

// --- HTTP server ---------------------------------------------------------------
//
// Started now, before the AgentSessionRuntime below (which loads models, extensions,
// and skills, and can take a few seconds) — branding is pure config with no session
// dependency, so it must not wait behind that setup (that wait was showing up as a
// flash of default branding on every page load). /ws and /health stay stubbed out
// (WS connections are closed immediately, so the client's reconnect loop just
// retries) until the runtime is ready and wires up the real handlers below.

/**
 * WebSocket connections are exempt from the same-origin policy: any webpage
 * could otherwise connect to this localhost server and drive an agent that
 * has bash/write tools. Only accept browser connections from local dev
 * origins. Requests without an Origin header (non-browser clients: curl,
 * native tools) are allowed — a local process already has shell access.
 */
const ORIGIN_ALLOWLIST = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** Local dev origins always pass; config.allowedOrigins adds exact origins for embedding. */
function originAllowed(origin: string): boolean {
  return ORIGIN_ALLOWLIST.test(origin) || config.allowedOrigins.includes(origin);
}

/**
 * Timing-safe shared-token check. Hashing both sides first sidesteps
 * timingSafeEqual's equal-length requirement without an early return that
 * would leak the token's length.
 */
const expectedTokenDigest =
  config.token !== undefined ? createHash("sha256").update(config.token).digest() : undefined;

function tokenValid(candidate: unknown): boolean {
  if (expectedTokenDigest === undefined) return true;
  if (typeof candidate !== "string") return false;
  const actual = createHash("sha256").update(candidate).digest();
  return timingSafeEqual(expectedTokenDigest, actual);
}

/** WS close code for a bad/missing token (app-reserved range): tells the client to show the token screen instead of retrying. */
const WS_CLOSE_UNAUTHORIZED = 4401;

let handleWsConnection: (socket: WebSocket) => void = (socket) => {
  socket.close(1013, "starting up");
};
let getHealth: () => { ok: boolean; sessionId?: string } = () => ({ ok: false });

/**
 * How long a browser may reuse a preflight answer.
 *
 * Short on purpose. The round trip it saves is a localhost one in the common
 * case, and a long cache means a corrected `allowedOrigins` keeps being ignored
 * by every browser that already asked.
 */
const PREFLIGHT_MAX_AGE_SECONDS = 60;

/**
 * Let a browser on an allowed origin read the response we already decided to send.
 *
 * `allowedOrigins` has always gated the WebSocket — which drives an agent that
 * reads the workspace and, when configured, writes files and runs bash — while
 * every HTTP route answered without a CORS header, so a cross-origin widget got
 * a 200 the browser then discarded. The same predicate decides both here.
 *
 * SECURITY: this grants no authority. Every route keeps its token check, its
 * path confinement and its Host check; CORS only decides whether the browser
 * hands the page a response the server had already produced. The origin is
 * echoed exactly and never `*`, which would extend to origins the configuration
 * never named. An origin we do not allow gets no allow-origin header and no
 * status/body difference: withholding the header already stops the browser,
 * and changing the status as well would tell any page which origins a server
 * is configured for. Every response still declares the Origin cache dimension,
 * including requests that omit Origin entirely.
 */
function appendVary(reply: FastifyReply, field: string): void {
  const current = reply.getHeader("Vary");
  const fields: string[] = [];
  for (const value of current === undefined ? [] : Array.isArray(current) ? current : [current]) {
    fields.push(
      ...String(value)
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    );
  }
  if (fields.includes("*") || fields.some((part) => part.toLowerCase() === field.toLowerCase())) return;
  reply.header("Vary", [...fields, field].join(", "));
}

function applyCors(req: FastifyRequest, reply: FastifyReply): boolean {
  // Absence, refusal and acceptance are three Origin-dependent variants. If a
  // cache stored the no-Origin response without Vary, it could later reuse it
  // for an allowed origin and hide the header that makes the response readable.
  appendVary(reply, "Origin");
  const origin = req.headers.origin;
  if (origin === undefined) return false;
  if (!originAllowed(origin)) return false;
  reply.header("Access-Control-Allow-Origin", origin);
  return true;
}

const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // of base64 text

const app = Fastify({ logger: false });
// An exceeded frame limit *closes the socket* rather than answering, and a torn-down
// connection reports nothing the client can show the user — so the limit is stated
// here next to every cap it has to clear, rather than inherited from ws's 100 MB
// default and left to quietly fall under one of them.
//
// Two messages set the floor and they are not the same size: an upload is one
// base64 body, while a prompt may carry MAX_IMAGES of MAX_IMAGE_BYTES each — six
// images is the larger number by a wide margin. Taking the max of both (rather
// than the upload alone) is what keeps a multi-image prompt the *server's own
// validator accepts* from being dropped by the transport underneath it.
await app.register(websocket, {
  options: { maxPayload: Math.max(MAX_UPLOAD_BASE64_LENGTH, MAX_IMAGES * MAX_IMAGE_BYTES) + 65_536 },
});

// A hook rather than a call in each handler: a per-route list is one a future
// route joins by being remembered, and this one cannot be half-applied.
//
// The other side of that: every route added below inherits cross-origin
// exposure without anyone deciding it. A new route that returns something an
// allowed origin should not read has to say so itself — uniformity is what makes
// the rule statable, and this is what it costs.
app.addHook("onRequest", async (req, reply) => {
  const allowed = applyCors(req, reply);
  if (req.method !== "OPTIONS") return;

  // A preflight is a question about permission, not the request it describes:
  // it carries no token by design, so requiring one would refuse every
  // authenticated cross-origin call before it was ever made. Answered here,
  // before routing, so it never reaches a handler and never touches state.
  if (allowed) {
    reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    // Echo what was asked for rather than a fixed list: the client sends
    // `Authorization` when the server is token-protected, and that header is
    // what makes the browser preflight in the first place.
    const asked = req.headers["access-control-request-headers"];
    reply.header("Access-Control-Allow-Headers", asked ?? "Authorization, Content-Type");
    // The value above is derived from the request. Keep distinct preflight
    // variants apart in shared caches just as we do for Origin.
    appendVary(reply, "Access-Control-Request-Headers");
    reply.header("Access-Control-Max-Age", String(PREFLIGHT_MAX_AGE_SECONDS));
  }
  await reply.code(allowed ? 204 : 403).send();
});
app.get("/branding", (req, reply) => {
  const auth = req.headers.authorization;
  if (!tokenValid(auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined)) {
    console.warn(`[server] rejected /branding request with bad or missing token from ${req.ip}`);
    return reply.code(401).send({ error: "unauthorized" });
  }
  return config.branding;
});
app.get("/ws", { websocket: true }, (socket, req) => {
  const origin = req.headers.origin;
  if (origin !== undefined && !originAllowed(origin)) {
    console.warn(`[server] rejected ws connection from origin ${origin}`);
    socket.close(1008, "forbidden origin");
    return;
  }
  // Browsers cannot set headers on WebSockets, so the token rides a query
  // parameter. Close AFTER the handshake with an app code — a pre-handshake
  // rejection reads as an opaque 1006 that the client can't act on.
  const token = new URL(req.url ?? "/ws", "http://localhost").searchParams.get("token");
  if (!tokenValid(token ?? undefined)) {
    console.warn(`[server] rejected ws connection with bad or missing token from ${req.ip}`);
    socket.close(WS_CLOSE_UNAUTHORIZED, "unauthorized");
    return;
  }
  handleWsConnection(socket);
});
app.get("/health", (req, reply) => {
  const health = getHealth();
  // During startup (getHealth stub returns { ok: false }), return 503 so
  // callers don't mistake the HTTP 200 for readiness — the real handler
  // (wired after createAgentSessionRuntime resolves) returns { ok: true }.
  if (!health.ok) return reply.code(503).send({ ok: false });
  // With auth enabled, the public health probe must not leak the session id
  return config.token !== undefined ? { ok: health.ok } : health;
});

/** Only these render inline; SVG additionally gets a scripts-off CSP below. */
const IMAGE_CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

/**
 * DNS-rebinding guard for token-less servers: a malicious page can rebind its
 * hostname to 127.0.0.1 and read workspace files through /files/raw — the
 * browser then sends the attacker's Host header, which this rejects. With a
 * token configured the auth check already stops that attacker, and strict Host
 * matching would break reverse-proxy setups, so the guard only arms without one.
 */
function hostAllowed(hostHeader: string | undefined): boolean {
  if (config.token !== undefined) return true;
  if (hostHeader === undefined) return false;
  let hostname: string;
  try {
    hostname = new URL(`http://${hostHeader}`).hostname;
  } catch {
    return false;
  }
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") return true;
  if (hostname === HOST) return true;
  return config.allowedOrigins.some((origin) => {
    try {
      return new URL(origin).hostname === hostname;
    } catch {
      return false;
    }
  });
}

// Raw bytes for workspace files referenced in assistant messages (inline
// images). `<img>` cannot send headers, so the token rides the query string —
// same trade-off as the WebSocket.
app.get("/files/raw", async (req, reply) => {
  const query = req.query as Record<string, unknown>;
  if (!hostAllowed(req.headers.host)) {
    console.warn(`[server] rejected /files/raw request with foreign host ${req.headers.host} from ${req.ip}`);
    return reply.code(403).send({ error: "forbidden" });
  }
  const auth = req.headers.authorization;
  const bearer = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
  const queryToken = typeof query.token === "string" ? query.token : undefined;
  if (!tokenValid(bearer) && !tokenValid(queryToken)) {
    console.warn(`[server] rejected /files/raw request with bad or missing token from ${req.ip}`);
    return reply.code(401).send({ error: "unauthorized" });
  }
  const relPath = typeof query.path === "string" ? query.path : undefined;
  if (!relPath) return reply.code(400).send({ error: "missing path" });
  try {
    // PDFs are measured against their own ceiling; everything else keeps 1 MB.
    const bytes = await readFileRaw(BROWSER_ROOT, relPath, config.pdf.maxBytes);
    reply.header("X-Content-Type-Options", "nosniff");
    // Workspace content may be stale seconds later (agent regenerates a plot)
    reply.header("Cache-Control", "no-store");
    const contentType = IMAGE_CONTENT_TYPES[path.extname(relPath).toLowerCase()];
    if (contentType !== undefined) {
      if (contentType === "image/svg+xml") {
        // <img> rasterizes SVG without scripts, but a direct navigation to this
        // URL would run them on our origin — the CSP closes that hole
        reply.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
      }
      return reply.header("Content-Type", contentType).send(bytes);
    }
    // Anything else (HTML above all) must never execute or render on this origin
    return reply
      .header("Content-Type", "application/octet-stream")
      .header("Content-Disposition", "attachment")
      .send(bytes);
  } catch (error) {
    if (error instanceof FileBrowserError) {
      if (error.reason === "too-large") {
        // The viewer names the limit it hit, and the limit depends on the type
        const limit = isPdfPath(relPath) ? config.pdf.maxBytes : MAX_PREVIEW_BYTES;
        return reply.code(413).send({ error: error.reason, limit });
      }
      return reply.code(404).send({ error: error.reason });
    }
    throw error;
  }
});

// Serve the built web UI as a single deployable unit when present (`npm run build
// --workspace web` first) — /branding, /ws, /health above take priority over it
// regardless of registration order, since Fastify's router favors exact routes over
// this plugin's wildcard. Skipped silently in dev, where `npm run dev:web` (Vite,
// with HMR) serves the UI instead.
// Three layouts must resolve: the published npm package (the UI ships beside the
// bundle as dist/web/), the clone, and the SEA bundle — which mirrors the clone's
// depth on purpose (see docs/sea-packaging.md).
//
// The packaged layout goes first, and not for elegance: from
// node_modules/pi-outpost/dist/, `../../web/dist` is `node_modules/web/dist` — and
// `web` is a real name on npm (this repo's own UI workspace is called that). A
// consumer who happens to depend on some `web` package would otherwise have us
// serve *its* dist as the chat UI. Each candidate must carry an index.html, so an
// empty or half-built directory doesn't shadow a good one either.
const hasIndexHtml = (candidate: string) =>
  fs
    .stat(path.join(candidate, "index.html"))
    .then((s) => s.isFile())
    .catch(() => false);
/**
 * Skills that ship with the product, found the same way the web UI is.
 *
 * A tool without the skill that explains it is a mechanism with no instructions:
 * the agent can call `present_structure` and has nothing telling it what a valid
 * document looks like. The user's own skill paths come after, so anything they
 * configure can still override what we bundle.
 */
const skillRoots = [path.resolve(import.meta.dirname, "./skills"), path.resolve(import.meta.dirname, "../../skills")];
/**
 * One entry per skill rather than the directory holding them.
 *
 * The loader accepts either — it recurses into a directory that has no SKILL.md of
 * its own — so this is a preference, not a requirement, and an earlier comment here
 * claiming the parent "silently finds nothing" was simply wrong. Naming each skill
 * keeps the non-skill files that live beside them (a README) from being read as
 * candidates and reported as skills missing a description.
 *
 * Proven to load, and to stay off under noSkills, by server/test/bundledSkill.test.ts.
 *
 * A skill does surface as a slash command — `skill:<name>`. An earlier note here said
 * the opposite, and was wrong: the skill was absent from the palette because the
 * palette showed only the first dozen matches alphabetically, not because it had
 * failed to load. Two wrong conclusions from one symptom, and the second one nearly
 * became a documented limitation.
 */
const BUNDLED_SKILLS: string[] = [];
for (const root of skillRoots) {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skill = path.join(root, entry.name);
    if (await fs.stat(path.join(skill, "SKILL.md")).then((file) => file.isFile()).catch(() => false)) {
      BUNDLED_SKILLS.push(skill);
    }
  }
  if (BUNDLED_SKILLS.length > 0) break;
}

const webDistCandidates = process.env.PI_OUTPOST_WEB_DIST
  ? [path.resolve(process.env.PI_OUTPOST_WEB_DIST)]
  : [
      // Prefer the production build (Vite output) over the source web/ directory,
      // which contains a Vite-dev index.html referencing /src/main.tsx — that file
      // would be served as application/octet-stream and fail ESM module loading.
      path.resolve(import.meta.dirname, "./web/dist"),
      path.resolve(import.meta.dirname, "./web"),
      path.resolve(import.meta.dirname, "../../web/dist"),
    ];
let WEB_DIST: string | undefined;
for (const candidate of webDistCandidates) {
  if (await hasIndexHtml(candidate)) {
    WEB_DIST = candidate;
    break;
  }
}

// Prefer the inlined UI (self-contained SEA/npm bundle) — no web/ folder needed
// next to the executable. Falls back to fastifyStatic from disk for dev/npm
// builds that don't embed it.
if (EMBEDDED_WEB && Object.keys(EMBEDDED_WEB).length > 0) {
  const serveAsset = (reply: any, url: string) => {
    const asset = EMBEDDED_WEB[url];
    if (!asset) {
      reply.code(404);
      return reply.send("Not found");
    }
    reply.header("Content-Type", asset.type);
    reply.send(Buffer.from(asset.b64, "base64"));
  };
  app.get("/*", async (req: any, reply: any) => {
    const url = (req.params["*"] as string) || "";
    if (url === "" || url.endsWith("/")) {
      return serveAsset(reply, "/index.html");
    }
    return serveAsset(reply, "/" + url);
  });
  console.log(`[server] serving web UI from embedded bundle (${Object.keys(EMBEDDED_WEB).length} assets)`);
} else if (WEB_DIST !== undefined) {
  await app.register(fastifyStatic, { root: WEB_DIST });
  console.log(`[server] serving web UI from ${WEB_DIST}`);
}

await app.listen({ port: PORT, host: HOST });

/**
 * Land the operator in the interface they just started.
 *
 * The address comes from what was bound, not from what was asked for: `port: 0`
 * means the operating system chose, and the configured value is then a number
 * nobody is listening on. Opening here rather than earlier is the whole point —
 * a browser sent before `listen` resolves shows a connection error, and the
 * operator concludes the thing is broken.
 */
{
  const bound = app.server.address();
  // Printed from what was bound, not from what was asked for: with `port: 0` the
  // configured value is a number nobody is listening on, and this line was saying
  // `http://127.0.0.1:0/` — which is the whole of what an operator gets when no
  // browser opens.
  const url = typeof bound === "object" && bound !== null ? browsableUrl(bound) : `http://${HOST}:${PORT}/`;
  console.log(`[server] ${url}`);
  // A server with no interface of its own has nothing to open: in development the
  // UI comes from Vite on another port, and a tab on this one shows a 404. It is
  // also what a backend for an embedded widget looks like, which is the other case
  // where a browser is the wrong answer.
  const servesTheInterface = (EMBEDDED_WEB && Object.keys(EMBEDDED_WEB).length > 0) || WEB_DIST !== undefined;
  if (servesTheInterface && shouldOpenBrowser({ explicit: cli.open, configured: config.openBrowser })) {
    // Not awaited for its outcome beyond a line of output: a browser that will not
    // start is not a reason for a server to stop.
    void openBrowser(url).then((opened) => {
      if (!opened) console.log(`[server] could not open a browser — open ${url} yourself`);
    });
  }
}

// --- Agent session runtime ---------------------------------------------------

/**
 * Prepended to the operator's appendSystemPrompt entries (unless webContext is
 * disabled) so the model knows its output renders in this web UI rather than a
 * terminal. Describes rendering capabilities only — grants no permissions.
 */
const WEB_UI_CONTEXT = [
  "You are running inside pi-outpost, a web chat UI — not a terminal.",
  "Replies render as markdown with syntax-highlighted code, LaTeX math and mermaid diagrams.",
  "When a user message contains @some/path, the user picked that file or directory in the UI's file browser: it exists, relative to your working directory. Use it directly — never search for it.",
  "Workspace files can be referenced with relative markdown links, e.g. [report](./report.md) — clicking one opens the file in the UI's viewer/editor.",
  "Images in the workspace (including ones you create) display inline in the conversation when referenced with a relative path: ![plot](./plot.png). Prefer showing an image that way over describing it.",
  "Avoid terminal-only affordances: no 'open this file in your editor' or 'run this command to view' phrasing, no ASCII art where a mermaid diagram or an image file works better.",
].join("\n");

const DEBUG = process.env.PI_OUTPOST_DEBUG ? console.log : () => {};

const createRuntime: CreateAgentSessionRuntimeFactory = async ({
  cwd,
  sessionManager,
  sessionStartEvent,
}) => {
  const appendSystemPrompt = [
    ...(config.webContext ? [WEB_UI_CONTEXT] : []),
    ...config.appendSystemPrompt,
  ];

  const extraFactories = [...seaExtensionFactories];
  // extensionScripts are loaded via the SDK's jiti-based loader (same as
  // extensionPaths), which uses createRequire under the hood — this works
  // inside SEA blobs where native import() can only resolve built-in modules.
  const allExtPaths = [
    ...config.extensionPaths,
    ...config.extensionScripts,
  ];
  const services = await createAgentSessionServices({
    cwd,
    agentDir: config.agentDir,
    resourceLoaderOptions: {
      ...(config.noExtensions ? { noExtensions: true } : {}),
      ...(allExtPaths.length > 0
        ? { additionalExtensionPaths: allExtPaths }
        : {}),
      ...(config.noSkills ? { noSkills: true } : {}),
      /**
       * The user's paths first: the loader keeps the first skill it meets under a
       * given name, so anything they configure has to come before what we bundle for
       * "override" to mean anything.
       *
       * Under noSkills, theirs still go and ours do not. The SDK merges
       * additionalSkillPaths even in that mode — see server/test/bundledSkill.test.ts
       * — so passing the bundled ones regardless would quietly defeat a switch that
       * exists to get real isolation. But dropping *everything* was the opposite
       * mistake, made while fixing the first: noSkills turns off discovery of what we
       * supply, and a path the user named explicitly is not discovery. Naming a skill
       * and being given nothing is a worse surprise than either.
       */
      ...(() => {
        const paths = [...allSkillPaths(config), ...(config.noSkills ? [] : BUNDLED_SKILLS)];
        return paths.length > 0 ? { additionalSkillPaths: paths } : {};
      })(),
      ...(config.noPromptTemplates ? { noPromptTemplates: true } : {}),
      ...(config.promptPaths.length > 0
        ? { additionalPromptTemplatePaths: config.promptPaths }
        : {}),
      ...(config.systemPrompt !== undefined ? { systemPrompt: config.systemPrompt } : {}),
      ...(appendSystemPrompt.length > 0 ? { appendSystemPrompt } : {}),
      ...(extraFactories.length > 0 ? { extensionFactories: extraFactories } : {}),
    },
  });
  const extResult = services.resourceLoader.getExtensions();
  if (extResult.errors.length > 0) {
    for (const err of extResult.errors) {
      console.error("[pi-outpost] Extension error:", err.path, err.error);
    }
  } else {
    DEBUG("[pi-outpost] No extension errors. Loaded:", extResult.extensions.length, "extensions");
  }
  return {
    ...(await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
      // Sandbox replaces the built-in toolset with path-scoped equivalents
      ...(sandboxedTools ? { noTools: "builtin" as const, customTools: sandboxedTools } : {}),
      ...(!sandboxedTools && config.tools ? { tools: config.tools } : {}),
      // No sandbox: the built-in toolset stands, and pdf_extract joins it — it is
      // not one of pi's built-ins, so nothing else would supply it. It stays
      // confined to the workspace, which is the only root there is to name here.
      ...(sandboxedTools
        ? {}
        : {
            customTools: [
              createPdfExtractToolDefinition({
                cwd,
                allowedRoots: [await fs.realpath(cwd)],
                maxBytes: config.pdf.maxBytes,
                // No sandbox: anything under the workspace is writable, the same
                // rule writeFileFromBrowser applies to the browser's own writes.
                writableRoot: await fs.realpath(cwd),
              }),
              createDocxExtractToolDefinition({
                cwd,
                allowedRoots: [await fs.realpath(cwd)],
                maxBytes: config.docx.maxBytes,
                writableRoot: await fs.realpath(cwd),
              }),
              createXlsxExtractToolDefinition({
                cwd,
                allowedRoots: [await fs.realpath(cwd)],
                maxBytes: config.xlsx.maxBytes,
                writableRoot: await fs.realpath(cwd),
              }),
              createPptxExtractToolDefinition({
                cwd,
                allowedRoots: [await fs.realpath(cwd)],
                maxBytes: config.pptx.maxBytes,
                writableRoot: await fs.realpath(cwd),
              }),
              structuredExchangeTool,
            ],
          }),
    })),
    services,
    diagnostics: services.diagnostics,
  };
};

// The SDK decides this once, when it constructs its ModelRuntime — it reads
// `process.env.PI_OFFLINE` there and keeps the answer — so the variable has to be
// set before the runtime exists, not merely present in our config object.
if (config.offline) process.env.PI_OFFLINE = "1";

/**
 * The one agent-runtime boundary (see agentRuntime.ts). `embedded` keeps the SDK
 * session in this process; `rpc` supervises a `pi --mode rpc` child. Both answer
 * the same WebSocket protocol, and a startup failure here is fatal on purpose —
 * falling back to the other runtime would silently run something the operator did
 * not configure.
 */
const runtime: AgentRuntime = await (async () => {
  try {
    if (config.agentRuntime.mode === "rpc") {
      // The child builds its own toolset, so everything the embedded runtime hands
      // to the SDK has to be said on the command line instead: the same skills,
      // extensions, prompt templates, tool allowlist and system prompt — plus
      // pi-outpost's own tools, which exist nowhere else and travel as an extension.
      const toolsExtension = await resolveToolsExtension();
      return await createRpcRuntime({
        settings: config.agentRuntime,
        cwd: AGENT_CWD,
        agentDir: AGENT_DIR,
        sessionDir: SESSION_DIR,
        resourceArgs: [
          ...rpcResourceArgs(config, {
            bundledSkills: config.noSkills ? [] : BUNDLED_SKILLS,
            appendSystemPrompt: [...(config.webContext ? [WEB_UI_CONTEXT] : []), ...config.appendSystemPrompt],
          }),
          "--extension",
          toolsExtension,
        ],
        env: {
          [TOOLS_ENV_VAR]: JSON.stringify({
            cwd: AGENT_CWD,
            maxBytes: {
              pdf: config.pdf.maxBytes,
              docx: config.docx.maxBytes,
              xlsx: config.xlsx.maxBytes,
              pptx: config.pptx.maxBytes,
            },
          } satisfies PiOutpostToolsSettings),
        },
      });
    }
    return await createEmbeddedRuntime({
      factory: createRuntime,
      cwd: AGENT_CWD,
      agentDir: AGENT_DIR,
      sessionManager: SessionManager.create(AGENT_CWD, SESSION_DIR),
      onModelFallback: (message) => console.warn(`[pi] ${message}`),
    });
  } catch (error) {
    complain(error);
    await app.close();
    process.exit(1);
  }
})();

function modelName(): string {
  const model = runtime.snapshot().model;
  return model ? `${model.provider}/${model.id}` : "unknown";
}

function contextUsage(): ContextUsage | undefined {
  return runtime.snapshot().contextUsage;
}

function availableModels(): ModelChoice[] {
  const models = runtime.snapshot().models;
  if (!config.allowedModels) return models;
  const allowed = config.allowedModels;
  return models.filter((m) => allowed.some((a) => a.provider === m.provider && a.id === m.id));
}

/**
 * Which providers can actually answer, and where their credentials live.
 *
 * The client needs "no provider is configured" (onboard the user) apart from
 * "providers are configured but no model survives `allowedModels`" (a config
 * problem) — hence `providers` *and* `usableModel`, rather than an empty model
 * list, which conflates the two.
 */
function credentialStatus(): CredentialStatus {
  const usableModel = availableModels().length > 0;
  return {
    providers: runtime.snapshot().providers,
    usableModel,
    // Only while onboarding needs it: an absolute path names the server's OS account,
    // and there is no reason for a working server to tell every client where it lives.
    ...(usableModel ? {} : { agentDir: AGENT_DIR }),
  };
}

/**
 * Snapshot for `hello` / `session_replaced`. Mid-stream connects are covered:
 * the runtime keeps the partial assistant message in its message list from
 * message_start, and historyToItems adds running tool cards for toolCalls
 * without a result yet.
 */
/** User messages persisted on the current branch, oldest first — lets the UI edit a past prompt. */
function branchUserEntries(): { entryId: string; text: string }[] {
  return runtime
    .contextEntries()
    .filter((e) => e.type === "message" && e.message?.role === "user")
    .map((e) => ({ entryId: e.id, text: contentText(e.message!.content as never) }));
}

/** Sandbox paths to announce after updating. */
let lastAnnouncedSandbox: { root: string; allowWrite: boolean; allowBash: boolean; writableRoot?: string } | undefined;

function snapshot(): SessionSnapshot {
  const state = runtime.snapshot();
  return {
    branding: config.branding,
    sessionId: state.sessionId,
    model: modelName(),
    thinkingLevel: state.thinkingLevel,
    isStreaming: state.isStreaming,
    items: historyToItems(
      state.messages as never,
      state.isStreaming,
      branchUserEntries().map((entry) => entry.entryId),
    ),
    models: availableModels(),
    commands: state.commands,
    contextUsage: state.contextUsage,
    writableRoot: WRITABLE_ROOT,
    gitAvailable: GIT !== null,
    credentials: credentialStatus(),
    extensionPaths: state.extensionPaths,
    // What is configured, not what got loaded — built-in skills reach the menu
    // through `commands` instead. The two lists are separate because only one of
    // them is the user's to edit.
    skillPaths: config.skillPaths,
    userSkillPaths: config.userSkillPaths,
    tools: state.tools,
    // One line for what answers prompts: the SDK in this process, or the child.
    versions: {
      piOutpost: VERSION,
      ...(runtime.agentLabel ? { agent: runtime.agentLabel } : { piSdk: PI_SDK_VERSION }),
    },
    sandbox: (() => {
      const v = config.sandbox
        ? {
            root: config.sandbox.root,
            allowWrite: config.sandbox.allowWrite ?? false,
            allowBash: config.sandbox.allowBash ?? false,
            writableRoot: config.sandbox.writableRoot,
            locks: config.sandboxLocks,
          }
        : undefined;
      console.log("[snapshot] sandbox =", JSON.stringify(v));
      return v;
    })(),
  };
}

// --- WebSocket broadcast -------------------------------------------------------

const clients = new Set<WebSocket>();

const WS_LOG_PATH = process.env.WS_LOG_PATH ? path.resolve(process.env.WS_LOG_PATH) : undefined;

function broadcast(message: ServerMessage): void {
  const data = JSON.stringify(message);
  // Optional file logging for debugging WebSocket payloads
  if (WS_LOG_PATH) {
    // Best-effort write; don't block the event loop on failures
    fs.appendFile(WS_LOG_PATH, data + "\n").catch(() => {});
  }
  for (const socket of clients) {
    if (socket.readyState === socket.OPEN) socket.send(data);
  }
}

function send(socket: WebSocket, message: ServerMessage): void {
  const data = JSON.stringify(message);
  if (WS_LOG_PATH) {
    fs.appendFile(WS_LOG_PATH, data + "\n").catch(() => {});
  }
  if (socket.readyState === socket.OPEN) socket.send(data);
}

// --- Extension "Custom UI" bridge -----------------------------------------------
//
// Requests reach the browser the same way whichever runtime produced them: the
// embedded session drives them through ExtensionUiBridge, an RPC child emits them
// on stdout, and both surface as an `extension_ui_request` runtime event that this
// file broadcasts. Answers travel back through runtime.answerExtensionUI.

/** Wire extension TUI renderers into the HTML bridge used by the web UI. */
function refreshExtensionRender(): void {
  const renderers = runtime.renderers;
  configureExtensionRender({
    // An RPC child cannot hand its renderer objects across the pipe, so tool cards
    // fall back to the built-in rendering rather than an extension-supplied one.
    getToolDefinition: (name) => renderers?.getToolDefinition(name) as never,
    getMessageRenderer: (customType) => renderers?.getMessageRenderer(customType) as never,
    cwd: AGENT_CWD,
    themeName: "dark",
  });
}

/** args of an in-flight edit/write call, captured at tool_execution_start and consumed at tool_execution_end. */
const pendingFileMutations = new Map<string, unknown>();

/**
 * Best-effort file-browser invalidation: if an edit/write tool touched a path inside
 * BROWSER_ROOT, tell clients so an expanded directory or open preview can refresh.
 * Not a security boundary — resolution failures or out-of-root paths are just skipped.
 */
async function announceFileChange(args: unknown): Promise<void> {
  const targetPath = (args as { path?: unknown } | null)?.path;
  console.log("[announceFileChange] args type=", typeof args, "targetPath=", targetPath);
  if (typeof targetPath !== "string") return;
  try {
    const resolved = await realResolve(path.resolve(BROWSER_ROOT, targetPath));
    if (!isWithin(BROWSER_ROOT, resolved)) {
      console.log("[announceFileChange] not within BROWSER_ROOT, skipping");
      return;
    }
    const relPath = path.relative(BROWSER_ROOT, resolved).split(path.sep).join("/");
    console.log("[announceFileChange] broadcasting file_changed path=", relPath);
    broadcast({ type: "file_changed", path: relPath });
  } catch (e) {
    console.log("[announceFileChange] error:", e);
    // Resolution failure (e.g. race with the tool call) — nothing to invalidate
  }
}

// --- Runtime events -> wire events ---------------------------------------------

/**
 * The one place a runtime event becomes a browser message. Both runtimes emit the
 * same normalized union (agentRuntime.ts), so nothing below may branch on which
 * one is running — a divergence here is what "the frontend is unaware of the
 * runtime" would cost.
 */
function onRuntimeEvent(event: RuntimeEvent): void {
  switch (event.type) {
    case "agent_start":
      broadcast({ type: "agent_start" });
      break;
    case "agent_end": {
      broadcast({ type: "agent_end" });
      const usage = contextUsage();
      if (usage) broadcast({ type: "context_usage", usage });
      // The turn is persisted now: hand the client the entries so the bubbles it
      // echoed optimistically become editable (edit_prompt targets an entry id).
      broadcast({ type: "user_entries", entries: branchUserEntries() });
      broadcast({ type: "tree", roots: buildTree() });
      // Off the prompt path on purpose: a slow title must never delay a reply
      void maybeNameSession();
      break;
    }
    case "assistant_start":
      broadcast({ type: "assistant_start" });
      break;
    case "block_delta":
      broadcast({ type: "block_delta", block: event.block, contentIndex: event.contentIndex, delta: event.delta });
      break;
    case "assistant_end":
      // Full sync of the finished message (covers retries/partial rebuilds)
      broadcast({ type: "assistant_end", item: assistantToItem(event.message as never) });
      break;
    case "custom_message":
      broadcast({ type: "custom_message", item: customMessageToItem(event.message as never) });
      break;
    case "tool_start": {
      const callHtml = renderToolCallHtml(event.toolCallId, event.toolName, event.args);
      broadcast({
        type: "tool_start",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
        ...(callHtml ? { callHtml } : {}),
      });
      if (event.toolName === "edit" || event.toolName === "write") {
        pendingFileMutations.set(event.toolCallId, event.args);
      }
      break;
    }
    case "tool_update": {
      const text = contentText(event.content as never);
      if (text) broadcast({ type: "tool_update", toolCallId: event.toolCallId, text: truncate(text) });
      break;
    }
    case "tool_end": {
      const rendered = renderToolResultHtml(
        event.toolCallId,
        event.toolName,
        event.content as never,
        event.details,
        event.isError,
      );
      broadcast({
        type: "tool_end",
        toolCallId: event.toolCallId,
        isError: event.isError,
        text: truncate(contentText(event.content as never)),
        ...(rendered ? { outputHtml: rendered.expanded, outputHtmlCollapsed: rendered.collapsed } : {}),
        ...structuredExchangeField(event.details),
      });
      const args = pendingFileMutations.get(event.toolCallId);
      pendingFileMutations.delete(event.toolCallId);
      // Only announce once the write has actually landed on disk — the client
      // may otherwise refetch a directory/file before the change is visible.
      if (args !== undefined && !event.isError) void announceFileChange(args);
      break;
    }
    case "queue":
      broadcast({ type: "queue", steering: event.steering, followUp: event.followUp });
      break;
    case "thinking_changed":
      broadcast({ type: "thinking_changed", level: event.level });
      break;
    case "compaction_start":
      broadcast({ type: "compaction_start" });
      break;
    case "compaction_end": {
      broadcast({ type: "compaction_end", ...(event.errorMessage ? { errorMessage: event.errorMessage } : {}) });
      const usage = contextUsage();
      if (usage) broadcast({ type: "context_usage", usage });
      break;
    }
    case "session_replaced":
      // The runtime has already rebound itself; renderers may belong to a new
      // extension runner, so refresh the HTML bridge before the snapshot goes out.
      refreshExtensionRender();
      broadcast({ type: "session_replaced", ...snapshot() });
      console.log(`[pi] session ${runtime.snapshot().sessionId}`);
      break;
    case "extension_ui_request":
      broadcast(event.request);
      break;
    case "error":
      broadcast({ type: "error", message: event.message });
      break;
    case "runtime_failed":
      // Fail closed: /health already reports unready, and this is the one visible
      // notice. No restart, no replay — a prompt or tool may have had side effects.
      console.error(`[pi] agent runtime failed: ${event.message}`);
      broadcast({ type: "error", message: `Agent runtime failed: ${event.message}` });
      break;
  }
}

runtime.subscribe(onRuntimeEvent);
refreshExtensionRender();

// --- Client message handling -----------------------------------------------------

/**
 * Session replacement (new/switch) disposes the current AgentSession — never
 * run two concurrently, and never leave a disposed session wired on failure.
 */
let replacingSession = false;

async function replaceSession(socket: WebSocket, action: () => Promise<{ cancelled: boolean }>): Promise<void> {
  if (replacingSession) {
    send(socket, { type: "error", message: "Session change already in progress" });
    return;
  }
  replacingSession = true;
  try {
    // The runtime rebinds and emits `session_replaced` itself; this only has to
    // decide whether a replacement happened at all.
    await action();
  } catch (error) {
    reportError(error);
    // The old session may be disposed — land on a fresh one instead. A runtime that
    // has failed closed cannot supply one, so don't ask it to.
    if (!runtime.ok) return;
    try {
      await runtime.newSession();
    } catch (recoveryError) {
      reportError(recoveryError);
    }
  } finally {
    replacingSession = false;
  }
}

/**
 * A dialog answer is only one of three shapes — validate it before it becomes a
 * record on the agent's stdin.
 *
 * The ceiling matters as much as the shape. Writes to the child are serialized, so
 * one oversized record holds up every command behind it until the command timeout
 * fires and fails the runtime permanently. An editor dialog can legitimately carry
 * a long answer, so the limit is generous rather than tight.
 */
const MAX_DIALOG_ANSWER_CHARS = 1_000_000;

function extensionUiAnswer(message: { id: string } & Record<string, unknown>): ExtensionUIResponse | undefined {
  const { id } = message;
  if (message.cancelled === true) return { type: "extension_ui_response", id, cancelled: true };
  if (typeof message.confirmed === "boolean") return { type: "extension_ui_response", id, confirmed: message.confirmed };
  if (typeof message.value === "string" && message.value.length <= MAX_DIALOG_ANSWER_CHARS) {
    return { type: "extension_ui_response", id, value: message.value };
  }
  return undefined;
}

/** Refuse a browser command the selected runtime cannot serve, saying which one refused. */
function refuseUnsupported(socket: WebSocket, error: unknown): boolean {
  if (!(error instanceof RuntimeUnsupportedError)) return false;
  send(socket, { type: "error", message: error.message });
  return true;
}

/**
 * Store an API key, then make the agent usable *now*: the live session was built
 * against a model with no auth, so a refreshed registry alone would not help it.
 * Rebuilding through replaceSession is what turns the onboarding screen into a
 * working chat without a restart or even a reload.
 */
/** How long onboarding waits on the SDK before it reports what it has. */
const CREDENTIAL_SYNC_TIMEOUT_MS = 20_000;

async function handleSetCredential(socket: WebSocket, provider: string, apiKey: string): Promise<void> {
  const credentials = runtime.credentials;
  if (!credentials) {
    send(socket, { type: "error", message: new RuntimeUnsupportedError("Storing credentials", runtime.kind).message });
    return;
  }
  // Neither of the two SDK calls below carries a deadline of its own. Onboarding is a
  // user pressing Save and watching a spinner, so give each one a ceiling: past it,
  // announce what we have rather than leaving the UI waiting forever.
  //
  // A ceiling *each*, not one shared between them: with a single signal, a first step
  // that burns the whole budget leaves the second none, and the second would abort
  // instantly for a reason that has nothing to do with it.
  const stalled = (step: string, detail: unknown) =>
    console.warn(
      `[pi] ${provider} key stored, but ${step} did not finish within ${CREDENTIAL_SYNC_TIMEOUT_MS / 1000}s: ${
        detail instanceof Error ? detail.message : String(detail)
      }`,
    );

  try {
    await credentials.storeApiKey(provider, apiKey, AbortSignal.timeout(CREDENTIAL_SYNC_TIMEOUT_MS));
  } catch (error) {
    // A key that never reached disk is a failed login. One that reached disk but not
    // the live runtime is not: it works on the next start, and the snapshot below
    // still tells the client where things stand.
    if (!(error instanceof CredentialSyncError)) {
      send(socket, { type: "error", message: error instanceof CredentialError ? error.message : String(error) });
      return;
    }
    stalled("the live model runtime", error);
  }

  try {
    // refresh() reaches the network unless PI_OFFLINE is set: it re-fetches remote
    // model catalogs, and that request is what hangs on a constrained host.
    //
    // It also *swallows* an abort — it resolves with `{ aborted: true }` instead of
    // throwing — so the catch below never sees one. Read the flag, or a refresh cut
    // short at the ceiling passes for a clean one and the warning never fires.
    const result = await credentials.refreshModels(AbortSignal.timeout(CREDENTIAL_SYNC_TIMEOUT_MS));
    if (result?.aborted) stalled("the model refresh", "aborted at the ceiling");
  } catch (error) {
    stalled("the model refresh", error);
  }
  await adoptUsableModel(socket);
}

/**
 * Apply the editable runtime settings: persist them, then rebuild the session so
 * the new toolset and skills take effect.
 *
 * Persist *first*, and give up on the whole thing if the write fails. The old
 * order — mutate the live config, rebuild, and never write anything — meant a
 * change the user watched take effect vanished at the next restart, and there was
 * no moment at which the two disagreed visibly enough to notice. Writing first
 * also makes the failure honest: a configuration that cannot be saved leaves the
 * running server exactly as it was, and says so.
 *
 * The running turn (if any) continues under the old sandbox.
 */
async function handleUpdateConfig(
  socket: WebSocket,
  update: { sandbox?: { root: string; allowWrite: boolean; allowBash: boolean; writableRoot?: string }; userSkillPaths?: string[] },
): Promise<void> {
  if (replacingSession) {
    send(socket, { type: "error", message: "Session change already in progress" });
    return;
  }
  const rebuildTools = runtime.rebuildTools;
  if (!rebuildTools) {
    // These settings describe resources this server builds. An RPC child builds its
    // own, so accepting the change would leave the UI showing a boundary nothing
    // enforces and skills the child never loaded.
    send(socket, { type: "error", message: new RuntimeUnsupportedError("Changing runtime settings", runtime.kind).message });
    return;
  }
  if (update.sandbox && config.sandbox === undefined) {
    send(socket, { type: "error", message: "No sandbox configured — cannot update" });
    return;
  }

  // Paths typed into Settings resolve like paths written in the config file —
  // against the file's own directory — since that file is where they are going.
  const configDir = path.dirname(config.configFile);
  const resolve = (p: string) => path.resolve(configDir, p);

  // Enforce locks from config: locked fields keep their current value
  const locks = config.sandboxLocks ?? {};
  const current = config.sandbox;
  const mergedSandbox =
    update.sandbox && current
      ? {
          root: locks.root ? current.root : resolve(update.sandbox.root),
          allowWrite: locks.allowWrite ? current.allowWrite : update.sandbox.allowWrite,
          allowBash: locks.allowBash ? current.allowBash : update.sandbox.allowBash,
          writableRoot: locks.writableRoot
            ? current.writableRoot
            : update.sandbox.writableRoot === undefined
              ? undefined
              : resolve(update.sandbox.writableRoot),
        }
      : undefined;
  const mergedSkillPaths = update.userSkillPaths?.map(resolve);

  const persisted: EditableSettings = {
    ...(mergedSandbox ? { sandbox: mergedSandbox } : {}),
    ...(mergedSkillPaths ? { userSkillPaths: mergedSkillPaths } : {}),
  };
  try {
    persistEditableSettings(config, persisted);
  } catch (error) {
    // Nothing has been touched: the live configuration, the browser roots and the
    // session are all still the ones the user is looking at.
    reportError(error);
    send(socket, {
      type: "error",
      message: error instanceof ConfigWriteError ? error.message : `Could not save settings: ${String(error)}`,
    });
    return;
  }

  replacingSession = true;
  try {
    if (mergedSkillPaths) config.userSkillPaths = mergedSkillPaths;
    if (mergedSandbox) {
      config.sandbox = {
        root: mergedSandbox.root,
        allowWrite: mergedSandbox.allowWrite,
        allowBash: mergedSandbox.allowBash,
        writableRoot: mergedSandbox.writableRoot,
        readExceptions: [],
      };
    }
    if (config.sandbox) {
      // Recomputed rather than carried over: skill paths are read-only exceptions to
      // the sandbox (see loadConfig), so a skill directory added outside the root
      // would otherwise be a skill the agent is forbidden to read.
      config.sandbox.readExceptions = [
        ...allSkillPaths(config),
        ...config.promptPaths,
        ...config.extensionPaths,
        ...config.extensionScripts,
      ];
    }
    BROWSER_ROOT = await resolveBrowserRoot(config);
    WRITABLE_ROOT = await resolveWritableRoot(config, BROWSER_ROOT);
    GIT = await probeGit(BROWSER_ROOT);
    // Every watched path was relative to the root that just moved.
    fileWatcher?.close();
    fileWatcher = buildFileWatcher();
    sandboxedTools = config.sandbox ? await createSandboxedTools(config.sandbox, config.pdf.maxBytes, config.docx.maxBytes, config.xlsx.maxBytes, config.pptx.maxBytes) : undefined;
    // Replace the current session so the new runtime picks up the updated tools
    // and re-runs skill discovery over the new paths.
    await rebuildTools.call(runtime);
    // Only now: the settings are on disk and the session in front of the user was
    // built from them.
    send(socket, { type: "update_config_ack", ...snapshot() });
  } catch (error) {
    reportError(error);
    send(socket, { type: "error", message: `Settings saved, but the session could not be rebuilt: ${error instanceof Error ? error.message : String(error)}` });
    try {
      await rebuildTools.call(runtime);
    } catch (recoveryError) {
      reportError(recoveryError);
    }
  } finally {
    replacingSession = false;
  }
}

/** Directory listing for a Settings path picker — directories only, from `/`. */
async function handleBrowseServerDirectory(socket: WebSocket, requestedPath: string, requestId: string): Promise<void> {
  try {
    const listing = await listServerDirectories(requestedPath);
    send(socket, { type: "server_directory", requestId, ...listing });
  } catch (error) {
    send(socket, {
      type: "server_directory_error",
      requestId,
      path: error instanceof ServerDirectoryError ? error.path : requestedPath,
      message: error instanceof ServerDirectoryError ? error.message : `Cannot list "${requestedPath}": ${String(error)}`,
    });
  }
}

/** Declare an OpenAI-compatible endpoint: live for this session, and persisted for the next. */
async function handleDeclareProvider(socket: WebSocket, declaration: ProviderDeclaration): Promise<void> {
  const credentials = runtime.credentials;
  if (!credentials) {
    send(socket, { type: "error", message: new RuntimeUnsupportedError("Declaring a provider", runtime.kind).message });
    return;
  }
  try {
    await credentials.declareProvider(declaration);
  } catch (error) {
    send(socket, { type: "error", message: error instanceof CredentialError ? error.message : String(error) });
    return;
  }
  await adoptUsableModel(socket);
}

/**
 * Move the live session onto a model that can actually answer, and tell every client.
 *
 * The session itself is fine — it was only pointed at a model with no auth — so this
 * re-points it rather than rebuilding it, and the conversation (empty on a first run,
 * but not necessarily: credentials can also expire mid-session) survives untouched.
 *
 * Which is also why clients get `credentials_changed` and not a snapshot: a snapshot
 * means "this is a different session", and clients answer it by dropping every live
 * extension dialog, notification, status and widget — state this server still holds,
 * and a pending dialog the agent is still waiting on.
 */
async function adoptUsableModel(socket: WebSocket): Promise<void> {
  const announce = () =>
    broadcast({ type: "credentials_changed", models: availableModels(), model: modelName(), credentials: credentialStatus() });

  const choices = availableModels();
  if (choices.length === 0) {
    send(socket, {
      type: "error",
      message: `Credentials stored in ${AGENT_DIR}, but no model is available — check "allowedModels" in your configuration.`,
    });
    announce();
    return;
  }
  const current = runtime.snapshot().model;
  const usable = choices.some((choice) => choice.provider === current?.provider && choice.id === current?.id);
  if (!usable) await runtime.credentials?.adoptModel(choices[0]);
  announce();
}

/** Validate client-supplied attachments; reject anything that isn't a small image. */
function validImages(images: unknown): WireImage[] | undefined {
  if (images === undefined) return undefined;
  if (!Array.isArray(images) || images.length > MAX_IMAGES) return undefined;
  const valid: WireImage[] = [];
  for (const image of images) {
    const { data, mimeType } = (image ?? {}) as Partial<WireImage>;
    if (typeof data !== "string" || data.length === 0 || data.length > MAX_IMAGE_BYTES) return undefined;
    if (typeof mimeType !== "string" || !mimeType.startsWith("image/")) return undefined;
    valid.push({ data, mimeType });
  }
  return valid;
}

async function handlePrompt(text: string, images?: WireImage[]): Promise<void> {
  await runtime.prompt(text, {
    ...(images?.length ? { images } : {}),
    // Echo the user message only once accepted (avoids ghost bubbles on reject)
    onAccepted: (accepted) => {
      if (accepted) broadcast({ type: "user", text, ...(images?.length ? { images } : {}) });
    },
  });
  // The entries and tree are announced when the turn settles, not here: an RPC
  // prompt resolves at *acceptance* (that is Pi's contract — a failure after
  // acceptance reports through the event stream, never as a second result), so
  // reading the conversation at this point would read it before the turn ran.
}

/**
 * Re-send a past user message with edited text: rewind to just before it, then
 * prompt again. The new answer becomes a sibling branch — the original exchange
 * stays reachable in the tree (that's the whole point of editing here).
 */
async function editPrompt(socket: WebSocket, entryId: string, text: string, images?: WireImage[]): Promise<void> {
  const navigate = runtime.navigateTree;
  if (!navigate) {
    // Editing rewinds the leaf to just before a past message. Pi RPC forks and
    // clones but does not move the leaf, so there is no equivalent to offer.
    send(socket, { type: "error", message: new RuntimeUnsupportedError("Editing a past message", runtime.kind).message });
    return;
  }
  if (runtime.snapshot().isStreaming) {
    send(socket, { type: "error", message: "Cannot edit a message while the agent is running" });
    return;
  }
  if (!isUserMessageEntry(entryId)) {
    send(socket, { type: "error", message: "Unknown message" });
    return;
  }
  if (replacingSession) {
    send(socket, { type: "error", message: "Session change already in progress" });
    return;
  }
  replacingSession = true;
  try {
    const { cancelled } = await navigate.call(runtime, entryId);
    if (cancelled) {
      // An extension vetoed the rewind — say so: the client already dropped the draft
      send(socket, { type: "error", message: "Edit cancelled — the conversation was not rewound" });
      return;
    }
    broadcast({ type: "session_replaced", ...snapshot() });
  } finally {
    replacingSession = false;
  }
  await handlePrompt(text, images);
}

/**
 * Session paths come from clients: only accept ones SessionManager.list
 * returns for this cwd (authoritative allowlist — no path traversal, and no
 * reading/persisting to attacker-chosen files via switch_session).
 */
async function isKnownSessionPath(path: string): Promise<boolean> {
  const sessions = await SessionManager.list(AGENT_CWD, SESSION_DIR);
  return sessions.some((info) => info.path === path);
}

/** Delete a saved session file (allowlisted path, never the live one). */
async function deleteSession(socket: WebSocket, path: string): Promise<void> {
  const live = liveSessionMatch(path);
  if (live === "live") {
    send(socket, { type: "error", message: "Cannot delete the active session" });
    return;
  }
  if (live === "unknown") {
    send(socket, { type: "error", message: `${UNKNOWN_LIVE_SESSION} — deleting it could remove the running conversation` });
    return;
  }
  if (!(await isKnownSessionPath(path))) {
    send(socket, { type: "error", message: "Unknown session" });
    return;
  }
  await fs.unlink(path);
  invalidateSessionScan();
  await listSessions(socket);
}

async function switchSession(socket: WebSocket, path: string): Promise<void> {
  if (!(await isKnownSessionPath(path))) {
    send(socket, { type: "error", message: "Unknown session" });
    return;
  }
  await replaceSession(socket, () => runtime.switchSession(path));
}

const SESSION_LIST_LIMIT = 50;
/**
 * `SessionManager.list` reads every session file, transcripts included — and the
 * session search fires one per (debounced) keystroke. Reuse the scan for a moment:
 * a session the user is typing about does not change between two keystrokes.
 */
const SESSION_SCAN_TTL_MS = 1000;
let sessionScan: { at: number; sessions: SessionInfo[] } | null = null;

async function scanSessions(): Promise<SessionInfo[]> {
  if (sessionScan && Date.now() - sessionScan.at < SESSION_SCAN_TTL_MS) return sessionScan.sessions;
  const sessions = await SessionManager.list(AGENT_CWD, SESSION_DIR);
  sessionScan = { at: Date.now(), sessions };
  return sessions;
}

/** Anything that writes to a session file (rename, title, delete) must drop the scan. */
function invalidateSessionScan(): void {
  sessionScan = null;
}

async function sessionList(): Promise<SessionSummary[]> {
  const sessions = await scanSessions();
  return [...sessions]
    .sort((a, b) => b.modified.getTime() - a.modified.getTime())
    .slice(0, SESSION_LIST_LIMIT)
    .map((info) => toSummary(info));
}

async function listSessions(socket: WebSocket): Promise<void> {
  send(socket, { type: "sessions", sessions: await sessionList() });
}

/** A name change is visible to everyone: all clients watch the same agent. */
async function broadcastSessions(): Promise<void> {
  broadcast({ type: "sessions", sessions: await sessionList() });
}

/**
 * Set (or clear, with an empty name) a session's display name. Any saved session
 * can be renamed, not just the live one — but the path comes from a client, so it
 * goes through the same allowlist as switch/delete: no writing to arbitrary files.
 */
async function renameSession(socket: WebSocket, path: string, rawName: string): Promise<void> {
  if (!(await isKnownSessionPath(path))) {
    send(socket, { type: "error", message: "Unknown session" });
    return;
  }
  const name = sanitizeName(rawName);
  const live = liveSessionMatch(path);
  if (live === "unknown") {
    send(socket, { type: "error", message: `${UNKNOWN_LIVE_SESSION} — renaming could corrupt the running conversation` });
    return;
  }
  if (live === "live") {
    // Through the live runtime, so the running session and its file agree. A second
    // SessionManager over the live file would be a disaster: opening one can rewrite
    // the file wholesale (version migration), racing the live appends.
    await runtime.setSessionName(name);
  } else {
    SessionManager.open(path, SESSION_DIR, AGENT_CWD).appendSessionInfo(name);
  }
  invalidateSessionScan();
  await broadcastSessions();
}

/**
 * Is this path the session the agent is running right now?
 *
 * Three answers, not two. Standard Pi reports `sessionFile` in its state, but a
 * fork may not, and `--no-session` means there is no file at all — and the old
 * two-valued version read "we don't know" as "not the live one". That is the wrong
 * way to be wrong: `deleteSession` would unlink the file the agent is appending to,
 * and `renameSession` would take the `SessionManager.open()` branch over it, which
 * can rewrite the file wholesale while the agent writes to it.
 *
 * Both sides are resolved: they come from different normalizers.
 */
function liveSessionMatch(candidate: string): "live" | "not-live" | "unknown" {
  const live = runtime.snapshot().sessionFile;
  if (live === undefined) return "unknown";
  return path.resolve(candidate) === path.resolve(live) ? "live" : "not-live";
}

/** The refusal for a runtime that will not say which file it is writing to. */
const UNKNOWN_LIVE_SESSION = "The agent runtime does not report which session file it is using, so this cannot be done safely";

/** Match against the name, the first message and the whole transcript (server-side — see sessions.ts). */
async function handleSearchSessions(socket: WebSocket, query: string, requestId: string): Promise<void> {
  send(socket, {
    type: "session_search_results",
    requestId,
    query,
    sessions: searchSessions(await scanSessions(), query, SESSION_LIST_LIMIT),
  });
}

// --- Automatic session naming ------------------------------------------------------

const TITLE_TIMEOUT_MS = 30_000;

/** Session files with a title request in flight — keyed, not global: two sessions can be named in parallel. */
const namingSessions = new Set<string>();

/**
 * Title a session from its first exchange, once, after the turn has landed — the
 * session menu should list topics, not opening lines. Best-effort on purpose: a
 * failing model (or no credentials) leaves the session unnamed, the UI falls back
 * to the first message, and no error ever reaches the client.
 *
 * "Once" means once *ever*, and the signal is the `session_info` entry rather than
 * the name: a user who clears a name reads back as unnamed, and re-titling what
 * they just erased on their next turn would be the opposite of helpful.
 */
async function maybeNameSession(): Promise<void> {
  // Titling needs one direct model call with the session's own credentials. Only the
  // embedded runtime can make it; under RPC the session keeps the UI's fallback (its
  // first message) unless the user renames it by hand.
  const titles = runtime.titles;
  if (!titles) return;
  const file = runtime.snapshot().sessionFile;
  if (file === undefined || namingSessions.has(file)) return;
  if (hasBeenNamed(runtime.entries() as never)) return;
  const exchange = firstExchange(runtime.contextEntries() as never);
  if (!exchange) return;
  namingSessions.add(file);
  try {
    const title = await titles.generateTitle(exchange, AbortSignal.timeout(TITLE_TIMEOUT_MS));
    if (!title) return;
    // While the model answered, the session may have been named by hand — or replaced.
    // `replacingSession` covers the window where the old session is already disposed
    // but the runtime still reports it: writing there would emit into a torn-down
    // extension runner.
    if (replacingSession || runtime.snapshot().sessionFile !== file) return;
    if (hasBeenNamed(runtime.entries() as never)) return;
    await runtime.setSessionName(title);
    invalidateSessionScan();
    await broadcastSessions();
  } catch (error) {
    console.warn(`[pi] session title failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    namingSessions.delete(file);
  }
}

function reportError(error: unknown): void {
  // A TLS-inspecting proxy surfaces as a bare "fetch failed", with the real cause
  // nested in `cause` — say what broke and how to fix it, rather than leaving the
  // user to guess that their employer's proxy is in the way.
  const message = tlsHint(error) ?? (error instanceof Error ? error.message : String(error));
  broadcast({ type: "error", message });
}

// --- Fork / tree navigation -------------------------------------------------------

/**
 * Collapse the raw session tree (every entry is a node: assistant messages,
 * tool results, model changes…) down to user-message nodes only, so the UI
 * shows "the points you can return to". A node is `onPath` when the current
 * leaf lives in its subtree, i.e. it is on the active branch.
 */
function buildTree(): TreeNode[] {
  const { roots, leafId } = runtime.tree();

  function subtreeHasLeaf(node: RuntimeTreeNode): boolean {
    return node.entry.id === leafId || node.children.some(subtreeHasLeaf);
  }

  function isUserNode(node: RuntimeTreeNode): boolean {
    return node.entry.type === "message" && node.entry.message?.role === "user";
  }

  /**
   * End of this turn's reply: descend through the entries answering the message
   * (assistant text, tool results…) and stop at the next user turn. Navigating
   * there restores the exchange in full — navigating to the user message itself
   * rewinds to *before* it (the SDK hands the text back as editor prefill and
   * the reply disappears from the transcript).
   *
   * Only a non-user `message` entry is a valid tip: the SDK treats custom_message
   * targets exactly like user messages (leaf = parent, content → editor prefill),
   * so stopping on one would rewind a step short and paste an extension's internal
   * message into the composer. Undefined when the turn has no reply yet, or when
   * the replies fork (ambiguous — the user node stays the safe fallback).
   */
  function replyTip(node: RuntimeTreeNode): string | undefined {
    let current = node;
    let tip: RuntimeTreeNode | undefined;
    for (;;) {
      const replies = current.children.filter((child) => !isUserNode(child));
      if (replies.length !== 1) break;
      current = replies[0];
      if (current.entry.type === "message") tip = current;
    }
    return tip?.entry.id;
  }

  function collapse(node: RuntimeTreeNode): TreeNode[] {
    const childNodes = node.children.flatMap(collapse);
    if (isUserNode(node)) {
      const text = contentText(node.entry.message!.content as never).split("\n")[0].slice(0, 100);
      const tipId = replyTip(node);
      return [
        {
          entryId: node.entry.id,
          ...(tipId ? { tipId } : {}),
          text,
          onPath: subtreeHasLeaf(node),
          ...(node.label ? { label: node.label } : {}),
          children: childNodes,
        },
      ];
    }
    return childNodes;
  }

  return roots.flatMap(collapse);
}

/** Every entry id the tree exposes as a navigation target (user turns + their reply tips). */
function treeNavigationTargets(roots: TreeNode[]): Set<string> {
  const ids = new Set<string>();
  function walk(nodes: TreeNode[]): void {
    for (const node of nodes) {
      ids.add(node.entryId);
      if (node.tipId) ids.add(node.tipId);
      walk(node.children);
    }
  }
  walk(roots);
  return ids;
}

function sendTree(socket: WebSocket): void {
  send(socket, { type: "tree", roots: buildTree() });
}

/** Fork targets must be user-message entries (both runtimes reject anything else). */
function isUserMessageEntry(entryId: string): boolean {
  const entry = runtime.entries().find((candidate) => candidate.id === entryId);
  return entry?.type === "message" && entry.message?.role === "user";
}

/**
 * Move the current leaf to another node of the same session file (checkout of an
 * earlier/parallel branch). The transcript changes without a session replacement,
 * so clients get a fresh snapshot. Two kinds of target: a user message (rewind to
 * before it — the SDK hands its text back as composer prefill, same UX as pi's
 * TUI) or a reply tip (restore that exchange in full, reply included).
 */
async function navigateTree(socket: WebSocket, entryId: string): Promise<void> {
  const navigate = runtime.navigateTree;
  if (!navigate) {
    send(socket, { type: "error", message: new RuntimeUnsupportedError("Tree navigation", runtime.kind).message });
    return;
  }
  if (runtime.snapshot().isStreaming) {
    send(socket, { type: "error", message: "Cannot navigate the tree while the agent is running" });
    return;
  }
  const roots = buildTree();
  if (!treeNavigationTargets(roots).has(entryId)) {
    send(socket, { type: "error", message: "Unknown tree node" });
    return;
  }
  // Serialize against session replacement AND against a prompt sneaking in
  // during the SDK's async pre-navigation hooks (session_before_tree): the
  // flag closes the check-then-act window at the server boundary.
  if (replacingSession) {
    send(socket, { type: "error", message: "Session change already in progress" });
    return;
  }
  replacingSession = true;
  try {
    const { cancelled, editorText } = await navigate.call(runtime, entryId);
    if (cancelled) return;
    broadcast({ type: "session_replaced", ...snapshot() });
    if (editorText) send(socket, { type: "editor_prefill", text: editorText });
    broadcast({ type: "tree", roots: buildTree() });
  } finally {
    replacingSession = false;
  }
}

/** Fork a new session file starting just before the given user message. */
async function forkSession(socket: WebSocket, entryId: string): Promise<void> {
  if (!isUserMessageEntry(entryId)) {
    // Also protects replaceSession's recovery path: runtime.fork throws on
    // non-user entries BEFORE teardown, and recovery would needlessly swap
    // the healthy live session for a fresh one.
    send(socket, { type: "error", message: "Unknown tree node" });
    return;
  }
  let selectedText: string | undefined;
  await replaceSession(socket, async () => {
    const result = await runtime.fork(entryId);
    selectedText = result.selectedText;
    return result;
  });
  if (selectedText) send(socket, { type: "editor_prefill", text: selectedText });
  broadcast({ type: "tree", roots: buildTree() });
}

/** File-browser sidebar: list a directory, confined to BROWSER_ROOT. */
async function handleListDirectory(socket: WebSocket, dirPath: string, requestId: string): Promise<void> {
  try {
    const entries = await listDirectory(BROWSER_ROOT, dirPath);
    send(socket, { type: "directory_listing", requestId, path: dirPath, entries });
    // After the listing, not before: a directory the client was refused is one it
    // is not showing, and watching it would announce changes nobody can act on.
    // Registering here also makes "watched" mean exactly "displayed somewhere".
    void fileWatcher?.watch(dirPath);
  } catch (error) {
    const message = error instanceof FileBrowserError ? error.message : `Unexpected error: ${(error as Error).message}`;
    send(socket, { type: "file_browser_error", requestId, path: dirPath, message });
  }
}

/** File-browser sidebar: read a file for preview, confined to BROWSER_ROOT. */
async function handleReadFile(socket: WebSocket, filePath: string, requestId: string): Promise<void> {
  try {
    const { content, size, mtimeMs } = await readFileForPreview(BROWSER_ROOT, filePath);
    send(socket, { type: "file_content", requestId, path: filePath, content, size, mtimeMs });
  } catch (error) {
    const message = error instanceof FileBrowserError ? error.message : `Unexpected error: ${(error as Error).message}`;
    send(socket, { type: "file_browser_error", requestId, path: filePath, message });
  }
}

/** File viewer's editor: save a buffer back, confined to the writable zone (WRITABLE_ROOT). */
async function handleWriteFile(
  socket: WebSocket,
  filePath: string,
  content: string,
  expectedMtimeMs: number,
  force: boolean,
  requestId: string,
): Promise<void> {
  try {
    const { size, mtimeMs } = await writeFileFromBrowser(BROWSER_ROOT, WRITABLE_ROOT, filePath, content, expectedMtimeMs, force);
    send(socket, { type: "file_written", requestId, path: filePath, size, mtimeMs });
    broadcast({ type: "file_changed", path: filePath });
  } catch (error) {
    if (error instanceof FileBrowserError) {
      send(socket, { type: "file_browser_error", requestId, path: filePath, message: error.message, reason: error.reason });
    } else {
      send(socket, { type: "file_browser_error", requestId, path: filePath, message: `Unexpected error: ${(error as Error).message}` });
    }
  }
}

/**
 * Create an empty file. Answered like a write, so the client can open the new
 * file straight into its editor without a second round trip.
 */
async function handleCreateFile(socket: WebSocket, filePath: string, requestId: string): Promise<void> {
  try {
    const { size, mtimeMs } = await createFileFromBrowser(BROWSER_ROOT, WRITABLE_ROOT, filePath);
    send(socket, { type: "file_written", requestId, path: filePath, size, mtimeMs });
    broadcast({ type: "file_changed", path: filePath });
  } catch (error) {
    sendFileBrowserError(socket, requestId, filePath, error);
  }
}

/**
 * Create one directory. Answered with its listing — empty, but it tells the tree
 * the directory exists and lets it expand without asking again.
 */
async function handleCreateDirectory(socket: WebSocket, dirPath: string, requestId: string): Promise<void> {
  try {
    await createDirectoryFromBrowser(BROWSER_ROOT, WRITABLE_ROOT, dirPath);
    const entries = await listDirectory(BROWSER_ROOT, dirPath);
    send(socket, { type: "directory_listing", requestId, path: dirPath, entries });
    broadcast({ type: "file_changed", path: dirPath });
  } catch (error) {
    sendFileBrowserError(socket, requestId, dirPath, error);
  }
}

async function handleOpenNative(socket: WebSocket, filePath: string, requestId: string): Promise<void> {
  try {
    await openFileNative(BROWSER_ROOT, filePath);
    send(socket, { type: "file_operation_result", requestId, operation: "open_native", path: filePath });
  } catch (error) {
    sendFileBrowserError(socket, requestId, filePath, error);
  }
}

async function handleRenameFile(socket: WebSocket, filePath: string, name: string, requestId: string): Promise<void> {
  try {
    const renamedPath = await renameFileFromBrowser(BROWSER_ROOT, WRITABLE_ROOT, filePath, name);
    send(socket, { type: "file_operation_result", requestId, operation: "rename_file", path: renamedPath, previousPath: filePath });
    broadcast({ type: "file_changed", path: filePath });
    broadcast({ type: "file_changed", path: renamedPath });
  } catch (error) {
    sendFileBrowserError(socket, requestId, filePath, error);
  }
}

async function handleDeleteFile(socket: WebSocket, filePath: string, requestId: string): Promise<void> {
  try {
    await deleteFileFromBrowser(BROWSER_ROOT, WRITABLE_ROOT, filePath);
    send(socket, { type: "file_operation_result", requestId, operation: "delete_file", path: filePath });
    broadcast({ type: "file_changed", path: filePath });
  } catch (error) {
    sendFileBrowserError(socket, requestId, filePath, error);
  }
}

async function handleMoveFile(socket: WebSocket, filePath: string, destinationDirectory: string, requestId: string): Promise<void> {
  try {
    const movedPath = await moveFileFromBrowser(BROWSER_ROOT, WRITABLE_ROOT, filePath, destinationDirectory);
    send(socket, { type: "file_operation_result", requestId, operation: "move_file", path: movedPath, previousPath: filePath });
    broadcast({ type: "file_changed", path: filePath });
    broadcast({ type: "file_changed", path: movedPath });
  } catch (error) {
    sendFileBrowserError(socket, requestId, filePath, error);
  }
}

/**
 * Store a file supplied from outside the workspace. Answered with the path the
 * server wrote — a collision is disambiguated here, so the client cannot assume
 * the name it asked for survived.
 */
async function handleUploadFile(
  socket: WebSocket,
  destinationDirectory: string,
  name: string,
  contentBase64: string,
  requestId: string,
): Promise<void> {
  const requestedPath = destinationDirectory ? `${destinationDirectory}/${name}` : name;
  try {
    const writtenPath = await uploadFileFromBrowser(BROWSER_ROOT, WRITABLE_ROOT, destinationDirectory, name, contentBase64);
    send(socket, { type: "file_uploaded", requestId, path: writtenPath });
    broadcast({ type: "file_changed", path: writtenPath });
  } catch (error) {
    sendFileBrowserError(socket, requestId, requestedPath, error);
  }
}

async function handleCopyFile(socket: WebSocket, filePath: string, destinationDirectory: string, requestId: string): Promise<void> {
  try {
    const copiedPath = await copyFileFromBrowser(BROWSER_ROOT, WRITABLE_ROOT, filePath, destinationDirectory);
    send(socket, { type: "file_operation_result", requestId, operation: "copy_file", path: copiedPath });
    broadcast({ type: "file_changed", path: copiedPath });
  } catch (error) {
    sendFileBrowserError(socket, requestId, filePath, error);
  }
}

function sendFileBrowserError(socket: WebSocket, requestId: string, targetPath: string, error: unknown): void {
  if (error instanceof FileBrowserError) {
    send(socket, { type: "file_browser_error", requestId, path: targetPath, message: error.message, reason: error.reason });
  } else {
    send(socket, { type: "file_browser_error", requestId, path: targetPath, message: `Unexpected error: ${(error as Error).message}` });
  }
}

// --- Git (read-only, confined to BROWSER_ROOT via `-- .` pathspec) --------------

function gitErrorMessage(error: unknown): string {
  return error instanceof GitError || error instanceof FileBrowserError
    ? error.message
    : `Unexpected error: ${(error as Error).message}`;
}

async function handleGitStatus(socket: WebSocket, requestId: string): Promise<void> {
  if (GIT === null) return send(socket, { type: "git_error", requestId, message: "git is not available" });
  try {
    const { branch, ahead, behind, files } = await gitStatus(BROWSER_ROOT);
    send(socket, { type: "git_status", requestId, branch, ahead, behind, files });
  } catch (error) {
    send(socket, { type: "git_error", requestId, message: gitErrorMessage(error) });
  }
}

/** Worktree-vs-HEAD contents of one file; missing sides (untracked/deleted) are "". */
async function handleGitDiff(socket: WebSocket, filePath: string, requestId: string): Promise<void> {
  if (GIT === null) return send(socket, { type: "git_error", requestId, message: "git is not available" });
  try {
    let after = "";
    try {
      after = (await readFileForPreview(BROWSER_ROOT, filePath)).content;
    } catch (error) {
      // A deleted file legitimately has no worktree side; confinement/size/binary still refuse
      if (!(error instanceof FileBrowserError) || error.reason !== "not-found") throw error;
    }
    const before = await gitHeadContent(BROWSER_ROOT, GIT.toplevel, filePath);
    if (before.includes("\0")) throw new FileBrowserError("binary", "Binary file — diff not supported");
    if (Buffer.byteLength(before, "utf8") > 1_048_576) {
      throw new FileBrowserError("too-large", "HEAD version is larger than the 1 MB limit");
    }
    send(socket, { type: "git_diff", requestId, path: filePath, before, after });
  } catch (error) {
    send(socket, { type: "git_error", requestId, message: gitErrorMessage(error) });
  }
}

async function handleGitLog(socket: WebSocket, limit: number, requestId: string): Promise<void> {
  if (GIT === null) return send(socket, { type: "git_error", requestId, message: "git is not available" });
  try {
    send(socket, { type: "git_log", requestId, entries: await gitLog(BROWSER_ROOT, limit) });
  } catch (error) {
    send(socket, { type: "git_error", requestId, message: gitErrorMessage(error) });
  }
}

function isGitRevision(value: unknown): value is GitRevision {
  const revision = value as GitRevision | undefined;
  return typeof revision?.rev === "string" && typeof revision.path === "string";
}

/** Commits touching one file, for the history graph. */
async function handleGitFileLog(socket: WebSocket, filePath: string, limit: number, requestId: string): Promise<void> {
  if (GIT === null) return send(socket, { type: "git_error", requestId, message: "git is not available" });
  try {
    // Confine before spawning: this path goes straight into a pathspec. Only
    // confinement applies — a deleted or oversized file still has a history.
    await assertWithinRoot(BROWSER_ROOT, filePath);
    const entries = await gitFileLog(BROWSER_ROOT, GIT.toplevel, filePath, limit);
    send(socket, { type: "git_file_log", requestId, path: filePath, entries });
  } catch (error) {
    send(socket, { type: "git_error", requestId, message: gitErrorMessage(error) });
  }
}

/**
 * One side of a two-point file diff. The working tree is read from disk; every
 * other revision goes through git. Both sides obey the file browser's confinement
 * and its size and binary limits, so a pair can never smuggle out an oversized
 * blob or a path outside the browser root.
 */
async function readRevisionSide(revision: GitRevision, toplevel: string): Promise<string> {
  if (revision.rev === WORKTREE_REVISION) {
    try {
      return (await readFileForPreview(BROWSER_ROOT, revision.path)).content;
    } catch (error) {
      // A file deleted since that commit legitimately has no worktree side
      if (error instanceof FileBrowserError && error.reason === "not-found") return "";
      throw error;
    }
  }
  // Confine before spawning: the path becomes part of a `<rev>:<path>` argument
  await assertWithinRoot(BROWSER_ROOT, revision.path);
  const content = await gitRevisionContent(BROWSER_ROOT, toplevel, revision.rev, revision.path);
  if (content.includes("\0")) throw new FileBrowserError("binary", "Binary file — diff not supported");
  if (Buffer.byteLength(content, "utf8") > MAX_PREVIEW_BYTES) {
    throw new FileBrowserError("too-large", `${revision.rev.slice(0, 7)} is larger than the 1 MB limit`);
  }
  return content;
}

async function handleGitFileDiff(socket: WebSocket, base: GitRevision, target: GitRevision, requestId: string): Promise<void> {
  if (GIT === null) return send(socket, { type: "git_error", requestId, message: "git is not available" });
  try {
    const [beforeText, afterText] = await Promise.all([readRevisionSide(base, GIT.toplevel), readRevisionSide(target, GIT.toplevel)]);
    send(socket, { type: "git_file_diff", requestId, base, target, beforeText, afterText });
  } catch (error) {
    send(socket, { type: "git_error", requestId, message: gitErrorMessage(error) });
  }
}

async function handleGitShow(socket: WebSocket, sha: string, requestId: string): Promise<void> {
  if (GIT === null) return send(socket, { type: "git_error", requestId, message: "git is not available" });
  try {
    const { patch, truncated } = await gitShow(BROWSER_ROOT, sha);
    send(socket, { type: "git_show", requestId, sha, patch, truncated });
  } catch (error) {
    send(socket, { type: "git_error", requestId, message: gitErrorMessage(error) });
  }
}

/** Composer's `@` mention autocomplete: recursive name search, confined to BROWSER_ROOT. */
async function handleSearchFiles(socket: WebSocket, query: string, requestId: string): Promise<void> {
  const results = await searchFiles(BROWSER_ROOT, query);
  send(socket, { type: "file_search_results", requestId, query, results });
}

/**
 * Browser messages that need a working agent runtime. Everything absent from this
 * set — the file browser, git, session listing and search — keeps working after a
 * runtime failure, because none of it goes through the agent.
 */
const AGENT_COMMANDS = new Set<ClientMessage["type"]>([
  "prompt",
  "abort",
  "set_model",
  "set_thinking",
  "new_session",
  "switch_session",
  "compact",
  "rename_session",
  "navigate_tree",
  "fork_session",
  "edit_prompt",
  "list_tree",
  "extension_ui_response",
  "set_credential",
  "declare_provider",
  "update_config",
]);

function handleClientMessage(socket: WebSocket, raw: string): void {
  let message: ClientMessage;
  try {
    message = JSON.parse(raw) as ClientMessage;
  } catch {
    return;
  }
  // JSON.parse can yield null/primitives — never crash on a malformed frame
  if (typeof message !== "object" || message === null) return;
  // Fail closed. A prompt sent to a dead runtime must be refused where the user can
  // see it, not queued for a process that is never coming back.
  if (!runtime.ok && AGENT_COMMANDS.has(message.type)) {
    send(socket, { type: "error", message: `Agent runtime unavailable: ${runtime.failure ?? "the runtime stopped"}` });
    return;
  }
  switch (message.type) {
    case "prompt": {
      if (typeof message.text !== "string") return;
      // A prompt landing mid-navigation would append under the OLD leaf, and the
      // navigation would then overwrite the running turn's message state
      if (replacingSession) {
        send(socket, { type: "error", message: "Session change already in progress" });
        return;
      }
      const text = message.text.trim();
      const images = validImages(message.images);
      if (message.images !== undefined && images === undefined) {
        // Never drop a message silently: the client already cleared its composer
        send(socket, { type: "error", message: "Attachments rejected (too large or invalid)" });
        return;
      }
      if (!text && !images?.length) return;
      handlePrompt(text || "(see attached images)", images).catch(reportError);
      break;
    }
    case "abort":
      runtime.abort().catch(() => {});
      break;
    case "set_model": {
      if (typeof message.provider !== "string" || typeof message.id !== "string") return;
      const { provider, id } = message;
      runtime
        .setModel(provider, id)
        .then((model) => broadcast({ type: "model_changed", model: modelName(), reasoning: model.reasoning ?? false }))
        .catch((error) => {
          if (!refuseUnsupported(socket, error)) {
            send(socket, { type: "error", message: error instanceof Error ? error.message : String(error) });
          }
        });
      break;
    }
    case "set_thinking": {
      if (!THINKING_LEVELS.includes(message.level)) return;
      const level = message.level;
      runtime
        .setThinkingLevel(level)
        // The runtime is the authority on what it settled at — a model without the
        // requested level lands elsewhere, and the UI must show what it landed on.
        .then(() => broadcast({ type: "thinking_changed", level: runtime.snapshot().thinkingLevel }))
        .catch(reportError);
      break;
    }
    case "new_session":
      void replaceSession(socket, () => runtime.newSession());
      break;
    case "switch_session":
      if (typeof message.path !== "string") return;
      switchSession(socket, message.path).catch(reportError);
      break;
    case "delete_session":
      if (typeof message.path !== "string") return;
      deleteSession(socket, message.path).catch(reportError);
      break;
    case "list_sessions":
      listSessions(socket).catch(reportError);
      break;
    case "rename_session":
      if (typeof message.path !== "string" || typeof message.name !== "string") return;
      if (message.name.length > MAX_NAME_LENGTH * 4) return;
      renameSession(socket, message.path, message.name).catch(reportError);
      break;
    case "search_sessions":
      if (typeof message.query !== "string" || typeof message.requestId !== "string") return;
      // A search scans every transcript: don't let a client do it with a novel
      if (message.query.length > MAX_QUERY_LENGTH) return;
      handleSearchSessions(socket, message.query, message.requestId).catch(reportError);
      break;
    case "compact":
      // Failures surface via the compaction_end event (errorMessage) — avoid double-reporting.
      runtime.compact().catch(() => {});
      break;
    case "extension_ui_response": {
      // Every other case here checks its fields; this one used to pass the parsed
      // frame straight through to the child's stdin. The type is pinned by the
      // switch, but the rest is a client's to invent: an unbounded `value` stalls
      // every later command behind the write chain until the command timeout fires
      // and kills the runtime for good.
      if (typeof message.id !== "string") return;
      const answer = extensionUiAnswer(message);
      if (answer === undefined) return;
      runtime.answerExtensionUI(answer);
      break;
    }
    case "list_directory":
      if (typeof message.path !== "string" || typeof message.requestId !== "string") return;
      handleListDirectory(socket, message.path, message.requestId).catch(reportError);
      break;
    case "read_file":
      if (typeof message.path !== "string" || typeof message.requestId !== "string") return;
      handleReadFile(socket, message.path, message.requestId).catch(reportError);
      break;
    case "write_file":
      if (
        typeof message.path !== "string" ||
        typeof message.content !== "string" ||
        typeof message.expectedMtimeMs !== "number" ||
        typeof message.requestId !== "string"
      ) {
        return;
      }
      handleWriteFile(socket, message.path, message.content, message.expectedMtimeMs, message.force === true, message.requestId).catch(
        reportError,
      );
      break;
    case "create_file":
      if (typeof message.path !== "string" || typeof message.requestId !== "string") return;
      handleCreateFile(socket, message.path, message.requestId).catch(reportError);
      break;
    case "create_directory":
      if (typeof message.path !== "string" || typeof message.requestId !== "string") return;
      handleCreateDirectory(socket, message.path, message.requestId).catch(reportError);
      break;
    case "upload_file":
      if (
        typeof message.destinationDirectory !== "string" ||
        typeof message.name !== "string" ||
        typeof message.contentBase64 !== "string" ||
        typeof message.requestId !== "string"
      ) {
        return;
      }
      handleUploadFile(socket, message.destinationDirectory, message.name, message.contentBase64, message.requestId).catch(reportError);
      break;
    case "open_native":
      if (typeof message.path !== "string" || typeof message.requestId !== "string") return;
      handleOpenNative(socket, message.path, message.requestId).catch(reportError);
      break;
    case "rename_file":
      if (typeof message.path !== "string" || typeof message.name !== "string" || typeof message.requestId !== "string") return;
      handleRenameFile(socket, message.path, message.name, message.requestId).catch(reportError);
      break;
    case "delete_file":
      if (typeof message.path !== "string" || typeof message.requestId !== "string") return;
      handleDeleteFile(socket, message.path, message.requestId).catch(reportError);
      break;
    case "move_file":
      if (
        typeof message.path !== "string" ||
        typeof message.destinationDirectory !== "string" ||
        typeof message.requestId !== "string"
      ) {
        return;
      }
      handleMoveFile(socket, message.path, message.destinationDirectory, message.requestId).catch(reportError);
      break;
    case "copy_file":
      if (
        typeof message.path !== "string" ||
        typeof message.destinationDirectory !== "string" ||
        typeof message.requestId !== "string"
      ) {
        return;
      }
      handleCopyFile(socket, message.path, message.destinationDirectory, message.requestId).catch(reportError);
      break;
    case "search_files":
      if (typeof message.query !== "string" || typeof message.requestId !== "string") return;
      handleSearchFiles(socket, message.query, message.requestId).catch(reportError);
      break;
    case "list_tree":
      try {
        sendTree(socket);
      } catch (error) {
        reportError(error);
      }
      break;
    case "navigate_tree":
      if (typeof message.entryId !== "string") return;
      navigateTree(socket, message.entryId).catch(reportError);
      break;
    case "fork_session":
      if (typeof message.entryId !== "string") return;
      forkSession(socket, message.entryId).catch(reportError);
      break;
    case "edit_prompt": {
      if (typeof message.entryId !== "string" || typeof message.text !== "string") return;
      const editText = message.text.trim();
      const editImages = validImages(message.images);
      if (message.images !== undefined && editImages === undefined) {
        send(socket, { type: "error", message: "Attachments rejected (too large or invalid)" });
        return;
      }
      if (!editText && !editImages?.length) return;
      editPrompt(socket, message.entryId, editText || "(see attached images)", editImages).catch(reportError);
      break;
    }
    case "git_status":
      if (typeof message.requestId !== "string") return;
      handleGitStatus(socket, message.requestId).catch(reportError);
      break;
    case "git_diff":
      if (typeof message.path !== "string" || typeof message.requestId !== "string") return;
      handleGitDiff(socket, message.path, message.requestId).catch(reportError);
      break;
    case "git_log":
      if (typeof message.requestId !== "string") return;
      if (message.limit !== undefined && typeof message.limit !== "number") return;
      handleGitLog(socket, message.limit ?? 30, message.requestId).catch(reportError);
      break;
    case "git_show":
      if (typeof message.sha !== "string" || typeof message.requestId !== "string") return;
      handleGitShow(socket, message.sha, message.requestId).catch(reportError);
      break;
    case "git_file_log":
      if (typeof message.path !== "string" || typeof message.requestId !== "string") return;
      if (message.limit !== undefined && typeof message.limit !== "number") return;
      handleGitFileLog(socket, message.path, message.limit ?? 100, message.requestId).catch(reportError);
      break;
    case "git_file_diff":
      if (typeof message.requestId !== "string") return;
      if (!isGitRevision(message.base) || !isGitRevision(message.target)) return;
      handleGitFileDiff(socket, message.base, message.target, message.requestId).catch(reportError);
      break;
    case "set_credential":
      if (!validProviderId(message.provider) || typeof message.apiKey !== "string" || message.apiKey.trim() === "") return;
      handleSetCredential(socket, message.provider, message.apiKey).catch(reportError);
      break;
    case "declare_provider":
      if (!validProviderId(message.provider) || !validBaseUrl(message.baseUrl)) return;
      if (typeof message.apiKey !== "string" || message.apiKey.trim() === "") return;
      if (!Array.isArray(message.models) || message.models.length === 0) return;
      handleDeclareProvider(socket, {
        provider: message.provider,
        baseUrl: message.baseUrl,
        apiKey: message.apiKey,
        models: message.models,
        ...(message.compat ? { compat: message.compat } : {}),
      }).catch(reportError);
      break;
    case "browse_server_directory":
      if (typeof message.path !== "string" || typeof message.requestId !== "string") return;
      handleBrowseServerDirectory(socket, message.path, message.requestId).catch(reportError);
      break;
    case "update_config": {
      if (message.sandbox !== undefined) {
        if (
          typeof message.sandbox.root !== "string" ||
          typeof message.sandbox.allowWrite !== "boolean" ||
          typeof message.sandbox.allowBash !== "boolean" ||
          (message.sandbox.writableRoot !== undefined && typeof message.sandbox.writableRoot !== "string")
        ) {
          send(socket, { type: "error", message: "Invalid sandbox config" });
          return;
        }
      }
      if (message.userSkillPaths !== undefined) {
        if (!Array.isArray(message.userSkillPaths) || message.userSkillPaths.some((p) => typeof p !== "string" || p.trim() === "")) {
          send(socket, { type: "error", message: "Invalid skill paths" });
          return;
        }
      }
      if (message.sandbox === undefined && message.userSkillPaths === undefined) {
        send(socket, { type: "error", message: "Nothing to update" });
        return;
      }
      handleUpdateConfig(socket, {
        ...(message.sandbox ? { sandbox: message.sandbox } : {}),
        ...(message.userSkillPaths ? { userSkillPaths: message.userSkillPaths } : {}),
      }).catch(reportError);
      break;
    }
  }
}

// --- Wire up the real /ws and /health handlers, now that the runtime is ready ------

handleWsConnection = (socket) => {
  clients.add(socket);
  send(socket, { type: "hello", ...snapshot() });
  socket.on("message", (data: Buffer) => handleClientMessage(socket, data.toString()));
  socket.on("close", () => {
    clients.delete(socket);
    // Nobody left to answer a dialog. An extension blocked on one holds its command
    // open, and for `prompt` that command's timeout is deliberately suspended while
    // a dialog is up — so without this the child waits on a question no one can see,
    // with no watchdog left to end it, and the way out (a new session) is itself a
    // command to the blocked child.
    if (clients.size === 0) runtime.cancelPendingExtensionRequests();
  });
};
// A failed runtime reports unready: /health answers 503 and the operator's probe
// sees the process is no longer serving an agent, even though HTTP still answers.
getHealth = () => (runtime.ok ? { ok: true, sessionId: runtime.snapshot().sessionId } : { ok: false });

console.log(`[pi] session ${runtime.snapshot().sessionId}`);
console.log(`[pi] agent runtime ${runtime.kind}`);
console.log(`[pi] model ${modelName()} · cwd ${AGENT_CWD} · agentDir ${AGENT_DIR}`);
const runtimeTools = runtime.snapshot().tools;
if (runtimeTools) {
  console.log(`[pi] tools active: ${runtimeTools.filter((tool) => tool.active).map((tool) => tool.name).join(", ") || "(none)"}`);
  console.log(`[pi] tools inactive: ${runtimeTools.filter((tool) => !tool.active).map((tool) => tool.name).join(", ") || "(none)"}`);
}
const runtimeSkills = runtime.snapshot().commands.filter((command) => command.source === "skill").map((command) => command.name);
console.log(`[pi] skills: ${runtimeSkills.join(", ") || "(none)"}`);
if (config.sandbox) {
  const extras = [
    config.sandbox.allowWrite ? "write" : "read-only",
    ...(config.sandbox.allowBash ? ["bash (UNCONFINED)"] : []),
  ].join(", ");
  console.log(`[pi] sandbox ${config.sandbox.root} · ${extras}`);
}
console.log(`[pi] file browser root ${BROWSER_ROOT}`);
// Worth a line: it changes where models come from, and its absence is what makes
// credential changes hang for 20 s on a host that cannot reach the catalogs.
if (config.offline) console.log("[pi] offline — model catalogs are not fetched");
// The old warning ("No models available") named neither the cause nor a way out, and
// the failure only surfaced on the user's first message. Say it at startup, name the
// directory the credentials are missing from, and point at both ways to supply them.
if (!credentialStatus().usableModel) {
  const configured = credentialStatus().providers.some((provider) => provider.configured);
  console.warn(
    configured
      ? `[pi] no model available — providers are configured, but "allowedModels" leaves nothing to choose from`
      : `[pi] no credentials in ${AGENT_DIR} — open the UI to set one up, or run "pi-outpost login --provider <name>" (provider environment variables work too)`,
  );
}

// --- Shutdown -------------------------------------------------------------------------

async function shutdown(): Promise<void> {
  await runtime.dispose();
  await app.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
