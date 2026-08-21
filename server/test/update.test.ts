/**
 * Knowing which installation is running, and what the registry says about it.
 *
 * The detection rules are worth testing precisely because getting them wrong is
 * silent: an npx run mistaken for a global install would "upgrade" a cache
 * directory and report success, and a checkout mistaken for a package would
 * install a second copy elsewhere while the operator keeps running the first.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import {
  CHECK_INTERVAL_MS,
  cachePath,
  detectChannel,
  fetchLatestVersion,
  isFresh,
  isNewer,
  readCache,
  resolveRegistry,
  writeCache,
  type ChannelEvidence,
} from "../src/update.ts";

const roots: string[] = [];
after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "pi-outpost-update-"));
  roots.push(root);
  return root;
}

const evidence = (over: Partial<ChannelEvidence> = {}): ChannelEvidence => ({
  version: "0.8.0",
  entryPath: "/usr/local/lib/node_modules/pi-outpost/dist/pi-outpost.mjs",
  execPath: "/usr/local/bin/node",
  isSea: false,
  ...over,
});

describe("detectChannel", () => {
  test("a build-time version that was never substituted means a checkout", () => {
    // The one signal no path can fake, which is why it is consulted first.
    assert.equal(detectChannel(evidence({ version: "dev" })), "checkout");
  });

  test("a checkout stays a checkout even from inside node_modules", () => {
    assert.equal(detectChannel(evidence({ version: "dev", entryPath: "/repo/node_modules/.bin/pi-outpost" })), "checkout");
  });

  test("a single-file executable is recognised before any path reasoning", () => {
    // A SEA has no script entry to reason about at all.
    assert.equal(detectChannel(evidence({ isSea: true, entryPath: undefined, execPath: "/opt/pi-outpost" })), "executable");
  });

  test("a global install is the ordinary published case", () => {
    assert.equal(detectChannel(evidence()), "global");
  });

  /**
   * An npx cache *is* a node_modules tree. Testing for node_modules first would
   * call every npx run a global install and try to upgrade a cache directory.
   */
  test("an npx cache is ephemeral, not global, though it contains node_modules", () => {
    const entryPath = "/Users/someone/.npm/_npx/8f3a/node_modules/pi-outpost/dist/pi-outpost.mjs";
    assert.equal(detectChannel(evidence({ entryPath })), "ephemeral");
  });

  test("the same holds on a Windows path", () => {
    const entryPath = "C:\\Users\\someone\\AppData\\Local\\npm-cache\\_npx\\8f3a\\node_modules\\pi-outpost\\dist\\pi-outpost.mjs";
    assert.equal(detectChannel(evidence({ entryPath })), "ephemeral");
  });

  test("a published copy outside any node_modules is not guessed at", () => {
    assert.equal(detectChannel(evidence({ entryPath: "/home/someone/bin/pi-outpost.mjs" })), "unknown");
  });

  test("no entry path at all, and not a SEA, is unknown rather than a guess", () => {
    assert.equal(detectChannel(evidence({ entryPath: undefined })), "unknown");
  });
});

describe("isNewer", () => {
  test("orders the three release fields numerically, not as text", () => {
    // "0.10.0" < "0.9.0" as strings, which is the classic way to get this wrong.
    assert.equal(isNewer("0.10.0", "0.9.0"), true);
    assert.equal(isNewer("0.9.0", "0.10.0"), false);
  });

  test("an identical version is not newer", () => {
    assert.equal(isNewer("0.8.0", "0.8.0"), false);
  });

  /** Running a build made between a tag and its publish must not be told to downgrade. */
  test("a version ahead of the registry is not out of date", () => {
    assert.equal(isNewer("0.8.0", "0.9.0"), false);
  });

  test("a prerelease is older than the release it qualifies", () => {
    assert.equal(isNewer("1.2.0", "1.2.0-rc.1"), true);
    assert.equal(isNewer("1.2.0-rc.1", "1.2.0"), false);
  });

  test("a version scheme it cannot parse stays quiet rather than nagging", () => {
    assert.equal(isNewer("latest", "0.8.0"), false);
    assert.equal(isNewer("1.0", "0.8.0"), false);
  });
});

describe("fetchLatestVersion", () => {
  const respond = (body: unknown, ok = true, status = 200): typeof fetch =>
    (async () => ({ ok, status, json: async () => body })) as unknown as typeof fetch;

  test("reports a newer version with both numbers", async () => {
    const result = await fetchLatestVersion("0.8.0", { fetchImpl: respond({ version: "0.9.0" }) });
    assert.deepEqual(result, { status: "newer", running: "0.8.0", latest: "0.9.0" });
  });

  test("reports current when the registry has nothing later", async () => {
    const result = await fetchLatestVersion("0.9.0", { fetchImpl: respond({ version: "0.9.0" }) });
    assert.equal(result.status, "current");
  });

  test("asks for exactly one package's latest, and reads only its version", async () => {
    let asked = "";
    const spy = (async (url: string) => {
      asked = String(url);
      // Everything else in a registry document is ignored on purpose.
      return { ok: true, status: 200, json: async () => ({ version: "0.9.0", scripts: { postinstall: "rm -rf /" } }) };
    }) as unknown as typeof fetch;
    const result = await fetchLatestVersion("0.8.0", { fetchImpl: spy, registry: "https://registry.example" });
    assert.equal(asked, "https://registry.example/pi-outpost/latest");
    assert.equal(result.status, "newer");
  });

  /** The whole point of the third state: a failed check is not "you are current". */
  test("a transport error is a failure, not a verdict", async () => {
    const boom = (async () => {
      throw new Error("getaddrinfo ENOTFOUND registry.npmjs.org");
    }) as unknown as typeof fetch;
    const result = await fetchLatestVersion("0.8.0", { fetchImpl: boom });
    assert.equal(result.status, "failed");
    assert.match(result.status === "failed" ? result.reason : "", /ENOTFOUND/);
  });

  test("a non-OK response is a failure naming the status", async () => {
    const result = await fetchLatestVersion("0.8.0", { fetchImpl: respond({}, false, 503) });
    assert.equal(result.status, "failed");
    assert.match(result.status === "failed" ? result.reason : "", /503/);
  });

  test("an answer without a version is a failure, not a comparison against undefined", async () => {
    const result = await fetchLatestVersion("0.8.0", { fetchImpl: respond({ name: "pi-outpost" }) });
    assert.equal(result.status, "failed");
  });

  test("a registry that never answers is bounded", async () => {
    const never = ((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as unknown as typeof fetch;
    const started = Date.now();
    const result = await fetchLatestVersion("0.8.0", { fetchImpl: never, timeoutMs: 50 });
    assert.equal(result.status, "failed");
    assert.ok(Date.now() - started < 2_000, "the request must not outlive its timeout");
  });
});

/**
 * The deployment that needs update checking most is air-gapped from the public
 * internet and reaches npm through an internal proxy. Hardcoding
 * registry.npmjs.org would make the feature useless exactly there.
 */
describe("resolveRegistry", () => {
  const withEnv = async (value: string | undefined, body: () => void | Promise<void>) => {
    const had = Object.hasOwn(process.env, "npm_config_registry");
    const previous = process.env.npm_config_registry;
    if (value === undefined) delete process.env.npm_config_registry;
    else process.env.npm_config_registry = value;
    try {
      await body();
    } finally {
      if (had) process.env.npm_config_registry = previous;
      else delete process.env.npm_config_registry;
    }
  };

  test("pi-outpost's own setting wins over everything", async () => {
    await withEnv("https://from-env.example", () => {
      assert.equal(resolveRegistry("https://nexus.internal/repository/npm"), "https://nexus.internal/repository/npm");
    });
  });

  test("npm's exported variable is used when nothing is configured", async () => {
    await withEnv("https://nexus.internal/repository/npm/", () => {
      assert.equal(resolveRegistry(), "https://nexus.internal/repository/npm");
    });
  });

  test("a trailing slash is trimmed, so the path join cannot double it", async () => {
    await withEnv(undefined, () => {
      assert.equal(resolveRegistry("https://nexus.internal/npm///"), "https://nexus.internal/npm");
    });
  });

  test("blank settings do not count as an answer", async () => {
    await withEnv("   ", () => {
      // Falls through to npm's stored config or the public default — either is a
      // real registry, which "" is not.
      assert.notEqual(resolveRegistry("  "), "");
      assert.match(resolveRegistry("  "), /^https?:\/\//);
    });
  });

  test("the public registry is the last resort, not the first choice", async () => {
    // Whatever this host's npm says, the answer is a usable absolute URL.
    await withEnv(undefined, () => {
      assert.match(resolveRegistry(), /^https?:\/\//);
    });
  });
});

describe("the remembered answer", () => {
  test("round-trips through agentDir", async () => {
    const agentDir = await workspace();
    await writeCache(agentDir, { latest: "0.9.0", checkedAt: 1_700_000_000_000 });
    assert.deepEqual(await readCache(agentDir), { latest: "0.9.0", checkedAt: 1_700_000_000_000 });
    assert.equal(path.basename(cachePath(agentDir)), "update-check.json");
  });

  test("an absent cache is nothing, not an error", async () => {
    assert.equal(await readCache(await workspace()), undefined);
  });

  /** An optimisation must never become a startup error. */
  test("a corrupt cache is nothing, not an error", async () => {
    const agentDir = await workspace();
    await writeFile(cachePath(agentDir), "{ not json");
    assert.equal(await readCache(agentDir), undefined);
  });

  test("a cache of the wrong shape is nothing", async () => {
    const agentDir = await workspace();
    await writeFile(cachePath(agentDir), JSON.stringify({ latest: 9, checkedAt: "yesterday" }));
    assert.equal(await readCache(agentDir), undefined);
  });

  test("writing into a directory that does not exist yet still works", async () => {
    const agentDir = path.join(await workspace(), "nested", "agent");
    await writeCache(agentDir, { latest: "1.0.0", checkedAt: 5 });
    assert.match(await readFile(cachePath(agentDir), "utf8"), /1\.0\.0/);
  });

  test("an unwritable location is survived silently", async () => {
    // The next start simply asks again; nothing here is worth failing over.
    await writeCache(path.join("/proc", "definitely-not-writable"), { latest: "1.0.0", checkedAt: 5 });
  });

  test("a fresh answer is used, a stale one is not", () => {
    const now = 1_700_000_000_000;
    assert.equal(isFresh({ latest: "1.0.0", checkedAt: now - 1000 }, now), true);
    assert.equal(isFresh({ latest: "1.0.0", checkedAt: now - CHECK_INTERVAL_MS - 1 }, now), false);
  });

  test("an answer from the future is stale, not fresh forever", () => {
    // A clock that moved backwards would otherwise pin the cache permanently.
    const now = 1_700_000_000_000;
    assert.equal(isFresh({ latest: "1.0.0", checkedAt: now + CHECK_INTERVAL_MS }, now), false);
  });
});
