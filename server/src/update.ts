/**
 * Finding out that a newer pi-outpost exists, and moving to it.
 *
 * The whole difficulty is that "update" means four different things depending on
 * how the running copy was installed, and getting it wrong is worse than doing
 * nothing: `npm install -g` from a source checkout installs a *second* copy
 * somewhere else and leaves the running one untouched, while reporting success.
 * So the channel is inferred from evidence, and an installation that matches
 * nothing is refused rather than guessed at.
 *
 * Detection is a pure function over evidence the caller gathers, so every branch
 * is testable without a global install, an npx cache, or a compiled binary.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** How the running copy was installed, which decides what upgrading it means. */
export type InstallChannel =
  /** A source checkout: the version was never replaced at build time. */
  | "checkout"
  /** A one-off runner (npx and friends) that fetches on every invocation. */
  | "ephemeral"
  /** A globally installed package — the one case worth automating. */
  | "global"
  /** A single-file executable with the runtime baked in. */
  | "executable"
  /** Evidence that matches none of the above. Refuse; do not guess. */
  | "unknown";

/** What detection looks at. Gathered by the caller so the rule itself stays pure. */
export interface ChannelEvidence {
  /** Build-time version, or "dev" when it was never substituted. */
  version: string;
  /** `process.argv[1]` — the script node was asked to run, absent in a SEA. */
  entryPath: string | undefined;
  /** `process.execPath` — node itself, or the self-contained binary. */
  execPath: string;
  /** Whether the runtime reports being a single-file executable. */
  isSea: boolean;
  /**
   * npm's global `node_modules`, when it can be discovered.
   *
   * Without it a `node_modules` path cannot be told from a project's own dependency
   * tree, and the safe answer is "unknown" — refuse and print the evidence — rather
   * than a guess that installs into the wrong place.
   */
  globalRoot?: string;
}

/** Path segments that mark a one-off runner's cache, on every platform. */
const EPHEMERAL_SEGMENTS = ["_npx", ".npx"];

const segments = (pathname: string): string[] => pathname.split(/[\\/]/);

/**
 * Which installation the running process belongs to.
 *
 * Order matters and is deliberate — first match wins:
 *
 * 1. **checkout**, from the version alone. A working tree has no published
 *    version to be behind, and this is the one signal no path can fake.
 * 2. **executable**, because a SEA has no script entry to reason about.
 * 3. **ephemeral**, before `global`: an npx cache *is* a `node_modules` tree, so
 *    testing for `node_modules` first would call every npx run a global install
 *    and try to upgrade it.
 * 4. **global**, the remaining published-and-installed case.
 *
 * `npm_config_global` is deliberately not consulted. It describes the npm
 * invocation that started the process — absent when the binary is run directly,
 * and present when some wrapper script happens to set it.
 */
export function detectChannel(evidence: ChannelEvidence): InstallChannel {
  if (evidence.version === "dev") return "checkout";
  if (evidence.isSea) return "executable";

  const entry = evidence.entryPath;
  if (entry === undefined || entry === "") return "unknown";

  const parts = segments(entry);
  if (parts.some((part) => EPHEMERAL_SEGMENTS.includes(part))) return "ephemeral";
  // `node_modules` alone is not a global install — it is also every project that
  // depends on pi-outpost, and `./node_modules/.bin/pi-outpost` reaches here. Calling
  // that global would make `update` run `npm install -g`, which upgrades or creates a
  // *different* copy somewhere else and reports success for the local one still
  // running. That is precisely the failure the channel exists to prevent, so the
  // global root has to be known rather than assumed.
  if (parts.includes("node_modules")) {
    const root = evidence.globalRoot;
    if (root === undefined || root === "") return "unknown";
    return isInside(entry, root) ? "global" : "unknown";
  }
  return "unknown";
}

/** Path containment, case-insensitively on the platforms that need it. */
function isInside(child: string, parent: string): boolean {
  const normalise = (value: string) => {
    const trimmed = value.replace(/[\\/]+$/, "");
    return process.platform === "win32" ? trimmed.toLowerCase().replace(/\//g, "\\") : trimmed;
  };
  const a = normalise(child);
  const b = normalise(parent);
  return a === b || a.startsWith(b + (process.platform === "win32" ? "\\" : "/"));
}

// --- what the registry says ---------------------------------------------------

/** The package this binary is published as. */
export const PACKAGE_NAME = "pi-outpost";

/**
 * Where a standalone executable comes from now.
 *
 * It used to be "rebuild it yourself, see docs" — true when no binary was
 * distributed. Releases carry one per platform since ship-standalone-executables,
 * so the refusal can point at a download instead of a build procedure.
 */
export const RELEASES_URL = "https://github.com/laurentftech/pi-outpost/releases";

/** Where packages come from when nothing on the host says otherwise. */
export const PUBLIC_REGISTRY = "https://registry.npmjs.org";

/**
 * Which registry to ask.
 *
 * Hardcoding the public one breaks the deployment that needs update checking
 * most: air-gapped from the wider internet, reaching npm through an internal
 * proxy. npm already knows that address, so it is asked before anything is
 * assumed. Order: pi-outpost's own setting, the variable npm exports to scripts
 * it runs, npm's stored configuration, then the public default.
 *
 * `npm config get registry` is last because it costs a child process, and this
 * runs on a path that must not delay startup — it is consulted only when the
 * environment did not already answer.
 *
 * The install path needs none of this: `npm install` reads the same
 * configuration itself, and telling it a registry we resolved would be one more
 * way to disagree with npm.
 */
export function resolveRegistry(configured?: string): string {
  const fromConfig = configured?.trim();
  if (fromConfig) return trimSlash(fromConfig);

  const fromEnv = process.env.npm_config_registry?.trim();
  if (fromEnv) return trimSlash(fromEnv);

  const fromNpm = npmConfiguredRegistry();
  if (fromNpm) return trimSlash(fromNpm);

  return PUBLIC_REGISTRY;
}

const trimSlash = (url: string): string => url.replace(/\/+$/, "");

/** npm's stored registry, or nothing if npm is absent or slow to answer. */
function npmConfiguredRegistry(): string | undefined {
  try {
    // `getBuiltinModule` rather than `require`, which does not exist in an ES
    // module, and rather than a dynamic import, which cannot be awaited here.
    const { execFileSync } = process.getBuiltinModule("node:child_process");
    const npm = process.env.npm_execpath;
    const [command, argv] = npm ? [process.execPath, [npm]] : ["npm", []];
    const out = execFileSync(command, [...argv, "config", "get", "registry"], {
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
      shell: false,
    }).trim();
    // npm prints "undefined" rather than nothing when a key is unset.
    return out && out !== "undefined" && out !== "null" ? out : undefined;
  } catch {
    return undefined;
  }
}

/** Long enough for a slow link, short enough that `update --check` stays a command. */
export const REGISTRY_TIMEOUT_MS = 10_000;

/**
 * Three answers, and the third is the one that matters.
 *
 * "could not check" must never collapse into "current": an operator who is told
 * they are up to date because a proxy ate the request has been told something
 * false, and will not ask again.
 */
export type VersionCheck =
  | { status: "newer"; running: string; latest: string }
  | { status: "current"; running: string; latest: string }
  /**
   * The registry answered, and the running version is not on the same scale — a
   * checkout's `"dev"`, or any scheme this does not parse. Separate from "current"
   * for the reason "failed" is: answering "you are the newest published version" to
   * a working tree is false, and it is the answer that stops someone looking.
   */
  | { status: "incomparable"; running: string; latest: string }
  | { status: "failed"; running: string; reason: string };

/**
 * What a registry answer has to look like, and the whole of what is asked of it.
 *
 * Narrower than `fetch` on purpose: this is the seam tests replace, and a seam the
 * shape of the standard API would invite the rest of that API to be relied on. It is
 * also what lets the real request be an `https.request` rather than a `fetch` — see
 * `registryRequest` for why it has to be.
 */
export interface RegistryResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

export type RegistryFetch = (url: string, options: { signal: AbortSignal }) => Promise<RegistryResponse>;

/**
 * One GET, with a socket that cannot hold the process open.
 *
 * `fetch` would be the obvious way to write this and it cannot satisfy the contract:
 * it exposes no handle to `unref`, so a request still in flight keeps the event loop
 * alive until it settles. For a check nobody asked for, running in the background,
 * that turns "stop the server" into "wait out the registry timeout" — and it is
 * invisible against a registry that refuses fast, which is every registry until the
 * one that hangs.
 *
 * So the request is made through `node:https` and its socket is unref'd. No new
 * dependency either way; what changes is that there is something to unref.
 */
const registryRequest: RegistryFetch = async (url, options) => {
  const target = new URL(url);
  const transport = target.protocol === "http:"
    ? await import("node:http")
    : await import("node:https");

  return await new Promise<RegistryResponse>((resolve, reject) => {
    const request = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: "GET",
        headers: { accept: "application/json" },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            json: async () => JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown,
          });
        });
        // The response body is a handle too, and it arrives after the socket one.
        response.socket?.unref();
      },
    );
    // The reason this function exists. `socket` fires once the connection is assigned,
    // which is the earliest point there is anything to unref.
    request.on("socket", (socket) => socket.unref());
    request.on("error", reject);
    options.signal.addEventListener("abort", () => request.destroy(new Error("aborted")), { once: true });
    request.end();
  });
};

/**
 * Ask the registry for the newest published version.
 *
 * Exactly one field is taken from the answer. Nothing from the response is
 * executed, interpolated into a command, or trusted beyond a string comparison —
 * the install path names `@latest` rather than anything fetched, so a hostile
 * answer cannot choose what gets installed.
 */
export async function fetchLatestVersion(
  running: string,
  options: { fetchImpl?: RegistryFetch; timeoutMs?: number; registry?: string } = {},
): Promise<VersionCheck> {
  const doFetch = options.fetchImpl ?? registryRequest;
  const registry = resolveRegistry(options.registry);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? REGISTRY_TIMEOUT_MS);
  // The timer is unref'd for the same reason the socket is: neither may be why a
  // process that wants to exit does not.
  timer.unref?.();
  try {
    const response = await doFetch(`${registry}/${PACKAGE_NAME}/latest`, { signal: controller.signal });
    if (!response.ok) return { status: "failed", running, reason: `the registry answered ${response.status}` };
    const body: unknown = await response.json();
    const latest = (body as { version?: unknown } | null)?.version;
    if (typeof latest !== "string" || latest === "") {
      return { status: "failed", running, reason: "the registry answered without a version" };
    }
    if (isNewer(latest, running)) return { status: "newer", running, latest };
    // "not newer" is three different facts, and only one of them is "up to date".
    // A version this cannot parse was never compared at all.
    if (!isComparableVersion(running)) return { status: "incomparable", running, latest };
    return { status: "current", running, latest };
  } catch (error) {
    const reason = controller.signal.aborted
      ? `no answer within ${options.timeoutMs ?? REGISTRY_TIMEOUT_MS} ms`
      : error instanceof Error
        ? error.message
        : String(error);
    return { status: "failed", running, reason };
  } finally {
    clearTimeout(timer);
  }
}

// --- the command ---------------------------------------------------------------

/**
 * Everything here goes through the package registry, never a code-hosting site.
 *
 * That is not only tidiness: the deployment that needs update checking most is
 * air-gapped from the wider internet and reaches npm through an internal proxy.
 * A version read from a release page, or an upgrade that told the operator to
 * download one, would be unreachable exactly there.
 *
 * The self-contained executable is built from the published package rather than
 * downloaded (see docs/sea-packaging.md — no binary is distributed), so its
 * refusal names that, not a URL.
 */

/**
 * Should this host look for a newer version at all?
 *
 * `offline` is a default, not a veto. Air-gapped from model catalogs while
 * reaching npm through an internal proxy is a real deployment, and the rule that
 * conflated the two networks forbade checking on exactly the host that most
 * needs it: isolated, updated by hand, rarely.
 */
export function updateCheckEnabled(settings: { updateCheck?: boolean; offline?: boolean }): boolean {
  return settings.updateCheck ?? !settings.offline;
}

/** Which setting is standing in the way, for a message that can be acted on. */
export function whyCheckingDisabled(settings: { updateCheck?: boolean; offline?: boolean }): string {
  return settings.updateCheck === false ? `"updateCheck" is false` : `"offline" is set and "updateCheck" is not enabled`;
}

export interface UpdateCommandOptions {
  version: string;
  /** True for `--check`: report and touch nothing. */
  checkOnly: boolean;
  /** Configuration already said no network — refuse rather than hang. */
  checkingDisabled?: boolean;
  /** Which setting did that, so the refusal can be acted on. */
  disabledReason?: string;
  channel?: InstallChannel;
  fetchImpl?: RegistryFetch;
  registry?: string;
  /** Runs the installer. Injected so a test never installs anything. */
  install?: (command: string, args: string[]) => Promise<number>;
  log?: (line: string) => void;
}

/** What the process should exit with. Zero only when there is nothing wrong. */
export async function runUpdateCommand(options: UpdateCommandOptions): Promise<number> {
  const say = options.log ?? ((line: string) => console.log(line));
  const channel = options.channel ?? detectChannel(currentEvidence(options.version));

  if (options.checkingDisabled) {
    // Asked directly, so silence would be a lie: say which setting is in the way.
    say(`[pi] update checking is disabled: ${options.disabledReason ?? "configuration"}`);
    return 1;
  }

  const check = await fetchLatestVersion(options.version, {
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.registry ? { registry: options.registry } : {}),
  });

  if (check.status === "failed") {
    // Never "you are up to date" — the check did not happen.
    say(`[pi] could not check for updates: ${check.reason}`);
    return 1;
  }

  // Report first, whatever happens next: the versions are the answer to --check,
  // and the context for a refusal.
  switch (check.status) {
    case "current":
      say(`[pi] pi-outpost ${check.running} is the newest published version`);
      break;
    case "newer":
      say(`[pi] pi-outpost ${check.running} is installed; ${check.latest} is available`);
      break;
    case "incomparable":
      // Not "you are current": this copy has no published version to be behind.
      say(`[pi] this copy reports version "${check.running}", which is not a published one`);
      say(`[pi]   the newest published version is ${check.latest}`);
      break;
  }

  if (options.checkOnly) return 0;

  // The channel decides before the version does. An installation this command cannot
  // upgrade cannot be upgraded whether or not something newer exists, and finding
  // that out only in the release where a newer version happens to exist is how the
  // refusal goes untested and then untrue. A checkout is the case that made this
  // obvious: its version never compares as newer, so the refusal sat unreachable.
  switch (channel) {
    case "checkout":
      say(`[pi] this copy is a source checkout, not an installed package — update it with "git pull"`);
      return 1;
    case "ephemeral":
      say(`[pi] this copy runs from a one-off cache: your next "npx ${PACKAGE_NAME}" already fetches the newest version`);
      return 1;
    case "executable":
      say(`[pi] this copy is a self-contained executable and will not replace itself`);
      say(`[pi]   download a newer build from ${RELEASES_URL}, or rebuild it from ${PACKAGE_NAME}@latest`);
      return 1;
    case "unknown":
      say(`[pi] cannot tell how this copy was installed, so nothing was changed`);
      say(`[pi]   entry: ${process.argv[1] ?? "(none)"}`);
      say(`[pi]   runtime: ${process.execPath}`);
      return 1;
    case "global": {
      if (check.status !== "newer") {
        // Nothing to do, and saying so beats running an installer to no effect.
        say(`[pi] nothing to install`);
        return 0;
      }
      // `@latest`, never a string from the registry: a hostile answer cannot
      // choose what gets installed. An argv vector, never a shell string.
      //
      // `--registry` only when pi-outpost's own setting overrode npm's. Left off,
      // npm reads its own configuration and restating it would be one more way to
      // disagree with it — which is the whole reason the bare command is the default.
      // But when the override is set, npm has *not* been told about that registry:
      // the check would query the internal proxy and the install would then fetch
      // from the public one, announcing a private update and performing a different
      // one. Exactly the deployment the setting exists for.
      const args = [
        "install",
        "-g",
        ...(options.registry !== undefined ? ["--registry", options.registry] : []),
        `${PACKAGE_NAME}@latest`,
      ];
      say(`[pi] running: npm ${args.join(" ")}`);
      const run = options.install ?? runInstaller;
      const code = await run("npm", args);
      if (code !== 0) {
        say(`[pi] the installer exited with ${code}; nothing was changed by pi-outpost itself`);
        return code;
      }
      say(`[pi] installed pi-outpost ${check.latest} — restart the server to run it`);
      return 0;
    }
  }
}

/** The installer as a child process: argv vector, no shell, output passed through. */
async function runInstaller(command: string, args: string[]): Promise<number> {
  const { spawn } = await import("node:child_process");
  return await new Promise<number>((resolve) => {
    const child = spawn(command, args, { stdio: "inherit", shell: false });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

// --- remembering the answer ---------------------------------------------------

/** A day: often enough to be useful, rare enough not to be chatter. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** What was seen, and when. Deliberately the smallest thing that answers both. */
export interface UpdateCache {
  latest: string;
  checkedAt: number;
}

/**
 * In `agentDir`, not the workspace: the workspace belongs to the agent and may be
 * sandboxed read-only, while `agentDir` is already pi-outpost's own state.
 */
export const cachePath = (agentDir: string): string => path.join(agentDir, "update-check.json");

/**
 * Where the agent directory is when the configuration does not name one.
 *
 * The SDK applies this same default internally, so the cache would otherwise land
 * beside a different directory than the sessions it belongs with.
 */
export const defaultAgentDir = (): string => path.join(os.homedir(), ".pi", "agent");

/**
 * The remembered answer, or nothing.
 *
 * Every failure — absent, unreadable, truncated, a shape from a future version —
 * is "nothing". This is an optimisation, never a source of truth, so a corrupt
 * file must cost one extra request rather than a startup error.
 */
export async function readCache(agentDir: string): Promise<UpdateCache | undefined> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(cachePath(agentDir), "utf8"));
    const cache = parsed as Partial<UpdateCache> | null;
    if (typeof cache?.latest !== "string" || typeof cache.checkedAt !== "number") return undefined;
    if (!Number.isFinite(cache.checkedAt)) return undefined;
    return { latest: cache.latest, checkedAt: cache.checkedAt };
  } catch {
    return undefined;
  }
}

/** Best effort: failing to remember an answer is not worth failing a startup over. */
export async function writeCache(agentDir: string, cache: UpdateCache): Promise<void> {
  try {
    await fs.mkdir(agentDir, { recursive: true });
    await fs.writeFile(cachePath(agentDir), `${JSON.stringify(cache)}\n`);
  } catch {
    // Nothing to do and nobody to tell: the next start simply asks again.
  }
}

/** Is a remembered answer still worth using? A clock that moved backwards is not. */
export function isFresh(cache: UpdateCache, now = Date.now(), intervalMs = CHECK_INTERVAL_MS): boolean {
  const age = now - cache.checkedAt;
  return age >= 0 && age < intervalMs;
}

/**
 * Is `candidate` a later release than `running`?
 *
 * Not `!==`: a version *ahead* of the registry is not out of date. That happens
 * to anyone running a build made between a tag and its publish, and telling them
 * to "upgrade" to something older is both wrong and confusing.
 *
 * Numeric on the three release fields, and a prerelease loses to the release it
 * qualifies (1.2.0-rc.1 is older than 1.2.0) — enough for the one question asked
 * here, and no dependency for it. An unparseable version compares as not newer,
 * so a version scheme this does not understand stays quiet instead of nagging.
 */
/** Whether a version string is on the scale `isNewer` compares — `"dev"` is not. */
export function isComparableVersion(value: string): boolean {
  return /^\d+\.\d+\.\d+(?:-.+)?$/.test(value.trim());
}

export function isNewer(candidate: string, running: string): boolean {
  const parse = (value: string) => /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(value.trim());
  const a = parse(candidate);
  const b = parse(running);
  if (a === null || b === null) return false;
  for (let field = 1; field <= 3; field++) {
    const left = Number(a[field]);
    const right = Number(b[field]);
    if (left !== right) return left > right;
  }
  // Same release numbers: a prerelease is older than the plain release it qualifies.
  const preA = a[4];
  const preB = b[4];
  if (preA === preB) return false;
  if (preA === undefined) return true;
  if (preB === undefined) return false;
  return comparePrerelease(preA, preB) > 0;
}

/**
 * SemVer precedence for two prerelease tags, compared identifier by identifier.
 *
 * Lexical comparison of the whole tag is the obvious shortcut and it is wrong at
 * exactly the point releases reach double digits: `"rc.10" < "rc.2"` as text, so
 * rc.10 read as older than rc.2 and an operator on rc.2 was told they were current.
 *
 * So each dot-separated identifier is compared on its own, and two numeric ones
 * numerically. A numeric identifier ranks below an alphanumeric one, and a tag that
 * runs out of identifiers first ranks below the longer one that shares its prefix
 * (`rc.1` before `rc.1.1`) — both straight from the spec.
 */
function comparePrerelease(left: string, right: string): number {
  const a = left.split(".");
  const b = right.split(".");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNumeric = /^\d+$/.test(x);
    const yNumeric = /^\d+$/.test(y);
    if (xNumeric && yNumeric) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return diff > 0 ? 1 : -1;
      continue;
    }
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/** The evidence of the process running right now. */
export function currentEvidence(version: string): ChannelEvidence {
  return {
    version,
    entryPath: process.argv[1],
    execPath: process.execPath,
    isSea: runningAsExecutable(),
    ...(globalNodeModules() !== undefined ? { globalRoot: globalNodeModules() } : {}),
  };
}

/**
 * npm's global `node_modules`, or nothing.
 *
 * Asked of npm rather than derived from a layout, because the layout differs by
 * platform and by installer — `<prefix>/lib/node_modules` on unix, `<prefix>/node_modules`
 * on Windows, and somewhere else again under a version manager. The variable npm
 * exports to scripts it runs is preferred; the child process is the fallback.
 *
 * Nothing is not a failure: it makes a `node_modules` path "unknown", which refuses
 * and prints what it saw. That is the right answer when the alternative is installing
 * into a directory this process only guessed at.
 */
function globalNodeModules(): string | undefined {
  const prefix = process.env.npm_config_prefix?.trim();
  if (prefix) return path.join(prefix, process.platform === "win32" ? "" : "lib", "node_modules");
  try {
    const { execFileSync } = process.getBuiltinModule("node:child_process");
    const npm = process.env.npm_execpath;
    const [command, argv] = npm ? [process.execPath, [npm]] : ["npm", []];
    const out = execFileSync(command, [...argv, "root", "-g"], {
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
      shell: false,
    }).trim();
    return out && out !== "undefined" ? out : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `node:sea` answers this authoritatively and only inside a built binary. Every
 * failure mode — an older runtime without the module, a build that stripped it —
 * means "not a single-file executable", which is the safe answer: it leads to
 * ordinary path-based detection rather than to a refusal.
 */
function runningAsExecutable(): boolean {
  try {
    const sea = process.getBuiltinModule?.("node:sea") as { isSea?: () => boolean } | undefined;
    return sea?.isSea?.() === true;
  } catch {
    return false;
  }
}

// --- the notice at startup ------------------------------------------------------

export interface StartupNoticeOptions {
  version: string;
  /** Unset when the configuration names none: the SDK's own default is used. */
  agentDir?: string;
  /** The tri-state key and `offline`, exactly as loaded. */
  settings: { updateCheck?: boolean; offline?: boolean };
  registry?: string;
  channel?: InstallChannel;
  fetchImpl?: RegistryFetch;
  now?: number;
  log?: (line: string) => void;
}

/**
 * Whether the startup check should reach the registry at all.
 *
 * Separate from the request so the whole rule is testable without a network, and so
 * the reasons stay legible next to each other rather than nested inside the caller.
 *
 * A checkout is refused here and not by the settings: a working tree has no
 * published version to be behind, so comparing it produces a notice that can only be
 * noise — and it would be noise on every start, for every developer.
 */
export function shouldCheckAtStartup(options: {
  settings: { updateCheck?: boolean; offline?: boolean };
  channel: InstallChannel;
}): boolean {
  if (!updateCheckEnabled(options.settings)) return false;
  return options.channel !== "checkout";
}

/**
 * Tell the operator a newer version exists, without ever being in their way.
 *
 * Three separate properties, and only the third is easy to lose:
 *
 * 1. **Ordering** — the caller invokes this after `listen`, so nothing here runs
 *    before the server answers.
 * 2. **Non-blocking** — nothing is awaited on the startup path. The returned promise
 *    is for tests to settle on; production drops it.
 * 3. **Not holding the process open** — both the request's socket and its timeout are
 *    `unref`'d, so a check still in flight is never the reason a process that wants
 *    to exit does not. This is the one that only shows up against a registry that
 *    hangs rather than refuses, which is why the request is not a `fetch`.
 *
 * Silent when current and silent on failure: the operator did not ask, so an error
 * about a background nicety is noise. `update --check` is where the same event is
 * loud, because there they did ask.
 */
export async function runStartupUpdateNotice(options: StartupNoticeOptions): Promise<void> {
  const say = options.log ?? ((line: string) => console.log(line));
  const now = options.now ?? Date.now();
  const channel = options.channel ?? detectChannel(currentEvidence(options.version));

  if (!shouldCheckAtStartup({ settings: options.settings, channel })) return;

  // A cached answer inside the interval is used as-is: repeated restarts are the
  // normal way to run this, and each one asking the registry again is the difference
  // between a nicety and a nuisance.
  const agentDir = options.agentDir ?? defaultAgentDir();
  const cached = await readCache(agentDir);
  if (cached !== undefined && isFresh(cached, now)) {
    if (isNewer(cached.latest, options.version)) announce(say, options.version, cached.latest);
    return;
  }

  const check = await fetchLatestVersion(options.version, {
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.registry ? { registry: options.registry } : {}),
  });
  // Silent on failure, and nothing cached: a failed check must not become a
  // remembered answer that suppresses the next real one.
  if (check.status === "failed") return;

  await writeCache(agentDir, { latest: check.latest, checkedAt: now });
  if (check.status === "newer") announce(say, check.running, check.latest);
}

function announce(say: (line: string) => void, running: string, latest: string): void {
  say(`[pi] pi-outpost ${latest} is available (running ${running}) — "pi-outpost update" to move to it`);
}
