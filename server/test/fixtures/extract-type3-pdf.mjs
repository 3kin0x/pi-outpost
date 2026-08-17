/**
 * Extracts the Type3 fixture and prints one JSON line describing what happened.
 *
 * Runs as its own process because the thing under test is a global that only one
 * process can have in one state: the suite has already imported pdf.js with a
 * `DOMMatrix` in place, and the regression only shows up where there is none.
 *
 *   node --require test/fixtures/no-native-canvas.cjs --import tsx/esm \
 *        test/fixtures/extract-type3-pdf.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPdf } from "../../src/pdf.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));

try {
  const bytes = new Uint8Array(await readFile(path.join(HERE, "pdf-type3.pdf")));
  const result = await extractPdf(bytes);
  console.log(
    JSON.stringify({
      ok: true,
      markdown: result.markdown,
      domMatrix: globalThis.DOMMatrix?.name ?? null,
    }),
  );
} catch (error) {
  console.log(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }));
}
