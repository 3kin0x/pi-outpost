/**
 * Which pi SDK is answering prompts in this process.
 *
 * The version is substituted at bundle time (`__PI_SDK_VERSION__`), because the SDK's
 * own runtime `VERSION` walks up from `__dirname` for a package.json and finds the
 * wrong file inside a SEA. That is a reason to prefer the define *in a bundle*, not a
 * reason to answer "dev" outside one: running from source is exactly when a developer
 * needs to know which SDK they are on, and the package is right there on disk.
 *
 * Read from the installed package, not from `require("<pkg>/package.json")` — the
 * package's `exports` does not expose that subpath, so the direct require raises
 * ERR_PACKAGE_PATH_NOT_EXPORTED. Resolve the entry point instead and walk up to the
 * package root, checking `name` rather than trusting a fixed depth: the entry lives at
 * `dist/index.js` today, and a layout change would otherwise read a nested
 * dependency's manifest and report its version as the SDK's.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PI_SDK_PACKAGE = "@earendil-works/pi-coding-agent";

/** What we say when the version cannot be established. Never a guess at a number. */
export const UNKNOWN_VERSION = "dev";

/** Resolves the SDK's entry point. Injectable so the walk-up can be tested on its own. */
export type ResolveEntry = (specifier: string) => string;

// `import.meta.resolve`, not `createRequire().resolve`: the package declares `exports`
// with no CJS main, so the require form raises ERR_PACKAGE_PATH_NOT_EXPORTED. This is
// the same form `server/scripts/build-sea.mjs` uses to read the version it inlines.
const resolveFromHere: ResolveEntry = (specifier) => fileURLToPath(import.meta.resolve(specifier));

/**
 * The installed SDK's version, or `UNKNOWN_VERSION` if it cannot be read.
 *
 * Never throws: this feeds one line of a settings panel, and a server that refuses to
 * start because it could not name its own dependency would be a far worse trade.
 */
export function readInstalledPiSdkVersion(resolve: ResolveEntry = resolveFromHere): string {
  try {
    let dir = path.dirname(resolve(PI_SDK_PACKAGE));
    // Bounded by the filesystem root: `path.dirname("/")` is `"/"`, so compare rather
    // than trust the loop to terminate on its own.
    for (let previous = ""; dir !== previous; previous = dir, dir = path.dirname(dir)) {
      let manifest: { name?: unknown; version?: unknown };
      try {
        manifest = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf-8"));
      } catch {
        continue; // no manifest at this level, or an unreadable one — keep walking
      }
      if (manifest.name !== PI_SDK_PACKAGE) continue;
      return typeof manifest.version === "string" && manifest.version
        ? manifest.version
        : UNKNOWN_VERSION;
    }
  } catch {
    // The package is not installed, or resolution is unavailable in this runtime.
  }
  return UNKNOWN_VERSION;
}
