import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";

/**
 * Extensions to bake into a SEA (Single Executable Application) build — see
 * server/scripts/build-sea.mjs and docs/sea-packaging.md.
 *
 * Runtime-loaded extensions use config.extensionScripts, which the SDK reads
 * through jiti's loader (createRequire under it) — not a native import(), which
 * cannot reach a file the blob does not contain. In a SEA build those extensions
 * resolve the agent's own packages through jiti's virtual modules; see the
 * "virtual modules" section of server/scripts/build-sea.mjs.
 *
 * This file is for the other case: an extension that must be inside the bundle,
 * with no file on disk at all. Each entry must be a real static import, since
 * esbuild needs a literal path to bundle it. It stays available whatever happens
 * to the runtime path above — a fallback that answers when nothing else can.
 *
 * Empty by default: has no effect on the normal `npm run dev` / `npm run start`
 * flow, which reads config.extensionScripts as usual.
 */
export const seaExtensionFactories: ExtensionFactory[] = [];
