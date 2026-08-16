/**
 * The conformance suite, run against both callers.
 *
 * The suite exists so a producer built elsewhere can check itself without reading
 * our source. That promise is only worth something if the suite is accurate here
 * first — and if the command-line interface and the application parser agree on
 * every case, since a producer validating with one and being refused by the other
 * would have been better off with no contract at all.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { parseSerializedStructuredExchange } from "@pi-outpost/shared/structured-exchange/parse";
import { checkStructuredExchangeSchema } from "@pi-outpost/shared/structured-exchange/schema-node";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUITE = path.resolve(HERE, "../../shared/conformance");
const CLI = path.resolve(HERE, "../../shared/bin/validate-structured-exchange.mjs");
const index = JSON.parse(readFileSync(path.join(SUITE, "index.json"), "utf8")) as {
  valid: { file: string }[];
  invalid: { file: string; expectedRule: string }[];
};

const read = (file: string) => readFileSync(path.join(SUITE, file), "utf8");

/** The command-line interface's verdict, and the status it exited with. */
function cliVerdict(file: string): { status: number; body: { valid: boolean; issues?: { rule: string }[] } } {
  try {
    const stdout = execFileSync(process.execPath, ["--import", "tsx/esm", CLI, path.join(SUITE, file)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, body: JSON.parse(stdout) };
  } catch (error) {
    const failure = error as { status: number; stdout: string };
    return { status: failure.status, body: JSON.parse(failure.stdout) };
  }
}

const parse = (file: string) => parseSerializedStructuredExchange(read(file), checkStructuredExchangeSchema);

describe("structured-exchange conformance suite", () => {
  test("the suite is not empty in either direction", () => {
    assert.ok(index.valid.length > 0);
    assert.ok(index.invalid.length > 0);
  });

  describe("documents the contract accepts", () => {
    for (const { file } of index.valid) {
      test(file, () => {
        const verdict = parse(file);
        assert.equal(
          verdict.valid,
          true,
          verdict.valid ? "" : `refused: ${verdict.issues.map((issue) => `${issue.rule}@${issue.path}`).join(", ")}`,
        );
      });
    }
  });

  describe("documents the contract refuses, for the stated reason", () => {
    for (const { file, expectedRule } of index.invalid) {
      test(`${file} → ${expectedRule}`, () => {
        const verdict = parse(file);
        assert.equal(verdict.valid, false, "expected this document to be refused");
        if (verdict.valid) return;
        const rules = verdict.issues.map((issue) => issue.rule);
        assert.ok(rules.includes(expectedRule), `expected ${expectedRule}, got ${rules.join(", ")}`);
      });
    }
  });

  describe("the command-line interface agrees with the parser", () => {
    for (const { file } of index.valid) {
      test(`accepts ${file} and exits zero`, () => {
        const { status, body } = cliVerdict(file);
        assert.equal(status, 0);
        assert.equal(body.valid, true);
      });
    }

    for (const { file, expectedRule } of index.invalid) {
      test(`refuses ${file} with ${expectedRule} and exits non-zero`, () => {
        const { status, body } = cliVerdict(file);
        assert.equal(status, 1);
        assert.equal(body.valid, false);
        assert.ok(
          body.issues?.some((issue) => issue.rule === expectedRule),
          `expected ${expectedRule}, got ${body.issues?.map((issue) => issue.rule).join(", ")}`,
        );
      });
    }
  });

  test("an unreadable input is distinguished from an invalid one", () => {
    // Exit 2, not 1: a producer's build should not report a missing file as a
    // contract violation and send someone looking at their schema.
    try {
      execFileSync(process.execPath, ["--import", "tsx/esm", CLI, path.join(SUITE, "does-not-exist.json")], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      assert.fail("expected a non-zero exit");
    } catch (error) {
      const failure = error as { status: number; stdout: string };
      assert.equal(failure.status, 2);
      assert.equal(JSON.parse(failure.stdout).issues[0].rule, "unreadable-input");
    }
  });
});
