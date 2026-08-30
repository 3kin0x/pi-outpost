/**
 * Two lists of extension paths, and the lock over one of them.
 *
 * Skills already work this way: what the configuration file declares belongs to the
 * deployment and is unreachable from the interface, what Settings adds is the user's.
 * These assert the same separation for extensions, plus the two things extensions have
 * that skills do not — a lock, and the fact that the paths are read exceptions to the
 * sandbox, without which the agent would be forbidden to read the code it just loaded.
 */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { allExtensionPaths, loadConfig, persistEditableSettings } from "../src/config.ts";

async function workspace(config: Record<string, unknown>): Promise<{ dir: string; file: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "pi-outpost-ext-"));
  const file = path.join(dir, "pi-outpost.config.json");
  await writeFile(file, `${JSON.stringify({ cwd: dir, ...config }, null, 2)}\n`);
  return { dir, file };
}

const load = (dir: string, file: string) => loadConfig(dir, { config: file }, {}, { quiet: true });

describe("extension paths the interface may add", () => {
  // openlore: scenario=TheTwoListsLoadTogether spec=config
  test("loads the deployment's and the user's, in that order", async () => {
    const { dir, file } = await workspace({
      extensionPaths: ["./deployment-ext"],
      userExtensionPaths: ["./mine"],
    });
    try {
      await mkdir(path.join(dir, "deployment-ext"), { recursive: true });
      await mkdir(path.join(dir, "mine"), { recursive: true });
      const config = load(dir, file);
      assert.deepEqual(config.extensionPaths, [path.join(dir, "deployment-ext")]);
      assert.deepEqual(config.userExtensionPaths, [path.join(dir, "mine")]);
      // Order matters for the same reason it does for skills: the first loaded wins a
      // collision, so the deployment's come first.
      assert.deepEqual(allExtensionPaths(config), [
        path.join(dir, "deployment-ext"),
        path.join(dir, "mine"),
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // openlore: scenario=ADirectoryIsAValidExtensionPath spec=config
  test("passes a directory through as it was written, for the loader to discover", async () => {
    const { dir, file } = await workspace({ userExtensionPaths: ["./mine"] });
    try {
      await mkdir(path.join(dir, "mine"), { recursive: true });
      await writeFile(path.join(dir, "mine", "hello.ts"), "export default () => {};\n");
      // Resolved, not expanded: naming the files here would duplicate the SDK's
      // discovery rules and go stale the first time they change.
      assert.deepEqual(load(dir, file).userExtensionPaths, [path.join(dir, "mine")]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // openlore: scenario=BothListsAreReadExceptionsToTheSandbox spec=config
  test("both lists are read exceptions, so the agent may read what it loaded", async () => {
    const { dir, file } = await workspace({
      sandbox: { root: "./project", allowWrite: false, allowBash: false },
      extensionPaths: ["./deployment-ext"],
      userExtensionPaths: ["./mine"],
    });
    try {
      await mkdir(path.join(dir, "project"), { recursive: true });
      await mkdir(path.join(dir, "deployment-ext"), { recursive: true });
      await mkdir(path.join(dir, "mine"), { recursive: true });
      const exceptions = load(dir, file).sandbox?.readExceptions ?? [];
      assert.ok(exceptions.includes(path.join(dir, "deployment-ext")));
      assert.ok(
        exceptions.includes(path.join(dir, "mine")),
        "a user extension directory outside the root would otherwise be unreadable to the agent that runs it",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("absent means empty, so an older configuration file loads unchanged", async () => {
    const { dir, file } = await workspace({ extensionPaths: [] });
    try {
      const config = load(dir, file);
      assert.deepEqual(config.userExtensionPaths, []);
      assert.equal(config.extensionLock, undefined);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("the extension lock", () => {
  test("is read from the configuration file", async () => {
    const { dir, file } = await workspace({ extensionLock: true });
    try {
      assert.equal(load(dir, file).extensionLock, true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("refuses anything but a boolean rather than reading truthiness into it", async () => {
    const { dir, file } = await workspace({ extensionLock: "yes" });
    try {
      assert.throws(() => load(dir, file), /extensionLock/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("persisting user extension paths", () => {
  test("writes a path the next load returns", async () => {
    const { dir, file } = await workspace({ extensionPaths: [] });
    try {
      await mkdir(path.join(dir, "mine"), { recursive: true });
      persistEditableSettings(load(dir, file), { userExtensionPaths: [path.join(dir, "mine")] }, {});
      assert.deepEqual(load(dir, file).userExtensionPaths, [path.join(dir, "mine")]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // openlore: scenario="A removed user extension path leaves the deployment's paths intact" spec=persistent-runtime-settings
  test("leaves the deployment's extensionPaths and its lock byte for byte", async () => {
    const { dir, file } = await workspace({
      extensionPaths: ["./deployment-ext"],
      extensionLock: true,
      userExtensionPaths: ["./mine"],
    });
    try {
      await mkdir(path.join(dir, "deployment-ext"), { recursive: true });
      await mkdir(path.join(dir, "mine"), { recursive: true });
      const before = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;

      // The user removed their own additions. Nothing of the deployment's may go with them.
      persistEditableSettings(load(dir, file), { userExtensionPaths: [] }, {});

      const after = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
      assert.deepEqual(after.extensionPaths, before.extensionPaths, "written as the operator wrote it");
      assert.equal(after.extensionLock, true, "an apply must not be able to remove its own lock");
      assert.deepEqual(after.userExtensionPaths, []);
      assert.deepEqual(load(dir, file).extensionPaths, [path.join(dir, "deployment-ext")]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("an update that carries no extension paths leaves the key untouched", async () => {
    const { dir, file } = await workspace({ userExtensionPaths: ["./mine"] });
    try {
      await mkdir(path.join(dir, "mine"), { recursive: true });
      persistEditableSettings(load(dir, file), { userSkillPaths: [] }, {});
      assert.deepEqual(load(dir, file).userExtensionPaths, [path.join(dir, "mine")]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
