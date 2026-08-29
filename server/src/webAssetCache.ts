/**
 * How long a browser may hold one asset of the inlined web bundle.
 *
 * The interface is served two ways. From `web/dist` on disk, `fastifyStatic`
 * already answers with `max-age=0` and validators, so every request revalidates
 * and a rebuild is picked up. The inlined bundle inside the standalone executable
 * is served from memory by hand, and it sent no cache headers at all — which left
 * freshness to each browser's heuristics rather than to anything stated.
 *
 * The rule is the one Vite's output makes available: every built asset under
 * `/assets/` carries a content hash in its name, so a new build is a new name and
 * the old one can be kept forever. Everything else — the page, the manifest, the
 * icons — lives at a fixed name, and a copy held across an update is the stale
 * shell the interface must never show. `index.html` is the one that matters most:
 * it is where the hashed names are written down, so a cached copy of it pins the
 * whole previous build.
 */

/** Assets whose name changes with their content, and may therefore be kept. */
const CONTENT_HASHED_PREFIX = "/assets/";

export function cacheControlFor(url: string): string {
  return url.startsWith(CONTENT_HASHED_PREFIX) ? "public, max-age=31536000, immutable" : "no-cache";
}
