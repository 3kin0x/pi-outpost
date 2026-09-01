/**
 * Finding git, and saying why when it cannot be found.
 *
 * The report behind this: git installed at the path every Windows installer uses,
 * absent from the PATH the server inherited, and a product that answered by removing
 * its whole git surface without a word.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { resetGitExecutable, resolveGitExecutable, standardLocations, useGitExecutable, whyGitCannotServe } from "../src/git.ts";

/** Where this machine's git actually is, for the "configured path" cases. */
const realGit = execFileSync(process.platform === "win32" ? "where" : "which", ["git"], { encoding: "utf8" })
  .split("\n")[0]
  .trim();

/** Run `body` with PATH emptied, so only the candidate list can answer. */
async function withoutPath<T>(body: () => Promise<T>): Promise<T> {
  const saved = process.env.PATH;
  process.env.PATH = "";
  try {
    return await body();
  } finally {
    process.env.PATH = saved;
  }
}

// ---------------------------------------------------------------------------
describe("resolving the git executable", () => {
  test("uses the git on PATH when there is one", async () => {
    assert.equal(await resolveGitExecutable(), "git");
  });

  test("finds an installed git when PATH has lost it", async () => {
    const found = await withoutPath(() => resolveGitExecutable(undefined, [realGit]));
    assert.equal(found, realGit);
  });

  test("prefers a configured path over the one on PATH", async () => {
    assert.equal(await resolveGitExecutable(realGit), realGit);
  });

  test("fails on a configured path that cannot run, rather than falling through", async () => {
    // Naming an executable is an instruction: silently running a different git would
    // answer questions about the wrong installation
    await assert.rejects(
      () => resolveGitExecutable(path.join(tmpdir(), "no-such-git"), [realGit]),
      (error: Error) => error.message.includes("no-such-git") && /not a runnable git/i.test(error.message),
    );
  });

  test("fails, naming what it tried, when there is no git anywhere", async () => {
    await assert.rejects(
      () => withoutPath(() => resolveGitExecutable(undefined, [path.join(tmpdir(), "nowhere", "git")])),
      (error: Error) => /could not be found/i.test(error.message) && error.message.includes("nowhere"),
    );
  });
});

// ---------------------------------------------------------------------------
describe("where it is willing to look", () => {
  test("never at a relative path, and never below the working directory", () => {
    // A candidate the workspace could contribute is a workspace choosing which binary
    // the server runs on its behalf
    for (const candidate of standardLocations()) {
      assert.ok(path.isAbsolute(candidate), `${candidate} is not absolute`);
      assert.equal(candidate.startsWith(process.cwd() + path.sep), false, `${candidate} is under the working directory`);
    }
  });
});

// ---------------------------------------------------------------------------
describe("saying why git is unavailable", () => {
  let root: string;

  before(async () => {
    root = await realpath(mkdtempSync(path.join(tmpdir(), "pi-why-")));
  });

  after(() => {
    resetGitExecutable();
    rmSync(root, { recursive: true, force: true });
  });

  test("names the executable when none was ever resolved", async () => {
    resetGitExecutable();
    const why = await whyGitCannotServe(root, []);
    assert.equal(why?.reason, "no-executable");
  });

  test("says there is no repository, for a directory that simply is not one", async () => {
    useGitExecutable(realGit);
    const why = await whyGitCannotServe(root, []);
    assert.deepEqual(why, { reason: "no-repository" });
  });

  // chmod is advisory on Windows, so a repository cannot be made unreadable there. The
  // classification itself is covered on every platform by the unrecognised-failure test
  // below, which is the one that matters: the reading, not the particular refusal.
  test("says git refused, and carries its own words, for a repository it cannot read", { skip: process.platform === "win32" }, async () => {
    useGitExecutable(realGit);
    const refused = path.join(root, "refused");
    mkdirSync(refused, { recursive: true });
    execFileSync(realGit, ["init", "-q"], { cwd: refused });
    // A refusal git states in its own words, the way dubious ownership does in the
    // field — and unlike `GIT_TEST_ASSUME_DIFFERENT_OWNER`, present in every git
    chmodSync(path.join(refused, ".git", "config"), 0o000);
    try {
      const why = await whyGitCannotServe(refused, []);
      assert.equal(why?.reason, "refused", `expected a refusal, got ${JSON.stringify(why)}`);
      // Git's words are the remedy; paraphrasing loses the path it names
      assert.match(why?.reason === "refused" ? why.message : "", /permission denied/i);
    } finally {
      chmodSync(path.join(refused, ".git", "config"), 0o644);
    }
  });

  // openlore: scenario=ARepositoryGitRefuses spec=git
  test("catches a repository git will not read, though the disk says it is one", { skip: process.platform === "win32" }, async () => {
    // Discovery finds `.git` on disk and never asks git whether it will read it, so a
    // refused repository used to look perfectly healthy and fail every command in
    // silence — the branch chip sat on "…" forever
    useGitExecutable(realGit);
    const held = path.join(root, "held");
    mkdirSync(held, { recursive: true });
    execFileSync(realGit, ["init", "-q"], { cwd: held });
    chmodSync(path.join(held, ".git", "config"), 0o000);
    try {
      const why = await whyGitCannotServe(root, [{ toplevel: held, cwd: held, id: "held" }]);
      assert.equal(why?.reason, "refused", `a repository nothing can read is not "available"`);
    } finally {
      chmodSync(path.join(held, ".git", "config"), 0o644);
    }
  });

  test("says nothing at all when a discovered repository answers", async () => {
    useGitExecutable(realGit);
    const fine = path.join(root, "fine");
    mkdirSync(fine, { recursive: true });
    execFileSync(realGit, ["init", "-q"], { cwd: fine });
    assert.equal(await whyGitCannotServe(root, [{ toplevel: fine, cwd: fine, id: "fine" }]), undefined);
  });

  test("classifies an unrecognised failure as a refusal, not as an ordinary directory", async () => {
    // The direction that matters, and the one assertion that runs everywhere: burying
    // an unknown failure in the quiet case is the bug this replaces
    useGitExecutable(realGit);
    const why = await whyGitCannotServe(path.join(root, "does-not-exist"), []);
    assert.equal(why?.reason, "refused", `an unrecognised failure must surface, got ${JSON.stringify(why)}`);
  });
});
