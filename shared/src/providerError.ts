/**
 * What a failed request from a model provider should say in a chat bubble.
 *
 * Providers do not fail in JSON. A proxy in front of one answers with a whole
 * HTML page, and the SDK hands that body on verbatim, so a gateway timeout
 * reached the transcript as:
 *
 *   504 <html><body><h1>504 Gateway Time-out</h1> The server didn't respond in
 *   time. </body></html>
 *
 * Every word a reader needs is in there, wrapped in markup that is not for them.
 * This turns such a body into one line, and leaves anything that was already a
 * sentence alone — a provider that writes a plain message is the normal case and
 * must not be reworded or cut. Only text recovered from a page is bounded.
 *
 * Deliberately not a parser: the input is whatever an unknown intermediary chose
 * to send, so this reads as "recover the words", never "understand the document".
 */

/**
 * Bounds what is recovered from a page, and nothing else.
 *
 * A page is furniture around a sentence, and the sentence is near the top, so
 * cutting the rest costs nothing. Prose is not bounded at all: see below.
 */
const MAX_RECOVERED_LENGTH = 300;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
  nbsp: " ",
};

const decodeEntities = (text: string): string =>
  text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
    const known = ENTITIES[name.toLowerCase()];
    if (known !== undefined) return known;
    const numeric = /^#x/i.test(name)
      ? Number.parseInt(name.slice(2), 16)
      : /^#/.test(name)
        ? Number.parseInt(name.slice(1), 10)
        : Number.NaN;
    return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : whole;
  });

/** Whether this body is markup rather than a message somebody wrote to be read. */
const looksLikeMarkup = (text: string): boolean => /<\s*(!doctype|html|body|head|h[1-6]|p|div|title|center|pre)\b/i.test(text);

function textFromMarkup(markup: string): string {
  const withoutInvisible = markup
    // Script and style carry text that is not prose, and reads as noise.
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  return decodeEntities(withoutInvisible.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * One readable line for a provider failure.
 *
 * The status code a caller prefixed is kept, and dropped from the recovered text
 * when the page repeats it — "504 504 Gateway Time-out" says nothing twice.
 */
export function describeProviderError(raw: string): string {
  const input = raw?.trim() ?? "";
  if (input === "") return input;
  // Untouched, at any length. A provider that writes prose is explaining itself,
  // and the explanation is the whole value of the bubble: a tool-call parser
  // quoting the 2 KB of model output it choked on is the diagnosis, not noise to
  // be capped — a 300-character cut lands mid-quote and hides the offending byte.
  // A pathologically long answer is information about the provider in its own
  // right, so it is shown rather than summarized away.
  if (!looksLikeMarkup(input)) return input;

  const start = input.search(/<\s*(!doctype|html|body|head|h[1-6]|p|div|title|center|pre)\b/i);
  const prefix = input.slice(0, start).trim();
  const recovered = textFromMarkup(input.slice(start));
  if (recovered === "") return prefix === "" ? input : prefix;

  const status = /^\d{3}$/.test(prefix) ? prefix : "";
  // "504" then "504 Gateway Time-out": the page already opens with the code.
  const body = status !== "" && recovered.startsWith(`${status} `) ? recovered.slice(status.length + 1) : recovered;
  const line = [status !== "" ? status : prefix, body].filter((part) => part !== "").join(" ");
  return line.length > MAX_RECOVERED_LENGTH ? `${line.slice(0, MAX_RECOVERED_LENGTH - 1).trimEnd()}…` : line;
}
