/**
 * Make sure `server/src/embedded-web.ts` exists, without ever committing it.
 *
 * That file is a build artifact: the production web UI, base64'd into a TypeScript
 * module so the npm and SEA bundles ship the interface inside the executable (see
 * cli/scripts/embed-web.mjs, and docs/sea-packaging.md). It is ~9 MB, and it used
 * to be checked in — which cost a 9 MB blob per revision and, worse, made the
 * repository carry a *stale* UI: `server/src/index.ts` prefers `EMBEDDED_WEB` over
 * `web/dist`, so a developer who rebuilt the web app and restarted the server was
 * still served the bundle from whenever it was last committed. A rebuilt fix that
 * is invisible is the expensive kind of bug.
 *
 * It cannot simply be deleted either: index.ts imports it statically, so a fresh
 * clone would fail to start and to typecheck before any build had run. Hence this
 * postinstall step — it writes the *empty* map when the file is missing, which is
 * the same thing `BUILD_EMBED_WEB=0` produces and puts the server on its
 * fastifyStatic path, serving `web/dist` from disk. That is the right behaviour in
 * development anyway: what you built is what you get.
 *
 * An existing file is left alone: it may be a real bundle a build just produced.
 *
 * With `--reset` the file is emptied whatever it holds. That is what the `dev`,
 * `start` and `bench` scripts run before they serve anything, because a packaging
 * build run locally leaves a *filled* bundle behind and brings the stale-UI trap
 * straight back — untracking the file only removed the copy that came from git.
 * Development serves what is on disk, always; the packaging builds fill the file in
 * again themselves, right before they bundle it.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeEmptyEmbeddedWeb } from "../cli/scripts/embed-web.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(repoRoot, "server", "src", "embedded-web.ts");

const reset = process.argv.includes("--reset");
if (existsSync(target) && !reset) process.exit(0);

await writeEmptyEmbeddedWeb(target);
console.log("[embedded-web] empty bundle — the server serves web/dist from disk");
