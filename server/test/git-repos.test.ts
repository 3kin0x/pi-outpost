/**
 * A workspace holding a SET of repositories.
 *
 * The motivating layout has none at the root: a directory of independently
 * versioned projects, one repository per child. Everything here is about finding
 * them, attributing a path to one, and keeping git's output inside the root while
 * the working directory is no longer a single fixed place.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
// `realpath` from the promises API, never `realpathSync`: on Windows only the former
// expands a short path (`RUNNER~1` for `runneradmin`), and the code under test
// canonicalises with it - a fixture built the other way compares two names of one
// directory and fails on a difference that is not there.
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { discoverRepos, gitFileLog, gitLog, gitShow, gitStatus, repoFor, type GitRepo } from "../src/git.ts";

function git(cwd: string, ...args: string[]) {
  execFileSync("git", args, { cwd });
}

/** A repository with one commit, at `dir`. */
function makeRepo(dir: string, branch = "main") {
  mkdirSync(dir, { recursive: true });
  git(dir, "init");
  git(dir, "branch", "-M", branch);
  git(dir, "config", "user.email", "test@test");
  git(dir, "config", "user.name", "Test");
  git(dir, "config", "commit.gpgsign", "false");
  writeFileSync(path.join(dir, "README.md"), "# project\n");
  git(dir, "add", ".");
  git(dir, "commit", "-m", `initial commit in ${path.basename(dir)}`);
}

function write(full: string, content: string) {
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

const ids = (repos: readonly GitRepo[]) => repos.map((repo) => repo.id).sort();

// ---------------------------------------------------------------------------
describe("discovering the repositories under a workspace", () => {
  let root: string;

  before(async () => {
    root = await realpath(mkdtempSync(path.join(tmpdir(), "pi-repos-")));
    makeRepo(path.join(root, "projA"));
    makeRepo(path.join(root, "projB"), "release");
    // Not a repository, and not in the way
    write(path.join(root, "notes.md"), "loose\n");
    // Excluded by name, repository or not
    makeRepo(path.join(root, "node_modules", "vendored"));
    // Below the depth bound (root/1/2/3/4/deep)
    makeRepo(path.join(root, "a", "b", "c", "d", "deep"));
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  test("finds a repository in each child directory of a root that is not one", async () => {
    const repos = await discoverRepos(root);
    assert.ok(ids(repos).includes("projA"));
    assert.ok(ids(repos).includes("projB"));
  });

  test("leaves the root itself out when it is no repository", async () => {
    const repos = await discoverRepos(root);
    assert.equal(
      repos.some((repo) => repo.id === ""),
      false,
    );
  });

  test("does not walk into a directory the file browser already excludes", async () => {
    const repos = await discoverRepos(root);
    assert.equal(
      repos.some((repo) => repo.id.startsWith("node_modules")),
      false,
    );
  });

  test("stops at the depth bound rather than walking the whole tree", async () => {
    const repos = await discoverRepos(root);
    assert.equal(
      repos.some((repo) => repo.id.endsWith("deep")),
      false,
    );
  });

  test("orders them deepest first, which is what longest-match reads", async () => {
    const repos = await discoverRepos(root);
    const lengths = repos.map((repo) => repo.id.length);
    assert.deepEqual(lengths, [...lengths].sort((a, b) => b - a));
  });

  test("runs git from the repository itself when it lies under the root", async () => {
    const repos = await discoverRepos(root);
    const projA = repos.find((repo) => repo.id === "projA");
    assert.ok(projA);
    assert.equal(projA!.cwd, projA!.toplevel);
    assert.equal(projA!.toplevel, path.join(root, "projA"));
  });
});

// ---------------------------------------------------------------------------
describe("a repository marker that is a file, not a directory", () => {
  let root: string;

  before(async () => {
    root = await realpath(mkdtempSync(path.join(tmpdir(), "pi-repos-linked-")));
    makeRepo(path.join(root, "main-repo"));
    // A linked work tree writes a `.git` FILE holding a gitdir: pointer
    git(path.join(root, "main-repo"), "worktree", "add", path.join(root, "linked"), "-b", "side");
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  test("counts a linked work tree as a repository of its own", async () => {
    const repos = await discoverRepos(root);
    assert.ok(ids(repos).includes("linked"), `expected "linked" among ${JSON.stringify(ids(repos))}`);
  });

  test("reports the branch checked out in it, not the one next door", async () => {
    const repos = await discoverRepos(root);
    const status = await gitStatus(repos);
    const linked = status.repos.find((repo) => repo.repo === "linked");
    assert.equal(linked?.branch, "side");
  });
});

// ---------------------------------------------------------------------------
describe("a repository reachable only through a symlink out of the root", () => {
  let outside: string;
  let root: string;

  before(async () => {
    outside = await realpath(mkdtempSync(path.join(tmpdir(), "pi-repos-outside-")));
    makeRepo(path.join(outside, "secret"));
    root = await realpath(mkdtempSync(path.join(tmpdir(), "pi-repos-linkroot-")));
    symlinkSync(path.join(outside, "secret"), path.join(root, "secret"));
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  test("is never admitted to the set, so it is never a working directory", async () => {
    const repos = await discoverRepos(root);
    assert.deepEqual(repos, []);
  });
});

// ---------------------------------------------------------------------------
describe("a root the filesystem knows by another name", () => {
  let real: string;
  let alias: string;

  before(async () => {
    // The shape that took CI down on Windows only: `%TEMP%` is a short name there
    // (`RUNNER~1` for `runneradmin`), so a root passed in one form and a child
    // realpath-resolved into the other compared as different trees, and discovery
    // quietly found nothing. A symlinked root reproduces it on any platform.
    real = await realpath(mkdtempSync(path.join(tmpdir(), "pi-repos-real-")));
    makeRepo(path.join(real, "projA"));
    alias = path.join(await realpath(mkdtempSync(path.join(tmpdir(), "pi-repos-alias-"))), "link");
    symlinkSync(real, alias);
  });

  after(() => {
    rmSync(path.dirname(alias), { recursive: true, force: true });
    rmSync(real, { recursive: true, force: true });
  });

  test("still finds the repositories under it", async () => {
    const repos = await discoverRepos(alias);
    assert.deepEqual(ids(repos), ["projA"]);
  });

  test("and runs git from a directory the filesystem agrees is that repository", async () => {
    const [projA] = await discoverRepos(alias);
    assert.equal(projA.cwd, path.join(real, "projA"));
  });
});

// ---------------------------------------------------------------------------
describe("attributing a path to a repository", () => {
  const repos: GitRepo[] = [
    { toplevel: "/w/projA/nested", cwd: "/w/projA/nested", id: "projA/nested" },
    { toplevel: "/w/projA", cwd: "/w/projA", id: "projA" },
    { toplevel: "/above", cwd: "/w", id: "" },
  ];

  test("gives a file to the deepest repository containing it", () => {
    assert.equal(repoFor(repos, "projA/nested/x.ts")?.id, "projA/nested");
    assert.equal(repoFor(repos, "projA/x.ts")?.id, "projA");
  });

  test("falls back to the repository containing the root", () => {
    assert.equal(repoFor(repos, "loose.md")?.id, "");
  });

  test("does not mistake a sibling whose name starts the same way", () => {
    assert.equal(repoFor(repos, "projAlpha/x.ts")?.id, "");
  });

  test("answers null when nothing owns the path and no repository holds the root", () => {
    const nested = repos.filter((repo) => repo.id !== "");
    assert.equal(repoFor(nested, "notes.md"), null);
  });
});

// ---------------------------------------------------------------------------
describe("status across several repositories", () => {
  let root: string;
  let repos: GitRepo[];

  before(async () => {
    root = await realpath(mkdtempSync(path.join(tmpdir(), "pi-repos-status-")));
    makeRepo(path.join(root, "projA"));
    makeRepo(path.join(root, "projB"), "release");
    write(path.join(root, "projA", "README.md"), "# changed\n");
    write(path.join(root, "projB", "fresh.txt"), "new\n");
    repos = await discoverRepos(root);
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  test("reports files from every repository, in browser-root terms", async () => {
    const status = await gitStatus(repos);
    const byPath = Object.fromEntries(status.files.map((file) => [file.path, file.status]));
    assert.equal(byPath["projA/README.md"], "modified");
    assert.equal(byPath["projB/fresh.txt"], "untracked");
  });

  test("reports each repository's own branch", async () => {
    const status = await gitStatus(repos);
    const branches = Object.fromEntries(status.repos.map((repo) => [repo.repo, repo.branch]));
    assert.deepEqual(branches, { projA: "main", projB: "release" });
  });

  test("a scoped read speaks for one repository and says nothing of the other", async () => {
    const projB = repos.find((repo) => repo.id === "projB");
    assert.ok(projB);
    const status = await gitStatus(repos, projB!);
    assert.deepEqual(
      status.repos.map((repo) => repo.repo),
      ["projB"],
    );
    assert.deepEqual(
      status.files.map((file) => file.path),
      ["projB/fresh.txt"],
    );
  });

  test("a single-repository workspace reports exactly one repository, as it always did", async () => {
    const single = await discoverRepos(path.join(root, "projA"));
    const status = await gitStatus(single);
    assert.equal(status.repos.length, 1);
    assert.equal(status.repos[0].repo, "");
    assert.deepEqual(
      status.files.map((file) => file.path),
      ["README.md"],
    );
  });

  test("one repository failing does not blank the others", async () => {
    const broken: GitRepo = { toplevel: path.join(root, "gone"), cwd: path.join(root, "gone"), id: "gone" };
    const status = await gitStatus([...repos, broken]);
    assert.ok(status.files.some((file) => file.path === "projA/README.md"));
    assert.equal(
      status.repos.some((repo) => repo.repo === "gone"),
      false,
    );
    assert.deepEqual(status.missing, ["gone"]);
    assert.equal(status.failures[0].repo, "gone");
    assert.match(status.failures[0].message, /gone|directory|git/i);
  });

  test("but a workspace where every repository fails still surfaces the error", async () => {
    const broken: GitRepo = { toplevel: path.join(root, "gone"), cwd: path.join(root, "gone"), id: "gone" };
    await assert.rejects(() => gitStatus([broken]));
  });
});

// ---------------------------------------------------------------------------
describe("a repository inside the workspace's own repository", () => {
  let root: string;

  before(async () => {
    root = await realpath(mkdtempSync(path.join(tmpdir(), "pi-repos-sub-")));
    const inner = await realpath(mkdtempSync(path.join(tmpdir(), "pi-repos-subsrc-")));
    makeRepo(inner);
    makeRepo(root);
    git(root, "-c", "protocol.file.allow=always", "submodule", "add", inner, "vendor");
    git(root, "-c", "protocol.file.allow=always", "commit", "-m", "add submodule");
    rmSync(inner, { recursive: true, force: true });
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  test("is left to its parent: discovery stops at the work tree it is inside", async () => {
    const repos = await discoverRepos(root);
    assert.deepEqual(ids(repos), [""]);
  });

  test("so the workspace answers for the submodule's files as one repository", async () => {
    const repos = await discoverRepos(root);
    assert.equal(repoFor(repos, "vendor/README.md")?.id, "");
  });
});

// ---------------------------------------------------------------------------
describe("a repository embedded under a browser root that sits inside another", () => {
  let outer: string;
  let root: string;
  let repos: GitRepo[];

  before(async () => {
    // The workspace is a subdirectory of a repository, and holds a repository of its own
    outer = await realpath(mkdtempSync(path.join(tmpdir(), "pi-repos-outer-")));
    makeRepo(outer);
    root = path.join(outer, "workspace");
    mkdirSync(root);
    write(path.join(root, "loose.md"), "not versioned by the child\n");
    makeRepo(path.join(root, "embedded"));
    repos = await discoverRepos(root);
  });

  after(() => rmSync(outer, { recursive: true, force: true }));

  test("holds both: the one containing the root, and the one under it", () => {
    assert.deepEqual(ids(repos), ["", "embedded"]);
  });

  test("runs the containing repository from the browser root, never above it", () => {
    const containing = repos.find((repo) => repo.id === "");
    assert.equal(containing!.cwd, root);
    assert.equal(containing!.toplevel, outer);
  });

  test("gives a file to the embedded repository, and the rest to the container", () => {
    assert.equal(repoFor(repos, "embedded/README.md")?.id, "embedded");
    assert.equal(repoFor(repos, "loose.md")?.id, "");
  });

  test("reports the embedded repository's own files, not one entry standing for it", async () => {
    write(path.join(root, "embedded", "README.md"), "# changed inside\n");
    const status = await gitStatus(repos);
    const paths = status.files.map((file) => file.path);
    assert.ok(paths.includes("embedded/README.md"), `expected the file itself among ${JSON.stringify(paths)}`);
    assert.equal(
      paths.some((entry) => entry === "embedded" || entry === "embedded/"),
      false,
      "the container's single entry for the embedded repository must not read as a file",
    );
  });
});

// ---------------------------------------------------------------------------
describe("history is read from the repository owning the path", () => {
  let root: string;
  let repos: GitRepo[];

  before(async () => {
    root = await realpath(mkdtempSync(path.join(tmpdir(), "pi-repos-log-")));
    makeRepo(path.join(root, "projA"));
    makeRepo(path.join(root, "projB"), "release");
    write(path.join(root, "projB", "only-here.txt"), "b\n");
    git(path.join(root, "projB"), "add", ".");
    git(path.join(root, "projB"), "commit", "-m", "a commit only projB has");
    repos = await discoverRepos(root);
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  const repo = (id: string) => {
    const found = repos.find((candidate) => candidate.id === id);
    assert.ok(found, `no repository ${id}`);
    return found!;
  };

  test("the log of one repository carries none of the other's commits", async () => {
    const subjects = (await gitLog(repo("projA"), 20)).map((entry) => entry.subject);
    assert.ok(subjects.some((subject) => subject.includes("projA")));
    assert.equal(
      subjects.some((subject) => subject.includes("only projB has")),
      false,
    );
  });

  test("a commit id from one repository is not resolved against another", async () => {
    const [onlyInB] = await gitLog(repo("projB"), 1);
    await assert.rejects(() => gitShow(repo("projA"), onlyInB.sha));
  });

  test("a file's history comes back in browser-root paths", async () => {
    const entries = await gitFileLog(repo("projB"), "projB/only-here.txt", 20);
    assert.ok(entries.length > 0);
    assert.deepEqual([...new Set(entries.map((entry) => entry.path))], ["projB/only-here.txt"]);
  });
});
