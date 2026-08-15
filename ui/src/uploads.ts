/**
 * Getting a file that lives outside the workspace into the agent's reach.
 *
 * A file dragged from the desktop has no path inside the workspace, so there is
 * nothing for an `@path` reference to point at. Copying it in gives it one — and
 * a PDF then costs the prompt a filename instead of a megabyte.
 */
import type { FileBrowserErrorReason } from "@pi-outpost/shared";

/**
 * Where copies land, relative to the writable root. A dropped file is not a
 * statement about where in the project it belongs, so it goes somewhere
 * predictable rather than into whichever directory the tree happens to show.
 *
 * Not dot-prefixed on purpose: file search skips `.`-prefixed entries, and a file
 * the agent is meant to find should be findable.
 */
export const UPLOADS_DIRECTORY = "uploads";

/**
 * Largest file the workspace will take, in raw bytes. Must match
 * `MAX_UPLOAD_BYTES` in `server/src/fileBrowser.ts`, which is the authority —
 * this copy exists so an oversized file is refused before the browser spends a
 * 34 MB send finding out.
 *
 * The value tracks the path-based extraction tools' own limits: a document the
 * agent could read must be one the upload accepts.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** A refused or failed upload, carrying the server's machine-readable reason. */
export class UploadError extends Error {
  readonly reason?: FileBrowserErrorReason;

  constructor(message: string, reason?: FileBrowserErrorReason) {
    super(message);
    this.name = "UploadError";
    this.reason = reason;
  }
}

/**
 * Copies one file into the workspace and resolves with the path actually
 * written — which is not always the name asked for, since the server
 * disambiguates a collision. Injected rather than imported by the attachment
 * builder, so its unit tests keep running without a socket.
 */
export type UploadFile = (name: string, contentBase64: string) => Promise<string>;
