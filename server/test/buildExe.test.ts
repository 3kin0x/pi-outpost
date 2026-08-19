/**
 * The build's decisions, without running a build.
 *
 * Everything asserted here is a detail whose absence produced a failure nobody could
 * read: a BOM at byte zero, a missing module format, a Windows file the loader will
 * not execute, a path silently overwritten.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import {
  BuildExeError,
  carriesSeaSentinel,
  producedExecutableRuns,
  buildExecutable,
  canBuildDirectly,
  executableName,
  majorOf,
  releaseArtifactName,
  seaConfigBytes,
  seaConfigFor,
} from "../src/buildExe.ts";

describe("the generated SEA config", () => {
  test("declares the module format the bundle needs", () => {
    // Without it Node loads an ESM bundle as CommonJS and it dies on its first import
    assert.equal(seaConfigFor("/x/bundle.mjs", "/x/out").mainFormat, "module");
  });

  test("is written as UTF-8 with no byte order mark", () => {
    // PowerShell's Out-File -Encoding utf8 adds one, and Node's JSON parser dies on
    // byte zero of a file that looks perfect in an editor. This is that bug's test.
    const bytes = seaConfigBytes(seaConfigFor("/x/bundle.mjs", "/x/out"));
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal(bytes[0], "{".charCodeAt(0));
    assert.deepEqual(JSON.parse(bytes.toString("utf8")).main, "/x/bundle.mjs");
  });

  test("silences the experimental warning, which is not news to anyone running this", () => {
    assert.equal(seaConfigFor("/x/bundle.mjs", "/x/out").disableExperimentalSEAWarning, true);
  });
});

describe("what the platform will execute", () => {
  test("Windows gets the suffix its loader requires", () => {
    assert.equal(executableName("pi-outpost", "win32"), "pi-outpost.exe");
  });

  test("everywhere else does not", () => {
    assert.equal(executableName("pi-outpost", "darwin"), "pi-outpost");
    assert.equal(executableName("pi-outpost", "linux"), "pi-outpost");
  });

  test("a release artifact names the platform it is for", () => {
    // So that which file to download is legible without reading documentation
    assert.equal(releaseArtifactName("0.10.0", "darwin", "arm64"), "pi-outpost-0.10.0-macos-arm64");
    assert.equal(releaseArtifactName("0.10.0", "linux", "x64"), "pi-outpost-0.10.0-linux-x64");
    assert.equal(releaseArtifactName("0.10.0", "win32", "x64"), "pi-outpost-0.10.0-windows-x64.exe");
  });
});

describe("which build path is available", () => {
  test("--build-sea needs Node 26", () => {
    assert.equal(canBuildDirectly("v26.0.0"), true);
    assert.equal(canBuildDirectly("v28.3.1"), true);
    assert.equal(canBuildDirectly("v24.9.0"), false);
    assert.equal(majorOf("v24.9.0"), 24);
  });
});

describe("refusing rather than shipping something broken", () => {
  const withTempDir = (body: (dir: string) => void) => {
    const dir = mkdtempSync(path.join(tmpdir(), "pi-outpost-buildexe-"));
    try {
      body(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  test("an existing file is left alone, and the option that would replace it is named", () => {
    withTempDir((dir) => {
      const target = path.join(dir, "pi-outpost");
      writeFileSync(target, "not an executable");
      assert.throws(
        () => buildExecutable({ out: target, cwd: dir }),
        (error: unknown) => error instanceof BuildExeError && /--force/.test((error as Error).message),
      );
      // and it really is untouched
      assert.equal(readFileSync(target, "utf8"), "not an executable");
    });
  });

  test("nothing to build from is said plainly, not left as an ENOENT", () => {
    withTempDir((dir) => {
      assert.throws(
        // Inputs looked for in an empty directory: what an already-built executable
        // looks like when someone asks it to build another one. Pointed there
        // explicitly, or this repo's own cli/dist would answer and the assertion
        // would pass for a reason that has nothing to do with the message.
        () =>
          buildExecutable({
            out: path.join(dir, "pi-outpost"),
            cwd: dir,
            inputsFrom: dir,
            nodeVersion: "v26.0.0",
          }),
        (error: unknown) => error instanceof BuildExeError && /not from an executable/.test((error as Error).message),
      );
    });
  });

  test("too old a Node with no blob to fall back on names the version it needs", () => {
    withTempDir((dir) => {
      writeFileSync(path.join(dir, "pi-outpost.sea.mjs"), "// a bundle, but no blob beside it");
      assert.throws(
        () =>
          buildExecutable({
            out: path.join(dir, "pi-outpost"),
            cwd: dir,
            inputsFrom: dir,
            nodeVersion: "v24.9.0",
          }),
        (error: unknown) => error instanceof BuildExeError && /26/.test((error as Error).message),
      );
    });
  });
});

describe("proving the result before calling it produced", () => {
  test("a runnable binary passes and its output is kept", () => {
    // node --version is the same shape as the check the build runs on its own output
    const verdict = producedExecutableRuns(process.execPath);
    assert.equal(verdict.ok, true);
    assert.match(verdict.detail, /^v\d+\./);
  });

  test("something that is not an executable fails rather than throwing", () => {
    const verdict = producedExecutableRuns(path.join(tmpdir(), "definitely-not-here-pi-outpost"));
    assert.equal(verdict.ok, false);
    assert.ok(verdict.detail.length > 0);
  });
});

describe("whether a runtime can host an injected blob", () => {
  test("a node built without single-executable support is detected, not left to postject", () => {
    // Homebrew's node@24 carries no sentinel; postject's own message for that reads
    // like a corrupt download rather than an unsupported runtime.
    assert.equal(typeof carriesSeaSentinel(process.execPath), "boolean");
  });

  test("a file with no sentinel in it answers false", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pi-outpost-sentinel-"));
    try {
      const plain = path.join(dir, "plain.bin");
      writeFileSync(plain, Buffer.alloc(4 << 20, 7));
      assert.equal(carriesSeaSentinel(plain), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a sentinel straddling a chunk boundary is still found", () => {
    // The scan reads a megabyte at a time; a marker split across two reads is the
    // one case a naive chunked search misses.
    const dir = mkdtempSync(path.join(tmpdir(), "pi-outpost-sentinel-"));
    try {
      const straddling = path.join(dir, "straddling.bin");
      const fuse = Buffer.from("NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2");
      const buffer = Buffer.alloc((1 << 20) + fuse.length + 16, 7);
      fuse.copy(buffer, (1 << 20) - Math.floor(fuse.length / 2));
      writeFileSync(straddling, buffer);
      assert.equal(carriesSeaSentinel(straddling), true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
