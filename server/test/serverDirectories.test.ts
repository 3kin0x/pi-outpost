/**
 * The resource-path browser: directories only, from the filesystem root, with no
 * workspace confinement.
 *
 * The confinement tests live in fileBrowser.test.ts and must keep passing — this
 * boundary is deliberately a different one (see serverDirectories.ts), and these
 * tests exist to pin what it *does* refuse: files, and paths it cannot read.
 */
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { listServerDirectories, normalizeServerPath, ServerDirectoryError } from "../src/serverDirectories.ts";

/**
 * The top of the tree above a given path, spelled the way this platform spells it:
 * "/" on POSIX, and that path's drive root ("C:\\") on Windows.
 *
 * Per-path, not one constant, because on Windows there is more than one root and
 * they do not connect: the CI runner keeps the checkout on `D:` and the temp
 * directory on `C:`, so a walk down from one can never reach the other. The
 * browser inherits that — it resolves an absolute path the way the platform does,
 * which honours an explicit `C:\…` but offers no drive switcher when walking.
 */
const rootOf = (somePath: string) => path.parse(somePath).root;

async function tree(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "pi-outpost-dirs-"));
  await mkdir(path.join(root, "mnt", "skills"), { recursive: true });
  await mkdir(path.join(root, "mnt", ".hidden"), { recursive: true });
  await writeFile(path.join(root, "mnt", "notes.md"), "not a directory");
  return root;
}

describe("listServerDirectories", () => {
  test("walks from the filesystem root down to a mounted directory", async () => {
    const root = await tree();
    try {
      // The root of the filesystem this fixture is on — the only one a walk can reach.
      const fsRoot = rootOf(root);
      const top = await listServerDirectories(fsRoot);
      assert.equal(top.path, fsRoot);
      assert.equal(top.parent, null, "the root has nowhere to go back to");
      assert.ok(top.entries.length > 0);

      // Every step down is reachable, including the parts outside any workspace.
      let current = fsRoot;
      for (const segment of path.relative(fsRoot, path.join(root, "mnt")).split(path.sep)) {
        const listing = await listServerDirectories(current);
        const next = listing.entries.find((entry) => entry.name === segment);
        assert.ok(next, `"${segment}" must be listed under ${current}`);
        current = next.path;
      }
      assert.equal(current, path.join(root, "mnt"));

      const mnt = await listServerDirectories(current);
      assert.deepEqual(
        mnt.entries.map((entry) => entry.name),
        [".hidden", "skills"],
      );
      assert.equal(mnt.parent, root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("returns directories only — never a file", async () => {
    const root = await tree();
    try {
      const entries = (await listServerDirectories(path.join(root, "mnt"))).entries.map((entry) => entry.name);
      assert.equal(entries.includes("notes.md"), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("carries each entry's absolute path", async () => {
    const root = await tree();
    try {
      const skills = (await listServerDirectories(path.join(root, "mnt"))).entries.find((e) => e.name === "skills");
      assert.equal(skills?.path, path.join(root, "mnt", "skills"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("follows a symlink that points at a directory, and skips one that does not", async () => {
    const root = await tree();
    try {
      await symlink(path.join(root, "mnt", "skills"), path.join(root, "share"));
      await symlink(path.join(root, "mnt", "notes.md"), path.join(root, "note-link"));
      await symlink(path.join(root, "gone"), path.join(root, "dangling"));

      const names = (await listServerDirectories(root)).entries.map((entry) => entry.name);
      assert.deepEqual(names, ["mnt", "share"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("refuses a path that does not exist, naming it", async () => {
    const root = await tree();
    try {
      const missing = path.join(root, "nowhere");
      await assert.rejects(
        () => listServerDirectories(missing),
        (error: unknown) =>
          error instanceof ServerDirectoryError && error.path === missing && /does not exist/.test(error.message),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("refuses a file", async () => {
    const root = await tree();
    try {
      const file = path.join(root, "mnt", "notes.md");
      await assert.rejects(
        () => listServerDirectories(file),
        (error: unknown) => error instanceof ServerDirectoryError && /is not a directory/.test(error.message),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("refuses a directory it cannot read", async (t) => {
    if (process.platform === "win32") return t.skip("chmod 000 does not deny a read here");
    const root = await tree();
    const locked = path.join(root, "locked");
    try {
      await mkdir(locked);
      await chmod(locked, 0o000);
      await assert.rejects(
        () => listServerDirectories(locked),
        (error: unknown) =>
          error instanceof ServerDirectoryError && error.path === locked && /permission denied/.test(error.message),
      );
    } finally {
      await chmod(locked, 0o700).catch(() => {});
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("normalizeServerPath", () => {
  test("an empty request is the filesystem root", () => {
    const fsRoot = rootOf(process.cwd());
    assert.equal(normalizeServerPath(""), fsRoot);
    assert.equal(normalizeServerPath("   "), fsRoot);
  });

  test("a relative path is anchored at the root, not at the server's cwd", () => {
    const fsRoot = rootOf(process.cwd());
    assert.equal(normalizeServerPath("etc"), path.join(fsRoot, "etc"));
    // Climbing above the root lands on the root, never in the process's cwd.
    assert.equal(normalizeServerPath("../../etc"), path.join(fsRoot, "etc"));
  });

  test("collapses traversal inside an absolute path", () => {
    const fsRoot = rootOf(process.cwd());
    assert.equal(normalizeServerPath(path.join(fsRoot, "usr", "local", "..", "share")), path.join(fsRoot, "usr", "share"));
  });
});
