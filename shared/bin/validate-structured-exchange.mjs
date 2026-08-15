#!/usr/bin/env node
/**
 * The reference validation interface.
 *
 * Reads a candidate structured-exchange document from a file or from standard
 * input, applies the committed schema and the same semantic rules the application
 * applies on receipt, and prints a machine-readable verdict. Exits non-zero when
 * the document is refused, so it drops straight into a producer's build or into
 * the agent's own loop before it presents a proposal.
 *
 *   node --import tsx/esm shared/bin/validate-structured-exchange.mjs doc.json
 *   cat doc.json | node --import tsx/esm shared/bin/validate-structured-exchange.mjs
 *
 * The `--import tsx/esm` is needed because the shared modules are TypeScript.
 * A producer built outside this repository does not need this script at all: the
 * portable artifacts are `shared/schemas/structured-exchange-1.json`, which any
 * JSON Schema validator can run, and `shared/conformance/`, which states the
 * expected verdict for every case including the semantic ones.
 */
import { readFileSync } from "node:fs";
import { parseSerializedStructuredExchange } from "../src/structuredExchangeParse.ts";
import { checkStructuredExchangeSchema } from "../src/structuredExchangeSchemaNode.ts";

function readInput(argv) {
  const file = argv.find((argument) => !argument.startsWith("-"));
  if (file !== undefined) return readFileSync(file, "utf8");
  return readFileSync(0, "utf8");
}

function main() {
  let serialized;
  try {
    serialized = readInput(process.argv.slice(2));
  } catch (error) {
    // A document that cannot be read is not a document that failed validation,
    // and saying otherwise would send a producer looking for a schema problem.
    process.stdout.write(
      JSON.stringify({ valid: false, issues: [{ rule: "unreadable-input", path: "", message: String(error) }] }) + "\n",
    );
    process.exit(2);
  }

  const verdict = parseSerializedStructuredExchange(serialized, checkStructuredExchangeSchema);
  if (verdict.valid) {
    process.stdout.write(
      JSON.stringify({ valid: true, kind: verdict.envelope.kind, measurement: verdict.measurement }) + "\n",
    );
    process.exit(0);
  }

  process.stdout.write(JSON.stringify({ valid: false, issues: verdict.issues }) + "\n");
  process.exit(1);
}

main();
