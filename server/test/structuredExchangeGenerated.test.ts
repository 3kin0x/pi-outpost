/**
 * The generated browser check, against the schema it came from.
 *
 * Generating rather than hand-writing was the whole argument for shipping a check
 * to the browser at all: a hand-written one is a second contract that drifts.
 * That argument only holds if a schema edit that forgets to regenerate *fails*,
 * which is what the first test here is for.
 *
 * The second is the more interesting one: the browser check and the Node
 * validator must reach the same verdict on every conformance case. They differ in
 * how much they can say about a refusal, never in whether to refuse.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { generate, GENERATED_CHECK_PATH } from "../../shared/scripts/generate-structured-exchange-check.mjs";
import { checkStructuredExchangeSchemaInBrowser } from "@pi-outpost/shared/structured-exchange/schema-browser";
import { checkStructuredExchangeSchema } from "@pi-outpost/shared/structured-exchange/schema-node";

const SUITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../shared/conformance");
const index = JSON.parse(readFileSync(path.join(SUITE, "index.json"), "utf8")) as {
  valid: { file: string }[];
  invalid: { file: string; expectedRule: string }[];
};

describe("generated browser check", () => {
  test("is up to date with the committed schema", () => {
    const committed = readFileSync(GENERATED_CHECK_PATH, "utf8");

    assert.equal(
      committed,
      generate(),
      "the generated check is stale — run: node --import tsx/esm shared/scripts/generate-structured-exchange-check.mjs",
    );
  });

  describe("agrees with the Node validator on every conformance case", () => {
    for (const { file } of index.valid) {
      test(`accepts ${file}`, () => {
        const document = JSON.parse(readFileSync(path.join(SUITE, file), "utf8"));
        assert.deepEqual(checkStructuredExchangeSchemaInBrowser(document), []);
      });
    }

    for (const { file, expectedRule } of index.invalid) {
      test(`matches the Node verdict for ${file}`, () => {
        const document = JSON.parse(readFileSync(path.join(SUITE, file), "utf8"));
        const nodeIssues = checkStructuredExchangeSchema(document);
        const browserIssues = checkStructuredExchangeSchemaInBrowser(document);

        // Cases refused by a semantic rule pass *schema* validation in both, and
        // are caught by the shared semantic validator that runs after it.
        const schemaRefused = expectedRule.startsWith("schema/");
        assert.equal(
          browserIssues.length > 0,
          schemaRefused,
          `browser and expectation disagree for ${file} (${expectedRule})`,
        );
        assert.equal(
          nodeIssues.length > 0,
          browserIssues.length > 0,
          `Node said ${nodeIssues.length} issue(s), browser said ${browserIssues.length} for ${file}`,
        );
      });
    }
  });

  test("says that a document is wrong without claiming to know why", () => {
    // The precise reason belongs to the reference validator; a browser check that
    // invented one would be reporting detail it does not have.
    const issues = checkStructuredExchangeSchemaInBrowser({ nonsense: true });

    assert.equal(issues.length, 1);
    assert.equal(issues[0].rule, "schema/invalid");
  });
});
