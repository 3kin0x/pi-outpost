#!/usr/bin/env node
/**
 * Generates the browser's schema check from the committed schema.
 *
 * The browser needs a verdict, not a diagnosis: everyone who has to *act* on a
 * refusal — a producer, the agent correcting a proposal, an operator calibrating a
 * limit — reads it from the command-line interface or the server, both of which
 * run in Node and carry the full validator. What the browser decides is only
 * whether to render or fall back, and for that a boolean is enough.
 *
 * Generating it rather than hand-writing it is the whole point: a check written by
 * hand from the schema is a second contract that drifts. This one is derived, and
 * `structuredExchangeGeneratedCheck.test.ts` regenerates and compares, so a schema
 * edit that forgets this step fails the build instead of shipping a stale check.
 *
 *   node --import tsx/esm shared/scripts/generate-structured-exchange-check.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Code } from "typebox/compile";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = path.resolve(HERE, "../schemas/structured-exchange-1.json");
const OUTPUT = path.resolve(HERE, "../src/generated/structuredExchangeCheck.ts");

const HEADER = `/**
 * GENERATED from shared/schemas/structured-exchange-1.json — do not edit.
 *
 * Regenerate with:
 *   node --import tsx/esm shared/scripts/generate-structured-exchange-check.mjs
 *
 * A boolean check of the published schema, small enough to ship to the browser.
 * Diagnostics live in the Node-side validator; see structuredExchangeSchemaNode.ts.
 */
/* eslint-disable */
// @ts-nocheck
`;

/**
 * The compiler hoists the `additionalProperties` patterns out as external
 * variables, so the generated module has to be handed them before its check will
 * run. They are plain regular expressions; emitting their source keeps the
 * generated file self-contained, which is what makes it a drop-in for the
 * browser.
 */
function externalsLiteral(variables) {
  const sources = variables.map((variable) => {
    if (!(variable instanceof RegExp)) {
      throw new Error(`unexpected external of type ${Object.prototype.toString.call(variable)}`);
    }
    return `  new RegExp(${JSON.stringify(variable.source)}, ${JSON.stringify(variable.flags)}),`;
  });
  return `\nSetExternal({ variables: [\n${sources.join("\n")}\n] })\n`;
}

export function generate() {
  const schema = JSON.parse(readFileSync(SCHEMA, "utf8"));
  const compiled = Code(schema);
  return `${HEADER}${compiled.Code}\n${externalsLiteral(compiled.External.variables)}`;
}

export const GENERATED_CHECK_PATH = OUTPUT;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(OUTPUT, generate());
  console.log(`wrote ${path.relative(process.cwd(), OUTPUT)}`);
}
