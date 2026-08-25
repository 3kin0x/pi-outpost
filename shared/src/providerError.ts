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
 * must not be reworded.
 *
 * Deliberately not a parser: the input is whatever an unknown intermediary chose
 * to send, so this reads as "recover the words", never "understand the document".
 */

/** Long enough for a real explanation, short enough to stay a bubble. */
const MAX_LENGTH = 300;

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
  if (!looksLikeMarkup(input)) return input.length > MAX_LENGTH ? `${input.slice(0, MAX_LENGTH - 1).trimEnd()}…` : input;

  const start = input.search(/<\s*(!doctype|html|body|head|h[1-6]|p|div|title|center|pre)\b/i);
  const prefix = input.slice(0, start).trim();
  const recovered = textFromMarkup(input.slice(start));
  if (recovered === "") return prefix === "" ? input : prefix;

  const status = /^\d{3}$/.test(prefix) ? prefix : "";
  // "504" then "504 Gateway Time-out": the page already opens with the code.
  const body = status !== "" && recovered.startsWith(`${status} `) ? recovered.slice(status.length + 1) : recovered;
  const line = [status !== "" ? status : prefix, body].filter((part) => part !== "").join(" ");
  return line.length > MAX_LENGTH ? `${line.slice(0, MAX_LENGTH - 1).trimEnd()}…` : line;
}
