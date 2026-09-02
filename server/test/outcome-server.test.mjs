import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { connect, makeWorkspace, startServer } from "./harness.mjs";

const FAKE = fileURLToPath(new URL("./fixtures/fake-pi-rpc.mjs", import.meta.url));

test("Outcome is composed from the bound workspace and sent only to its requester", async () => {
  const root = await realpath(await makeWorkspace({ "tracked.txt": "before\n" }));
  const beta = await realpath(await makeWorkspace({ "beta.txt": "before beta\n" }));
  const sessionFile = path.join(root, "outcome.jsonl");
  const betaSessionFile = path.join(beta, "outcome-beta.jsonl");
  const fakeConfig = path.join(root, "fake-rpc.json");
  const workPlan = {
    version: 1,
    id: "outcome",
    title: "Outcome",
    updatedAt: "2026-09-01T00:00:00.000Z",
    tasks: [{
      id: "review",
      title: "Review result",
      status: "needs_review",
      dependsOn: [],
      resources: [],
      evidence: [{ id: "tests", type: "test", result: "passed", summary: "Focused tests passed" }],
    }],
  };
  const betaPlan = { ...workPlan, id: "outcome-beta", title: "Beta Outcome", tasks: [{ ...workPlan.tasks[0], id: "beta-review", title: "Private beta result", evidence: [{ id: "beta-tests", type: "test", result: "failed", summary: "Beta failed" }] }] };
  for (const [cwd, file] of [[root, "tracked.txt"], [beta, "beta.txt"]]) {
    execFileSync("git", ["init", "-b", "main"], { cwd });
    execFileSync("git", ["config", "user.email", "test@test"], { cwd });
    execFileSync("git", ["config", "user.name", "Test"], { cwd });
    execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd });
    execFileSync("git", ["add", file], { cwd });
    execFileSync("git", ["commit", "-m", "initial"], { cwd });
  }
  await writeFile(path.join(root, "tracked.txt"), "after\n");
  await writeFile(path.join(beta, "beta.txt"), "after beta\n");
  await writeFile(sessionFile, "");
  await writeFile(betaSessionFile, "");
  await writeFile(`${sessionFile}.work-plan.json`, `${JSON.stringify(workPlan, null, 2)}\n`);
  await writeFile(`${betaSessionFile}.work-plan.json`, `${JSON.stringify(betaPlan, null, 2)}\n`);
  await writeFile(fakeConfig, JSON.stringify({ stateByCwd: {
    [root]: { sessionId: "outcome-session", sessionFile },
    [beta]: { sessionId: "outcome-beta-session", sessionFile: betaSessionFile },
  } }));

  const server = await startServer(
    root,
    { openProjects: [beta], sandbox: undefined, agentRuntime: { mode: "rpc", executable: process.execPath, args: [FAKE], startupTimeoutMs: 5_000 } },
    { env: { FAKE_PI_RPC_CONFIG: fakeConfig } },
  );
  const requester = connect(server.wsUrl());
  const observer = connect(server.wsUrl());
  try {
    const hello = await requester.waitFor("hello");
    await observer.waitFor("hello");
    requester.send({ type: "get_outcome", requestId: "outcome-1" });
    const answer = await requester.waitFor((message) => message.type === "workspace_outcome" && message.requestId === "outcome-1");
    assert.equal(answer.outcome.workspaceRoot, hello.workspace.root);
    assert.equal(answer.outcome.sessionId, "outcome-session");
    assert.deepEqual(answer.outcome.sections.map((section) => section.id), ["work-plan", "verification", "changed-files"]);
    assert.equal(answer.outcome.sections[0].entries[0].status, "needs_review");
    assert.equal(answer.outcome.sections[1].entries[0].status, "passed");
    assert.ok(answer.outcome.sections[2].entries.some((entry) => entry.title === "tracked.txt" && entry.status === "modified"));
    assert.equal(answer.outcome.sections.some((section) => section.entries.some((entry) => entry.title.includes("beta"))), false);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(observer.received.some((message) => message.type === "workspace_outcome"), false);

    requester.send({ type: "switch_workspace", root: beta });
    const switched = await requester.waitFor((message) => message.type === "workspace_switched" && message.workspace.root === beta);
    requester.send({ type: "get_outcome", requestId: "outcome-2" });
    const betaAnswer = await requester.waitFor((message) => message.type === "workspace_outcome" && message.requestId === "outcome-2");
    assert.equal(betaAnswer.outcome.workspaceRoot, beta);
    assert.equal(betaAnswer.outcome.sessionId, switched.sessionId);
    assert.equal(betaAnswer.outcome.sections[0].entries[0].title, "Private beta result");
    assert.equal(betaAnswer.outcome.sections[1].entries[0].status, "failed");
    assert.ok(betaAnswer.outcome.sections[2].entries.some((entry) => entry.title === "beta.txt" && entry.status === "modified"));
    assert.equal(betaAnswer.outcome.sections.some((section) => section.entries.some((entry) => entry.title === "tracked.txt")), false);
  } finally {
    requester.close();
    observer.close();
    await server.stop();
    await rm(root, { recursive: true, force: true });
    await rm(beta, { recursive: true, force: true });
  }
});

test("filesystem bursts stay on the existing broadcasts: the server never pushes an Outcome", async () => {
  // The Outcome refresh is coalesced on the client, riding broadcasts the server
  // already sends. That only holds if the server keeps sending exactly those and
  // never volunteers Outcome content of its own — otherwise a burst would put an
  // unrequested, uncorrelated result on a screen bound elsewhere.
  const root = await realpath(await makeWorkspace({ "tracked.txt": "before\n" }));
  const sessionFile = path.join(root, "burst.jsonl");
  const fakeConfig = path.join(root, "fake-rpc.json");
  await writeFile(sessionFile, "");
  await writeFile(fakeConfig, JSON.stringify({ stateByCwd: { [root]: { sessionId: "burst-session", sessionFile } } }));
  execFileSync("git", ["init", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@test"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: root });
  execFileSync("git", ["add", "tracked.txt"], { cwd: root });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: root });

  const server = await startServer(
    root,
    { sandbox: undefined, agentRuntime: { mode: "rpc", executable: process.execPath, args: [FAKE], startupTimeoutMs: 5_000 } },
    { env: { FAKE_PI_RPC_CONFIG: fakeConfig } },
  );
  const client = connect(server.wsUrl());
  try {
    await client.waitFor("hello");
    // The server watches the directories the browser has listed — list the root
    // the way the file sidebar does before expecting events from it.
    client.send({ type: "list_directory", path: "", requestId: "dir-1" });
    await client.waitFor((message) => message.type === "directory_listing" && message.requestId === "dir-1");

    const before = client.received.length;
    for (let index = 0; index < 8; index += 1) {
      await writeFile(path.join(root, `burst-${index}.txt`), `burst ${index}\n`);
    }
    await client.waitFor((message) => message.type === "directory_changed" || message.type === "file_changed");
    await new Promise((resolve) => setTimeout(resolve, 300));
    const during = client.received.slice(before);
    assert.ok(during.length > 0, "the burst produced no broadcast at all");
    assert.equal(during.some((message) => message.type === "workspace_outcome"), false);
    // Nor smuggled into another payload: an Outcome only ever answers a request.
    assert.equal(during.some((message) => "outcome" in message), false);

    // And a refresh after the burst sees the files the burst created.
    client.send({ type: "get_outcome", requestId: "after-burst" });
    const answer = await client.waitFor((message) => message.type === "workspace_outcome" && message.requestId === "after-burst");
    const changed = answer.outcome.sections.find((section) => section.id === "changed-files");
    assert.equal(changed.entries.filter((entry) => entry.title.startsWith("burst-")).length, 8);
  } finally {
    client.close();
    await server.stop();
    await rm(root, { recursive: true, force: true });
  }
});
