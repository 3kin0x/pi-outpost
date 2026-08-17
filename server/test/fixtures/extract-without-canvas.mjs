/**
 * Extracts the fixtures named on the command line and prints one JSON line
 * describing what happened to each.
 *
 * Runs as its own process because the thing under test is a global that only one
 * process can have in one state: the suite has already imported pdf.js with a
 * `DOMMatrix` in place, and the regression only shows up where there is none.
 *
 *   node --require test/fixtures/no-native-canvas.cjs --import tsx/esm \
 *        test/fixtures/extract-without-canvas.mjs pdf-text pdf-type3
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPdf } from "../../src/pdf.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const results = {};

for (const name of process.argv.slice(2)) {
  try {
    const bytes = new Uint8Array(await readFile(path.join(HERE, `${name}.pdf`)));
    results[name] = { ok: true, markdown: (await extractPdf(bytes)).markdown };
  } catch (error) {
    results[name] = { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

console.log(JSON.stringify({ results, domMatrix: globalThis.DOMMatrix?.name ?? null }));
