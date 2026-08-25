/**
 * `@path` file references inside a composed prompt.
 *
 * The composer writes a browser-root-relative path after `@` as plain text —
 * there is no structured wire field for it, the model reads it as a hint and
 * calls its own tools. Both the client (deduping a mention against an
 * attachment chip) and the server (making that path unambiguous before the
 * model sees it, and readable again on reload) parse the same convention, so
 * it is defined once here rather than twice.
 */

const MENTION_PATTERN = /(?:^|\s)@([^\s@]+)/g;
const TRAILING_PUNCTUATION = new Set([",", ".", ";", ":", "!", "?", ")", "]"]);

/**
 * Drop sentence punctuation from the end of a path, by hand.
 *
 * A trailing-`+` regex here is a polynomial ReDoS (CodeQL #9): anchoring `+`
 * to the end makes the engine retry the run from every position, so a draft
 * holding a long stretch of `!` costs O(n²). This loop is linear.
 */
function withoutTrailingPunctuation(path: string): string {
  let end = path.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(path[end - 1]!)) end--;
  return path.slice(0, end);
}

/**
 * Paths named with `@` in free text. Trailing sentence punctuation
 * ("…@src/App.tsx, please") is not part of the path; another path character
 * is ("@src/App.tsx.bak" names a different file).
 */
export function mentionedPaths(text: string): string[] {
  const found = text.matchAll(MENTION_PATTERN);
  return [...found].map(([, path]) => withoutTrailingPunctuation(path ?? "")).filter((path) => path.length > 0);
}

/**
 * Rewrites each `@path` mention text finds, replacing `path` with whatever
 * `resolve` answers for it — the `@` and any trailing punctuation are left
 * exactly as typed. `resolve` returning `undefined` leaves that mention
 * untouched (the model sees exactly what it would have without this call).
 *
 * Async because the server's use of this — making a mentioned path absolute —
 * needs the filesystem (symlink resolution, confinement). The reverse
 * direction, turning an absolutized mention back into its relative form for
 * display, is pure string math; `rewriteMentionedPathsSync` below is that one,
 * kept separate so it can run inside otherwise-synchronous history conversion.
 */
export async function rewriteMentionedPaths(
  text: string,
  resolve: (path: string) => Promise<string | undefined>,
): Promise<string> {
  const matches = [...text.matchAll(MENTION_PATTERN)];
  if (matches.length === 0) return text;
  const changes = await Promise.all(
    matches.map(async (match) => {
      const raw = match[1] ?? "";
      const path = withoutTrailingPunctuation(raw);
      if (!path) return undefined;
      const next = await resolve(path);
      return next !== undefined && next !== path ? { raw, path, next } : undefined;
    }),
  );
  return applyMentionChanges(text, changes);
}

/** Sync counterpart of {@link rewriteMentionedPaths} — see its doc for why both exist. */
export function rewriteMentionedPathsSync(text: string, resolve: (path: string) => string | undefined): string {
  const matches = [...text.matchAll(MENTION_PATTERN)];
  if (matches.length === 0) return text;
  const changes = matches.map((match) => {
    const raw = match[1] ?? "";
    const path = withoutTrailingPunctuation(raw);
    if (!path) return undefined;
    const next = resolve(path);
    return next !== undefined && next !== path ? { raw, path, next } : undefined;
  });
  return applyMentionChanges(text, changes);
}

interface MentionChange {
  /** Exactly what followed `@` in the source text, punctuation included. */
  raw: string;
  /** `raw` with trailing punctuation stripped — what `resolve` was asked about. */
  path: string;
  /** What `resolve` answered — replaces `path`, keeping `raw`'s own trailing punctuation. */
  next: string;
}

/**
 * Every mention with the same `raw` text names the same file, so replacing all
 * of them with the same substitution is correct — not just the first. A plain
 * split/join is exact here (no regex escaping to get wrong): `raw` came from
 * `matchAll` on this same text, so it is a literal substring of it.
 */
function applyMentionChanges(text: string, changes: (MentionChange | undefined)[]): string {
  let out = text;
  for (const change of changes) {
    if (!change) continue;
    const trailing = change.raw.slice(change.path.length);
    out = out.split(`@${change.raw}`).join(`@${change.next}${trailing}`);
  }
  return out;
}
