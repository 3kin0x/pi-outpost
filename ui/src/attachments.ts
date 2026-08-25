/**
 * File attached before sending: images go to the model, small dropped text files are
 * inlined, and anything the agent can read at a path travels as an `@path` reference.
 * The agent browses the same root as the file viewer, so it can read a previewed file
 * itself — inlining it would spend the context window on content the user may never
 * ask about. A file supplied from outside that root is copied in first, which is what
 * gives it a path to reference (see uploads.ts).
 */
import { mentionedPaths as sharedMentionedPaths } from "@pi-outpost/shared/mentions";
import { MAX_UPLOAD_BYTES, UploadError, type UploadFile } from "./uploads";
import { hasPathExtractionTool, isPdfFile } from "./util/workspacePath";

export interface Attachment {
  name: string;
  kind: "image" | "text" | "path";
  /** base64 (image), plain text (text file), or a browser-root-relative path (path) */
  data: string;
  mimeType: string;
  /** Preview attachments are replaced when the user previews another file. */
  source?: "manual" | "preview";
  /** Browser-root-relative identity of the file that supplied a preview attachment. */
  previewPath?: string;
}

export const MAX_TEXT_FILE_BYTES = 512 * 1024;
// Must stay under the server's 10 MB base64 cap (base64 ≈ 4/3 × raw): 7 MB raw ≈ 9.8 MB base64
export const MAX_IMAGE_FILE_BYTES = 7 * 1024 * 1024;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * What a supplied file should become, decided from its MIME type and its name.
 *
 * - `extraction-tool` — the agent has a tool that reads this format at a path, so
 *   the copy's path is worth more to the prompt than its bytes.
 * - `image` — the model needs the bytes; the agent cannot supply them itself.
 * - `inline-text` — small enough to travel in the prompt, as it always has.
 * - `unsupported` — refused, with a reason of its own.
 *
 * This runs in the browser and is therefore advisory: it decides what a file
 * *should become*, while the server decides whether it may be written at all. A
 * misclassification produces a wrong attachment kind, never a write outside the
 * sandbox.
 */
export type DroppedFileKind = "image" | "extraction-tool" | "inline-text" | "unsupported";

export function classifyDroppedFile(file: File): DroppedFileKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || isPdfFile(file.name) || hasPathExtractionTool(file.name)) return "extraction-tool";
  if (file.size <= MAX_TEXT_FILE_BYTES) return "inline-text";
  // Too big for the prompt, but the agent reads a path perfectly well — and a
  // 600 KB log or CSV is one of the likeliest things to be dropped here. Only
  // text goes this way: a binary with no tool behind it still has nothing useful
  // to offer at a path.
  if (looksTextual(file) && file.size <= MAX_UPLOAD_BYTES) return "extraction-tool";
  return "unsupported";
}

/**
 * Whether a file has to reach the server before it can be attached.
 *
 * `App` needs the same answer as the builder to show a pending chip for the right
 * files, and the two drifting apart is exactly how a chip ends up stuck: shown for
 * a file that never uploads, or missing for one that does.
 */
export function needsUpload(file: File): boolean {
  const kind = classifyDroppedFile(file);
  if (kind === "extraction-tool") return true;
  return kind === "image" && file.size > MAX_IMAGE_FILE_BYTES;
}

/** Formats a `text/` prefix misses but that are still text a prompt can carry. */
const TEXTUAL_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-yaml",
  "application/yaml",
  "application/sql",
]);

function looksTextual(file: File): boolean {
  return file.type.startsWith("text/") || TEXTUAL_MIME_TYPES.has(file.type);
}

/**
 * The refusal a rejected file deserves. A binary the agent has no tool for is not
 * "oversized text" — that message was the original bug: every non-image took the
 * text branch, so a PDF was reported against a limit that had nothing to do with it.
 */
function unsupportedMessage(file: File): string {
  // Text only reaches "unsupported" by being past the *upload* cap now — below it
  // a large text file is copied in and referenced, so quoting the 512 KB inline
  // limit here would name a limit that is no longer the one it hit.
  if (looksTextual(file)) return `${file.name}: file too large to upload (max 25 MB)`;
  return `${file.name}: unsupported file type${file.type ? ` (${file.type})` : ""}`;
}

function uploadFailureMessage(file: File, error: unknown): string {
  if (error instanceof UploadError) {
    if (error.reason === "denied") return `${file.name}: cannot upload — the workspace is read-only`;
    if (error.reason === "too-large") return `${file.name}: file too large to upload (max 25 MB)`;
    // The server already phrased why the name or body was unacceptable; prefixing
    // "upload failed" onto it just says the same thing twice.
    if (error.reason === "invalid") return `${file.name}: ${error.message}`;
    return `${file.name}: upload failed — ${error.message}`;
  }
  return `${file.name}: upload failed`;
}

type FileOutcome = { attachments: Attachment[]; errors: string[] };

async function attachInlineText(file: File): Promise<FileOutcome> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    // A file moved or revoked between the drop and the read. Reported rather than
    // thrown: this runs inside a settle-all, and one unreadable file must not
    // reject the batch and take every other file's result with it.
    return { attachments: [], errors: [`${file.name}: could not be read`] };
  }
  // A NUL byte means this was never text, whatever its size said
  if (text.includes("\0")) return { attachments: [], errors: [`${file.name}: unsupported binary file`] };
  return {
    attachments: [{ name: file.name, kind: "text", data: text, mimeType: file.type || "text/plain", source: "manual" }],
    errors: [],
  };
}

/**
 * An image the model can see: its bytes, and nothing else.
 *
 * Deliberately no upload. The copy would be a file nothing ever references —
 * the prompt carries the bytes, and no cleanup exists — so it would cost a
 * git-dirtying write and a full round trip of latency on the single most common
 * attachment there is, pasting a screenshot, in exchange for nothing the user
 * asked for.
 */
async function attachImageBytes(file: File): Promise<FileOutcome> {
  try {
    const data = await readAsBase64(file);
    return { attachments: [{ name: file.name, kind: "image", data, mimeType: file.type, source: "manual" }], errors: [] };
  } catch {
    return { attachments: [], errors: [`${file.name}: could not be read`] };
  }
}

/**
 * Copy the file into the workspace and attach the path the server wrote.
 *
 * Everything that comes here travels *as* the path: a document with an extraction
 * tool behind it, text too big to inline, or an image past the image limit whose
 * bytes the model would refuse anyway. A failed upload is therefore fatal for all
 * of them — there is no second way to carry the file, and a reference to a path
 * that was never written is worse than an error.
 */
async function uploadAndAttach(file: File, uploadFile: UploadFile): Promise<FileOutcome> {
  // Checked before reading the file: an oversized drop is refused without
  // spending a 34 MB send to be told the same thing.
  if (file.size > MAX_UPLOAD_BYTES) {
    return { attachments: [], errors: [`${file.name}: file too large to upload (max 25 MB)`] };
  }
  let base64: string;
  try {
    base64 = await readAsBase64(file);
  } catch {
    return { attachments: [], errors: [`${file.name}: could not be read`] };
  }
  try {
    return { attachments: [pathAttachment(await uploadFile(file.name, base64))], errors: [] };
  } catch (error) {
    return { attachments: [], errors: [uploadFailureMessage(file, error)] };
  }
}

/**
 * Turn files supplied from outside the workspace — a drop, the composer's attach
 * button, a paste — into composer attachments.
 *
 * Uploads run concurrently and every file settles: one refusal in a multi-file
 * drop must not discard the files that were fine. A file that fails to upload
 * contributes an error and no attachment, so the composer never holds a reference
 * to a path that was never written.
 */
export async function filesToAttachments(
  files: Iterable<File>,
  uploadFile: UploadFile,
): Promise<{ attachments: Attachment[]; errors: string[] }> {
  const outcomes = await Promise.all(
    [...files].map((file): Promise<FileOutcome> => {
      const kind = classifyDroppedFile(file);
      if (kind === "unsupported") return Promise.resolve({ attachments: [], errors: [unsupportedMessage(file)] });
      if (kind === "inline-text") return attachInlineText(file);
      if (kind === "image" && file.size <= MAX_IMAGE_FILE_BYTES) return attachImageBytes(file);
      return uploadAndAttach(file, uploadFile);
    }),
  );
  return {
    attachments: outcomes.flatMap((outcome) => outcome.attachments),
    errors: outcomes.flatMap((outcome) => outcome.errors),
  };
}

/**
 * Turns the file shown in the viewer into a path reference for the composer. No size
 * limit applies: the prompt carries the path, and the agent reads whatever it needs.
 */
export function textPreviewToAttachment(path: string): Attachment {
  return { ...pathAttachment(path), source: "preview", previewPath: path };
}

/**
 * A displayed PDF, referenced by path rather than carried as bytes: the agent has
 * a tool that reads a PDF at a path, so the prompt never pays for the document.
 */
export function pdfPreviewToAttachment(path: string): Attachment {
  return textPreviewToAttachment(path);
}

/**
 * Already-typed `@src/App.tsx` — an attachment chip must not add it a second time.
 * Sentence punctuation may follow the path ("…@src/App.tsx, please"), but another
 * path character must not: `@src/App.tsx.bak` names a different file.
 */
function mentions(text: string, path: string): boolean {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)@${escaped}[,.;:!?)\\]]*(\\s|$)`).test(text);
}

/**
 * Paths the user named with `@` in their draft. They reference a file just as an
 * attachment does, so the tree marks them too — the file tree cannot see the composer's
 * text on its own. Trailing sentence punctuation is not part of the path.
 *
 * Re-exported from `@pi-outpost/shared/mentions`, which the server parses the same
 * mentions with — kept as one rule so the two cannot drift apart.
 */
export const mentionedPaths = sharedMentionedPaths;

/**
 * The prompt the composer sends: typed text, then previewed paths as `@` mentions and
 * dropped text files as fenced blocks. Images ride alongside as WireImage values.
 */
export function composePrompt(text: string, attachments: Attachment[]): string {
  let full = text.trim();
  const append = (part: string) => {
    full += `${full ? "\n\n" : ""}${part}`;
  };
  for (const attachment of attachments) {
    if (attachment.kind === "path") {
      if (!mentions(full, attachment.data)) append(`@${attachment.data}`);
    } else if (attachment.kind === "text") {
      append(`\`\`\`${attachment.name}\n${attachment.data}\n\`\`\``);
    }
  }
  return full;
}

/** Fetches an image through the same confined raw-file endpoint the viewer uses. */
export async function imagePreviewToAttachment(path: string, url: string): Promise<Attachment | string> {
  try {
    const response = await fetch(url);
    if (!response.ok) return `${path}: unable to read preview image for attachment`;
    const mimeType = response.headers.get("Content-Type")?.split(";", 1)[0] ?? "";
    if (!mimeType.startsWith("image/")) return `${path}: preview is not a supported image attachment`;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_FILE_BYTES) return `${path}: image too large (max 7 MB)`;
    return { name: path, kind: "image", data: bytesToBase64(bytes), mimeType, source: "preview", previewPath: path };
  } catch {
    return `${path}: unable to read preview image for attachment`;
  }
}

/** A file picked in the tree: referenced by path, so it stays alongside the preview's own reference. */
export function pathAttachment(path: string): Attachment {
  return { name: path, kind: "path", data: path, mimeType: "text/plain", source: "manual" };
}

/** Adds a path reference unless that path is already attached (from the tree or the preview). */
export function addPathAttachment(attachments: Attachment[], path: string): Attachment[] {
  if (attachments.some((current) => current.kind === "path" && current.data === path)) return attachments;
  return [...attachments, pathAttachment(path)];
}

/** Replaces only the automatic preview attachment, preserving manual files. */
export function replacePreviewAttachment(attachments: Attachment[], attachment: Attachment): Attachment[] {
  return [...attachments.filter((current) => current.source !== "preview"), attachment];
}

/** Removes exactly the chip selected in the composer, including a preview chip. */
export function removeAttachment(attachments: Attachment[], index: number): Attachment[] {
  return attachments.filter((_, currentIndex) => currentIndex !== index);
}
