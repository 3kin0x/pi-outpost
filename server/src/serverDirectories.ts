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
 * The top of the tree, as one path the protocol can carry.
 *
 * On POSIX it is simply `/`. On Windows there is no single root — every drive has
 * its own, and they do not connect — so `/` names a *virtual* one whose entries are
 * the drives. Without it a settings path on another drive would be unreachable:
 * `dirname("C:\\")` is `C:\\`, so walking up ends there, and skill paths have no
 * text field to type one into.
 */
export const VIRTUAL_ROOT = "/";

/**
 * The path grammar of the platform being served — win32 separators and drive roots,
 * or posix ones. Named explicitly rather than taken from `path`, so the Windows
 * behaviour is exercised by tests that do not run on Windows: injecting the
 * platform without its path math would only prove that a fake agrees with itself.
 */
const pathFor = (platform: NodeJS.Platform) => (platform === "win32" ? path.win32 : path.posix);

export interface ServerDirectoryOptions {
  /** Injectable so the Windows behaviour is testable on a machine that is not Windows. */
  platform?: NodeJS.Platform;
  /** Whether a drive root can be listed. Injectable for the same reason. */
  probeDrive?: (root: string) => Promise<boolean>;
}

/**
 * Drive letters worth probing, in order. Deliberately not `A:` and `B:`: on the
 * hardware that still has a floppy controller, touching them spins a drive and
 * blocks for seconds, and nothing anyone configures lives there.
 */
const DRIVE_LETTERS = "CDEFGHIJKLMNOPQRSTUVWXYZ".split("");

async function canList(root: string): Promise<boolean> {
  try {
    const handle = await fs.opendir(root);
    await handle.close();
    return true;
  } catch {
    // Absent, or present with no media (an empty optical drive) — either way it is
    // not a place a setting can point at.
    return false;
  }
}

/** The drives this host can actually list, as pickable entries. */
export async function listDrives(probe: (root: string) => Promise<boolean> = canList): Promise<ServerDirEntry[]> {
  const probed = await Promise.all(
    DRIVE_LETTERS.map(async (letter) => ((await probe(`${letter}:\\`)) ? { name: `${letter}:`, path: `${letter}:\\` } : undefined)),
  );
  return probed.filter((entry): entry is ServerDirEntry => entry !== undefined);
}

/**
 * Normalize a client-supplied path to an absolute one. Anchored at the filesystem
 * root rather than the process cwd: a relative path from a browser is not a path
 * relative to wherever the server happens to have been started, and treating it as
 * one would make the same request mean different things on two deployments.
 *
 * The one path that is not resolved is the virtual root on Windows — resolving it
 * would silently pin the top of the tree to whichever drive the server was started
 * from, which is the drive the user is trying to leave.
 */
export function normalizeServerPath(requested: string, platform: NodeJS.Platform = process.platform): string {
  const trimmed = requested.trim();
  if (platform === "win32" && (trimmed === "" || trimmed === "/" || trimmed === "\\")) return VIRTUAL_ROOT;
  return pathFor(platform).resolve("/", trimmed === "" ? "/" : trimmed);
}

/**
 * The directory to walk back to, or null at the top.
 *
 * On Windows a drive root's parent is the virtual root — that is the way back to
 * the other drives — and the virtual root itself has none.
 */
export function parentOf(target: string, platform: NodeJS.Platform = process.platform): string | null {
  if (platform === "win32" && target === VIRTUAL_ROOT) return null;
  const parent = pathFor(platform).dirname(target);
  if (parent !== target) return parent;
  return platform === "win32" ? VIRTUAL_ROOT : null;
}

/** Immediate subdirectories of one server-side path. Symlinks that point at a directory count. */
export async function listServerDirectories(
  requested: string,
  options: ServerDirectoryOptions = {},
): Promise<ServerDirectoryListing> {
  const platform = options.platform ?? process.platform;
  const target = normalizeServerPath(requested, platform);
  if (platform === "win32" && target === VIRTUAL_ROOT) {
    return { path: VIRTUAL_ROOT, parent: null, entries: await listDrives(options.probeDrive) };
  }
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
    const full = pathFor(platform).join(target, dirent.name);
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

  return { path: target, parent: parentOf(target, platform), entries };
}
