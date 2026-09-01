/**
 * A workspace rooted at a directory that is NOT a repository, holding one per child.
 *
 * The layout this whole change exists for: the git surface used to go dark here,
 * because the workspace held one repository or none. Over the socket, because what
 * matters is what a client can actually get after clicking a tracked leaf.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { connect, makeWorkspace, startServer } from "./harness.mjs";

function git(cwd, ...args) {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

async function makeRepo(dir, branch, subject) {
  await mkdir(dir, { recursive: true });
  git(dir, "init", "-b", branch);
  git(dir, "config", "user.email", "test@test");
  git(dir, "config", "user.name", "Test");
  git(dir, "config", "commit.gpgsign", "false");
  await writeFile(path.join(dir, "README.md"), "# project\n");
  git(dir, "add", "--", "README.md");
  git(dir, "commit", "-m", subject);
}

describe("a workspace holding a repository per child directory", () => {
  let server;
  let client;
  let root;
  let hello;
  let requestCounter = 0;

  async function ask(message) {
    const requestId = `req-${++requestCounter}`;
    client.send({ ...message, requestId });
    return client.waitFor((m) => m.requestId === requestId, 20_000);
  }

  before(async () => {
    root = await makeWorkspace({});
    await makeRepo(path.join(root, "projA"), "main", "projA initial");
    await makeRepo(path.join(root, "projB"), "release", "projB initial");
    // A change in each, so both have something to badge
    await writeFile(path.join(root, "projA", "README.md"), "# projA changed\n");
    await writeFile(path.join(root, "projB", "fresh.txt"), "new\n");
    // A file belonging to no repository at all
    await writeFile(path.join(root, "notes.md"), "loose\n");

    server = await startServer(root);
    client = connect(server.wsUrl());
    hello = await client.waitFor("hello");
  });

  after(async () => {
    client?.close();
    await server?.stop();
    await rm(root, { recursive: true, force: true });
  });

  // openlore: scenario=RepositoriesOnlyUnderneath spec=git
  test("advertises git as available, though the root is no repository", () => {
    assert.equal(hello.gitAvailable, true);
  });

  // openlore: scenario=StatusSpansRepositories spec=git
  test("reports both repositories, each with its own branch", async () => {
    const status = await ask({ type: "git_status" });
    assert.equal(status.type, "git_status");
    const branches = Object.fromEntries(status.repos.map((repo) => [repo.repo, repo.branch]));
    assert.deepEqual(branches, { projA: "main", projB: "release" });
  });

  // openlore: scenario=NestedRepositoriesUnderANonRepositoryRoot spec=git
  test("badges files from both, keyed from the browser root", async () => {
    const status = await ask({ type: "git_status" });
    const byPath = Object.fromEntries(status.files.map((file) => [file.path, file.status]));
    assert.equal(byPath["projA/README.md"], "modified");
    assert.equal(byPath["projB/fresh.txt"], "untracked");
  });

  test("diffs a file against the HEAD of ITS repository", async () => {
    const diff = await ask({ type: "git_diff", path: "projA/README.md" });
    assert.equal(diff.type, "git_diff");
    assert.equal(diff.before, "# project\n");
    assert.equal(diff.after, "# projA changed\n");
  });

  // openlore: scenario=FullGitSurfaceOnClickingATrackedLeaf spec=git
  test("gives a file its own repository's history", async () => {
    const log = await ask({ type: "git_file_log", path: "projA/README.md" });
    assert.equal(log.type, "git_file_log");
    assert.deepEqual(
      log.entries.map((entry) => entry.subject),
      ["projA initial"],
    );
    assert.deepEqual([...new Set(log.entries.map((entry) => entry.path))], ["projA/README.md"]);
  });

  // openlore: scenario=LogIsScopedToTheNamedRepository spec=git
  test("scopes the commit log to the repository the client names", async () => {
    const a = await ask({ type: "git_log", repo: "projA" });
    const b = await ask({ type: "git_log", repo: "projB" });
    assert.deepEqual(
      a.entries.map((entry) => entry.subject),
      ["projA initial"],
    );
    assert.deepEqual(
      b.entries.map((entry) => entry.subject),
      ["projB initial"],
    );
  });

  // openlore: scenario=CommitIdFromAnotherRepository spec=git
  test("refuses a commit id against a repository that does not have it", async () => {
    const b = await ask({ type: "git_log", repo: "projB" });
    const answer = await ask({ type: "git_show", repo: "projA", sha: b.entries[0].sha });
    assert.equal(answer.type, "git_error");
  });

  test("refuses a repository it does not hold, rather than picking one", async () => {
    const answer = await ask({ type: "git_log", repo: "projZ" });
    assert.equal(answer.type, "git_error");
    assert.match(answer.message, /projZ/);
  });

  // openlore: scenario=AFileOwnedByNoRepository spec=git
  test("says so for a file under no repository, and keeps its siblings' status", async () => {
    const answer = await ask({ type: "git_diff", path: "notes.md" });
    assert.equal(answer.type, "git_error");
    assert.match(answer.message, /not in a git repository/i);

    const status = await ask({ type: "git_status" });
    assert.equal(status.type, "git_status");
    assert.ok(status.files.some((file) => file.path === "projA/README.md"));
  });

  test("reads one repository when the client scopes the request", async () => {
    const status = await ask({ type: "git_status", repo: "projB" });
    assert.equal(status.repo, "projB");
    assert.deepEqual(
      status.repos.map((repo) => repo.repo),
      ["projB"],
    );
    assert.equal(
      status.files.some((file) => file.path.startsWith("projA/")),
      false,
    );
  });
});

// ---------------------------------------------------------------------------
describe("repositories that appear and vanish while the server runs", () => {
  let server;
  let client;
  let root;
  let requestCounter = 0;

  async function ask(message) {
    const requestId = `fresh-${++requestCounter}`;
    client.send({ ...message, requestId });
    return client.waitFor((m) => m.requestId === requestId, 20_000);
  }

  /** Poll the status until `predicate` holds, or give up — the re-scan is debounced. */
  async function until(predicate, what) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const status = await ask({ type: "git_status" });
      if (status.type === "git_status" && predicate(status)) return status;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.fail(`timed out waiting for ${what}`);
  }

  before(async () => {
    root = await makeWorkspace({});
    await makeRepo(path.join(root, "first"), "main", "first initial");
    server = await startServer(root);
    client = connect(server.wsUrl());
    await client.waitFor("hello");
    // The watcher only watches what a client has listed — that is where a new
    // repository will be noticed appearing
    await ask({ type: "list_directory", path: "" });
  });

  after(async () => {
    client?.close();
    await server?.stop();
    await rm(root, { recursive: true, force: true });
  });

  // openlore: scenario=ARepositoryClonedWhileRunning spec=git
  test("a repository created after startup becomes usable without a restart", async () => {
    await makeRepo(path.join(root, "second"), "later", "second initial");
    await writeFile(path.join(root, "second", "fresh.txt"), "new\n");

    const status = await until((s) => s.repos.some((repo) => repo.repo === "second"), "the new repository to appear");
    assert.equal(status.repos.find((repo) => repo.repo === "second").branch, "later");

    const log = await ask({ type: "git_log", repo: "second" });
    assert.deepEqual(
      log.entries.map((entry) => entry.subject),
      ["second initial"],
    );
  });

  // openlore: scenario=ARepositoryThatStopsBeingOne spec=git
  test("a directory that stops being a repository stops being consulted", async () => {
    await rm(path.join(root, "second", ".git"), { recursive: true, force: true });

    await until((s) => !s.repos.some((repo) => repo.repo === "second"), "the repository to leave the set");
    const answer = await ask({ type: "git_log", repo: "second" });
    assert.equal(answer.type, "git_error");
  });
});

// ---------------------------------------------------------------------------
// openlore: scenario=NoRepository spec=git
describe("a workspace with no repository at all", () => {
  let server;
  let client;
  let root;

  before(async () => {
    root = await makeWorkspace({ "notes.md": "no git here\n" });
    server = await startServer(root);
    client = connect(server.wsUrl());
  });

  after(async () => {
    client?.close();
    await server?.stop();
    await rm(root, { recursive: true, force: true });
  });

  test("says git is unavailable, and refuses git requests", async () => {
    const hello = await client.waitFor("hello");
    assert.equal(hello.gitAvailable, false);
    client.send({ type: "git_status", requestId: "none-1" });
    const answer = await client.waitFor((m) => m.requestId === "none-1", 20_000);
    assert.equal(answer.type, "git_error");
  });
});

// ---------------------------------------------------------------------------
// openlore: scenario=RepositoriesArePerWorkspace spec=multi-project-workspaces
describe("two open projects, each with its own repositories", () => {
  let server;
  let client;
  let alpha;
  let beta;
  let requestCounter = 0;

  async function ask(message) {
    const requestId = `per-ws-${++requestCounter}`;
    client.send({ ...message, requestId });
    return client.waitFor((m) => m.requestId === requestId, 20_000);
  }

  before(async () => {
    alpha = await realpath(await makeWorkspace({}));
    beta = await realpath(await makeWorkspace({}));
    await makeRepo(path.join(alpha, "inAlpha"), "alpha-branch", "alpha initial");
    await makeRepo(path.join(beta, "inBeta"), "beta-branch", "beta initial");

    server = await startServer(alpha, { openProjects: [alpha, beta] });
    client = connect(server.wsUrl());
    await client.waitFor("hello");
  });

  after(async () => {
    client?.close();
    await server?.stop();
    await rm(alpha, { recursive: true, force: true });
    await rm(beta, { recursive: true, force: true });
  });

  test("answers a git request from the subscribed project's repositories only", async () => {
    const inAlpha = await ask({ type: "git_status" });
    assert.deepEqual(
      inAlpha.repos.map((repo) => repo.repo),
      ["inAlpha"],
    );

    client.send({ type: "switch_workspace", root: beta });
    const switched = await client.waitFor((m) => m.type === "workspace_switched", 20_000);
    assert.equal(switched.workspace.root, beta);

    const inBeta = await ask({ type: "git_status" });
    assert.deepEqual(
      inBeta.repos.map((repo) => repo.repo),
      ["inBeta"],
    );
    assert.equal(inBeta.repos[0].branch, "beta-branch");
  });

  test("refuses the other project's repository by name", async () => {
    const answer = await ask({ type: "git_log", repo: "inAlpha" });
    assert.equal(answer.type, "git_error");
  });
});
