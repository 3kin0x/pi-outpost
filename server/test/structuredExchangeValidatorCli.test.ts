/**
 * The reference validator, as an external producer receives it.
 *
 * Everything else in this suite exercises the rules through the repository's own
 * modules. This runs the built bundle, from a directory with no access to the
 * repository, the way an MCP server or a producer's build would — which is the only
 * way the two failures this has already had could have been caught: a schema read
 * from a path that only resolves inside the checkout, and a duplicated shebang that
 * made the bundle a syntax error while every in-repo test stayed green.
 */
import assert from "node:assert/strict";
import { execFileSync, execFileSync as run } from "node:child_process";
import { copyFileSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { before, describe, test } from "node:test";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BUNDLE = path.join(REPO, "shared/dist/validate-structured-exchange.mjs");

/** Somewhere with no node_modules, no package.json, and no path back to the repo. */
const away = mkdtempSync(path.join(tmpdir(), "structured-exchange-cli-"));
const cli = path.join(away, "validate-structured-exchange.mjs");

const graph = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    schema: "urn:structured-exchange:1",
    kind: "graph",
    data: { nodes: [{ id: "a", label: "A" }], edges: [] },
    ...over,
  });

/** Runs the CLI and reports what a caller driving it from a build would see. */
function validate(args: string[], input?: string): { code: number; verdict: Record<string, unknown> } {
  try {
    const stdout = run(process.execPath, [cli, ...args], {
      cwd: away,
      input: input ?? "",
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "" },
    });
    return { code: 0, verdict: JSON.parse(stdout) };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    assert.equal(failure.stderr, "", `the CLI wrote to stderr: ${failure.stderr}`);
    return { code: failure.status, verdict: JSON.parse(failure.stdout) };
  }
}

describe("the reference validator as it ships", () => {
  before(() => {
    if (!existsSync(BUNDLE)) {
      execFileSync(process.execPath, [path.join(REPO, "shared/scripts/build-validator.mjs")], {
        cwd: REPO,
        stdio: "ignore",
      });
    }
    copyFileSync(BUNDLE, cli);
    writeFileSync(path.join(away, "good.json"), graph());
    writeFileSync(path.join(away, "not-json.txt"), "{ this is not json");
    writeFileSync(
      path.join(away, "unconforming.json"),
      graph({ data: { nodes: [{ id: "a", ref: "R", set: { label: "New" } }], edges: [] } }),
    );
  });

  test("runs at all, outside the repository, with nothing installed", () => {
    // A path resolved relative to the module, or a stray shebang, fails only here.
    const { code, verdict } = validate(["good.json"]);
    assert.equal(code, 0);
    assert.equal(verdict.valid, true);
  });

  test("reads standard input when given no file", () => {
    const { code, verdict } = validate([], graph());
    assert.equal(code, 0);
    assert.equal(verdict.valid, true);
  });

  test("reports what the document is, not merely that it passed", () => {
    const { verdict } = validate(["good.json"]);
    assert.equal(verdict.kind, "graph");
    assert.ok(verdict.measurement, "a producer sizing its output needs the measurement back");
  });

  // The exit codes are the interface for anything driving this from a build, and
  // three different problems must not arrive as one.
  test("exits 1 for a document that was read and does not conform", () => {
    const { code, verdict } = validate(["unconforming.json"]);
    assert.equal(code, 1);
    assert.equal(verdict.valid, false);
    assert.deepEqual((verdict.issues as { rule: string }[]).map((issue) => issue.rule), ["change-without-target"]);
  });

  test("exits 2 when the input cannot be read, rather than blaming the schema", () => {
    const { code, verdict } = validate(["absent.json"]);
    assert.equal(code, 2);
    assert.equal((verdict.issues as { rule: string }[])[0].rule, "unreadable-input");
  });

  test("exits 3 when the input is not JSON", () => {
    const { code, verdict } = validate(["not-json.txt"]);
    assert.equal(code, 3);
    assert.equal((verdict.issues as { rule: string }[])[0].rule, "not-json");
  });

  test("says how to use it, and documents its exit codes where a caller will look", () => {
    const help = run(process.execPath, [cli, "--help"], { cwd: away, encoding: "utf8" });
    for (const stated of ["0", "1", "2", "3", "standard input"]) assert.match(help, new RegExp(stated));
  });

  test("agrees with the application on every conformance case", () => {
    // Two implementations of one contract that disagree are two contracts.
    const suite = path.join(REPO, "shared/conformance");
    const index = JSON.parse(run("cat", [path.join(suite, "index.json")], { encoding: "utf8" }));

    for (const entry of index.valid as { file: string }[]) {
      const { code } = validate([path.join(suite, entry.file)]);
      assert.equal(code, 0, `${entry.file} should be accepted`);
    }
    for (const entry of index.invalid as { file: string; expectedRule?: string }[]) {
      const { code, verdict } = validate([path.join(suite, entry.file)]);
      assert.ok(code === 1 || code === 3, `${entry.file} should be refused, got exit ${code}`);
      if (entry.expectedRule !== undefined) {
        const rules = (verdict.issues as { rule: string }[]).map((issue) => issue.rule);
        assert.ok(rules.includes(entry.expectedRule), `${entry.file}: expected ${entry.expectedRule}, got ${rules.join(", ")}`);
      }
    }
  });
});
