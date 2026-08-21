/**
 * Directory browsing for path-valued settings.
 *
 * Deliberately *not* the file browser. That one is confined to the workspace
 * (fileBrowser.ts, `resolveConfined`) because it hands out file contents and
 * accepts writes; this one exists to let an operator point a setting at a
 * directory the process can read — a mounted share of skills, a sibling
 * workspace — which by definition lives outside that confinement. Widening the
 * file browser to reach those would extend read, write, rename and upload along
 * with it, so the two stay separate boundaries with separate powers.
 *
 * What this one gives up in exchange: it never returns a file, never opens one,
 * and returns names and paths only. Its access boundary is the WebSocket's own —
 * the token check that guards /ws, and the refusal to bind off-loopback without
 * a token.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { ServerDirEntry } from "@pi-outpost/shared";

export interface ServerDirectoryListing {
  /** The absolute path that was listed (normalized). */
  path: string;
  /** The parent to walk back to, or null at the filesystem root. */
  parent: string | null;
  /** Immediate subdirectories, directory-first order is moot — these are all directories. */
  entries: ServerDirEntry[];
}

/** A path the server cannot list. The message names the path, so the UI can show it verbatim. */
export class ServerDirectoryError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "ServerDirectoryError";
  }
}

/**
 * Normalize a client-supplied path to an absolute one. Anchored at `/` rather
 * than the process cwd: a relative path from a browser is not a path relative to
 * wherever the server happens to have been started, and treating it as one would
 * make the same request mean different things on two deployments.
 */
export function normalizeServerPath(requested: string): string {
  return path.resolve("/", requested.trim() === "" ? "/" : requested.trim());
}

/** Immediate subdirectories of one server-side path. Symlinks that point at a directory count. */
export async function listServerDirectories(requested: string): Promise<ServerDirectoryListing> {
  const target = normalizeServerPath(requested);
  let dirents;
  try {
    dirents = await fs.readdir(target, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new ServerDirectoryError(target, `"${target}" does not exist`);
    if (code === "ENOTDIR") throw new ServerDirectoryError(target, `"${target}" is not a directory`);
    if (code === "EACCES" || code === "EPERM") {
      throw new ServerDirectoryError(target, `Cannot list "${target}": permission denied`);
    }
    throw new ServerDirectoryError(target, `Cannot list "${target}": ${(error as Error).message}`);
  }

  const entries: ServerDirEntry[] = [];
  for (const dirent of dirents) {
    const full = path.join(target, dirent.name);
    if (dirent.isDirectory()) {
      entries.push({ name: dirent.name, path: full });
      continue;
    }
    // A mounted share is often reached through a symlink; hiding those would hide
    // exactly the directories this browser exists to find. Anything whose target
    // cannot be stat'ed (a dangling link, a mount that is not answering) is not a
    // directory anyone can select, so it is left out rather than offered.
    if (!dirent.isSymbolicLink()) continue;
    try {
      if ((await fs.stat(full)).isDirectory()) entries.push({ name: dirent.name, path: full });
    } catch {
      // Not selectable — skip it.
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  const parent = path.dirname(target);
  return { path: target, parent: parent === target ? null : parent, entries };
}
