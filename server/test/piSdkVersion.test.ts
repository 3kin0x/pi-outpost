/**
 * Which pi SDK the interface names.
 *
 * This used to be a bundle-time define with a literal `"dev"` fallback, so a server
 * run from source told its operator `pi SDK: dev` — in the one situation where the
 * answer is most likely to be a version nobody expected. The bundle still wins where
 * it exists; these assert that outside one the answer is read from the package on
 * disk, and that a reading it cannot trust is refused rather than guessed at.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import {
  PI_SDK_PACKAGE,
  UNKNOWN_VERSION,
  readInstalledPiSdkVersion,
} from "../src/piSdkVersion.ts";

/** A package tree on disk, described by path -> manifest, and the entry to resolve from. */
function layout(manifests: Record<string, unknown>, entry: string) {
  const root = mkdtempSync(path.join(tmpdir(), "pi-sdk-version-"));
  for (const [rel, manifest] of Object.entries(manifests)) {
    const dir = path.join(root, rel);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "package.json"), JSON.stringify(manifest));
  }
  const entryPath = path.join(root, entry);
  mkdirSync(path.dirname(entryPath), { recursive: true });
  writeFileSync(entryPath, "");
  return { root, resolve: () => entryPath };
}

describe("the pi SDK version a source run reports", () => {
  test("names the installed package, not the word that stands in for not knowing", () => {
    const reported = readInstalledPiSdkVersion();
    assert.notEqual(
      reported,
      UNKNOWN_VERSION,
      "a source run with the SDK installed must name its version",
    );
    assert.match(reported, /^\d+\.\d+\.\d+/, `unexpected version: ${reported}`);
  });

  test("reports what the installed manifest says, whatever that is", async () => {
    // Pinned to the file rather than to a literal, so the assertion does not need
    // editing on every upgrade — and still fails if the two ever disagree.
    const { fileURLToPath } = await import("node:url");
    const entry = fileURLToPath(import.meta.resolve(PI_SDK_PACKAGE));
    const { readFileSync } = await import("node:fs");
    let dir = path.dirname(entry);
    let installed: string | undefined;
    for (let previous = ""; dir !== previous; previous = dir, dir = path.dirname(dir)) {
      try {
        const m = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf-8"));
        if (m.name === PI_SDK_PACKAGE) {
          installed = m.version;
          break;
        }
      } catch {
        continue;
      }
    }
    assert.equal(readInstalledPiSdkVersion(), installed);
  });

  test("walks up to the package that bears the name, not to the nearest manifest", () => {
    // The entry sits at dist/index.js today. A nested dependency's manifest one level
    // up would otherwise be reported as the SDK's version — a plausible number, and
    // the wrong one, which is worse than saying nothing.
    const { resolve } = layout(
      {
        ".": { name: PI_SDK_PACKAGE, version: "9.9.9" },
        "dist/node_modules/impostor": { name: "impostor", version: "1.2.3" },
      },
      "dist/node_modules/impostor/index.js",
    );
    assert.equal(readInstalledPiSdkVersion(resolve), "9.9.9");
  });

  test("refuses a manifest that names the package but carries no version", () => {
    const { resolve } = layout({ ".": { name: PI_SDK_PACKAGE }, }, "dist/index.js");
    assert.equal(readInstalledPiSdkVersion(resolve), UNKNOWN_VERSION);
  });

  test("says it does not know rather than throwing when the package is absent", () => {
    assert.equal(
      readInstalledPiSdkVersion(() => {
        throw new Error("Cannot find module");
      }),
      UNKNOWN_VERSION,
    );
  });

  // openlore: scenario=ADistributedBuildNamesItsSdk spec=api
  test("the bundler inlines the installed version rather than leaving the build to guess", async () => {
    // The executable cannot read its own node_modules, so a bundle gets the answer
    // substituted in. Asserted against the script because building one takes minutes;
    // that the substitution then arrives is what the release job's own version check
    // and a run of the built executable prove.
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const script = readFileSync(
      fileURLToPath(new URL("../scripts/build-sea.mjs", import.meta.url)),
      "utf-8",
    );
    assert.match(
      script,
      /__PI_SDK_VERSION__:\s*JSON\.stringify\(piSdkVersion\)/,
      "the bundle must define the SDK version",
    );
    assert.match(
      script,
      /piSdkVersion\s*=\s*JSON\.parse\(readFileSync\(/,
      "and take it from the installed package's manifest, not from a literal",
    );
  });

  test("says it does not know when nothing on the way up bears the name", () => {
    const { resolve } = layout({ ".": { name: "something-else", version: "4.5.6" } }, "dist/index.js");
    assert.equal(readInstalledPiSdkVersion(resolve), UNKNOWN_VERSION);
  });
});
