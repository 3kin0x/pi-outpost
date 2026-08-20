/**
 * What lets an extension reach the agent's own packages inside an executable.
 *
 * There are no node_modules beside a single-file executable, so an extension that
 * imports `typebox` or `@earendil-works/pi-coding-agent` has nothing on disk to
 * resolve. jiti's `virtualModules` answers those specifiers with module objects that
 * are already in the bundle, and the SDK already builds that map — it just selects
 * it on `isBunBinary`, which a Node SEA is not. Both build scripts patch that one
 * condition.
 *
 * A patch that matches by string is a patch that stops matching. These tests assert
 * the anchors against the SDK as installed, so an upgrade that moves them fails here
 * — in a suite that runs on every push — rather than at release time, or worse, in
 * an executable where extension loading is quietly dead.
 *
 * The end-to-end proof cannot live here: it needs Node >= 26, a full SEA build of
 * several minutes, and a runtime whose single-executable support works. It was run
 * by hand, and what it printed is in the commit that introduced this.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const LOADER = path.join(REPO, "node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js");

/** The exact text both build scripts rewrite. Written once, asserted everywhere. */
const BRANCH = "...isBunBinary ? { virtualModules: VIRTUAL_MODULES, tryNative: false }";

describe("the SDK still has the shape both build patches assume", () => {
  test("the loader chooses jiti's virtual modules on the bundled-binary branch", () => {
    const loader = readFileSync(LOADER, "utf8");
    // The bundled form differs from the source only in whitespace; both scripts
    // patch the bundled one, so assert on what is actually there to be patched.
    assert.match(loader, /isBunBinary\s*\?\s*\{\s*virtualModules:\s*VIRTUAL_MODULES,\s*tryNative:\s*false\s*\}/);
  });

  test("virtual modules carry the packages an extension would import", () => {
    const loader = readFileSync(LOADER, "utf8");
    for (const specifier of ["typebox", "@earendil-works/pi-tui", "@earendil-works/pi-coding-agent"]) {
      assert.ok(loader.includes(`"${specifier}"`), `${specifier} is no longer offered to extensions`);
    }
  });

  test("getAliases still resolves through the filesystem, which is why it cannot answer inside an executable", () => {
    // If this ever stops being true, the patch is solving a problem that moved.
    const loader = readFileSync(LOADER, "utf8");
    assert.match(loader, /function getAliases\(\)/);
    assert.match(loader, /require\.resolve\("typebox"\)/);
  });
});

describe("both build scripts patch that branch", () => {
  const scripts = [
    path.join(REPO, "server/scripts/build-sea.mjs"),
    // Two bundles produce an executable — the blob and the one `--build-sea` reads.
    // Patching one leaves extensions working on whichever path a machine took.
    path.join(REPO, "cli/scripts/build.mjs"),
  ];

  for (const script of scripts) {
    test(`${path.relative(REPO, script)} rewrites the condition and refuses to run silently if it moved`, () => {
      const source = readFileSync(script, "utf8");
      assert.ok(source.includes(BRANCH), "the anchor this script searches for is not the SDK's text");
      assert.match(source, /__piOutpostIsSea\(\)/);
      assert.match(source, /node:sea/);
      // A patch that finds nothing must stop the build, not produce an executable
      // whose extensions cannot import anything.
      assert.match(source, /throw new Error\(.*jiti branch moved/);
    });
  }
});

describe("what a built bundle carries", () => {
  const bundles = [path.join(REPO, "server/dist/bundle.mjs"), path.join(REPO, "cli/dist/pi-outpost.sea.mjs")];

  for (const bundle of bundles) {
    test(`${path.relative(REPO, bundle)} takes the virtual-modules branch when it is an executable`, (t) => {
      // Skipped rather than failed where nothing has been built: this suite runs
      // on a checkout with no dist/, and a red test there would say nothing true.
      if (!existsSync(bundle)) return t.skip("not built here");
      const built = readFileSync(bundle, "utf8");
      assert.match(built, /isBunBinary \|\| __piOutpostIsSea\(\)/);
      assert.match(built, /function __piOutpostIsSea\(\)/);
    });
  }
});
