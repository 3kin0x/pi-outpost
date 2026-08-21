/**
 * Creates a directory watcher and does nothing else.
 *
 * A watcher must never be the reason a process stays alive — the server has an
 * HTTP listener for that, and a test run has nothing. If this process is still
 * running when its caller's timeout fires, `persistent: false` was lost.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDirectoryWatcher } from "../../src/fileWatcher.ts";

const root = await mkdtemp(path.join(tmpdir(), "pi-outpost-watch-exit-"));
const watcher = createDirectoryWatcher({ root, onChange: () => {} });
await watcher.watch("");
// Deliberately no close(): the point is that an *open* watcher does not hold the
// loop. Closing first would prove nothing.
console.log("watching");
