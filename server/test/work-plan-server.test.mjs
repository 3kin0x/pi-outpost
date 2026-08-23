import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { connect, makeWorkspace, startServer } from "./harness.mjs";

const FAKE = fileURLToPath(new URL("./fixtures/fake-pi-rpc.mjs", import.meta.url));
const REAL_PI = fileURLToPath(new URL("../../node_modules/@earendil-works/pi-coding-agent/dist/cli.js", import.meta.url));
const WORK_PLAN_PROVIDER = fileURLToPath(new URL("./fixtures/work-plan-rpc-provider.mjs", import.meta.url));

const plan = (status = "in_progress") => ({
  version: 1,
  id: "release",
  title: "Prepare release",
  updatedAt: "2026-08-23T00:00:00.000Z",
  tasks: [
    { id: "build", title: "Build", status, dependsOn: [], resources: [] },
  ],
});

test("running server restores, forks, reconnects, and broadcasts authoritative Work Plans", async () => {
  const root = await makeWorkspace();
  const source = path.join(root, "source.jsonl");
  const target = path.join(root, "fork.jsonl");
  const fakeConfig = path.join(root, "fake-rpc.json");
  const userEntry = {
    id: "user-1",
    parentId: null,
    timestamp: "2026-08-23T00:00:00.000Z",
    type: "message",
    message: { role: "user", content: [{ type: "text", text: "Prepare it" }], timestamp: 1 },
  };
  await writeFile(source, "");
  await writeFile(`${source}.work-plan.json`, `${JSON.stringify(plan(), null, 2)}\n`);
  await writeFile(
    fakeConfig,
    JSON.stringify({
      state: { sessionId: "source", sessionFile: source },
      entries: [userEntry],
      tree: [{ entry: userEntry, children: [] }],
      leafId: "user-1",
      commands_: {
        compact: {
          writes: [{ path: source, content: "compacted conversation summary\n" }],
          after: [{ type: "compaction_start" }, { type: "compaction_end" }],
        },
        fork: {
          delayMs: 500,
          before: [{ type: "agent_start" }],
          data: { cancelled: false, text: "Prepare it" },
          replacement: {
            state: { sessionId: "fork", sessionFile: target },
            entries: [userEntry],
            tree: [{ entry: userEntry, children: [] }],
            leafId: "user-1",
          },
        },
        prompt: [
          {
            after: [
              { type: "agent_start" },
              { type: "tool_execution_start", toolCallId: "read-1", toolName: "read", args: { path: "README.md" } },
              { type: "tool_execution_end", toolCallId: "read-1", toolName: "read", result: { content: [{ type: "text", text: "read" }] }, isError: false },
              { type: "agent_end", messages: [] },
            ],
          },
          {
            writes: [{ path: `${target}.work-plan.json`, content: `${JSON.stringify(plan("done"), null, 2)}\n` }],
            after: [{
              type: "tool_execution_end",
              toolCallId: "plan-1",
              toolName: "work_plan",
              result: {
                content: [{ type: "text", text: "Work Plan updated." }],
                details: { type: "work_plan", sessionFile: target, plan: plan("done"), changed: true },
              },
              isError: false,
            }],
          },
        ],
      },
    }),
  );

  const server = await startServer(
    root,
    {
      sandbox: undefined,
      agentRuntime: { mode: "rpc", executable: process.execPath, args: [FAKE], startupTimeoutMs: 5_000 },
    },
    { env: { FAKE_PI_RPC_CONFIG: fakeConfig } },
  );
  const first = connect(server.wsUrl());
  let second;
  let third;
  let postCompaction;
  let afterUnrelatedTool;
  let concurrentFork;
  try {
    const hello = await first.waitFor("hello");
    assert.deepEqual(hello.workPlan, plan(), "the initial snapshot restores the session sidecar");

    first.send({ type: "compact" });
    await first.waitFor("compaction_end");
    assert.deepEqual(JSON.parse(await readFile(`${source}.work-plan.json`, "utf8")), plan());
    postCompaction = connect(server.wsUrl());
    assert.deepEqual((await postCompaction.waitFor("hello")).workPlan, plan(), "compaction does not alter plan availability");
    postCompaction.close();
    postCompaction = undefined;

    concurrentFork = connect(server.wsUrl());
    await concurrentFork.waitFor("hello");
    first.send({ type: "fork_session", entryId: "user-1" });
    await first.waitFor("agent_start");
    concurrentFork.send({ type: "fork_session", entryId: "user-1" });
    await concurrentFork.waitFor(
      (message) => message.type === "error" && message.message === "Session change already in progress",
    );
    const forkSnapshot = await first.waitFor(
      (message) => message.type === "session_replaced" && message.sessionId === "fork",
    );
    assert.deepEqual(forkSnapshot.workPlan, plan(), "the first fork snapshot already carries the inherited plan");
    const inherited = await first.waitFor(
      (message) => message.type === "work_plan_changed" && message.workPlan?.tasks[0]?.status === "in_progress",
    );
    assert.deepEqual(inherited.workPlan, plan());
    concurrentFork.close();
    concurrentFork = undefined;
    assert.equal(
      first.received.some((message) => message.type === "session_replaced" && message.sessionId === "fork" && message.workPlan === null),
      false,
      "the fork never broadcasts a transient empty plan",
    );
    assert.deepEqual(JSON.parse(await readFile(`${target}.work-plan.json`, "utf8")), plan());

    second = connect(server.wsUrl());
    const reconnected = await second.waitFor("hello");
    assert.equal(reconnected.sessionId, "fork");
    assert.deepEqual(reconnected.workPlan, plan(), "a reconnect receives the copied authoritative plan");

    first.send({ type: "prompt", text: "Inspect without changing the plan" });
    await first.waitFor((message) => message.type === "tool_end" && message.toolCallId === "read-1");
    afterUnrelatedTool = connect(server.wsUrl());
    assert.equal(
      (await afterUnrelatedTool.waitFor("hello")).workPlan.tasks[0].status,
      "in_progress",
      "ordinary tool activity does not infer Work Plan completion",
    );
    afterUnrelatedTool.close();
    afterUnrelatedTool = undefined;

    first.send({ type: "prompt", text: "Finish the plan" });
    const finished = (message) => message.type === "work_plan_changed" && message.workPlan?.tasks[0]?.status === "done";
    assert.deepEqual((await first.waitFor(finished)).workPlan, plan("done"));
    assert.deepEqual((await second.waitFor(finished)).workPlan, plan("done"), "all clients receive one authoritative update");

    // There is deliberately no client-side mutation message in the protocol.
    // An unsolicited server-shaped frame is ignored and cannot replace state.
    first.send({ type: "work_plan_changed", workPlan: plan("blocked") });
    third = connect(server.wsUrl());
    assert.deepEqual((await third.waitFor("hello")).workPlan, plan("done"));
    assert.deepEqual(JSON.parse(await readFile(`${source}.work-plan.json`, "utf8")), plan(), "fork changes stay isolated");
  } finally {
    first.close();
    second?.close();
    third?.close();
    postCompaction?.close();
    afterUnrelatedTool?.close();
    concurrentFork?.close();
    await server.stop();
  }
});

test("a real Pi RPC child executes work_plan and synchronizes its persisted result", async () => {
  const root = await makeWorkspace();
  const server = await startServer(root, {
    sandbox: undefined,
    agentRuntime: {
      mode: "rpc",
      executable: process.execPath,
      args: [
        REAL_PI,
        "--provider", "work-plan-test",
        "--model", "work-plan-test",
        "--api-key", "test",
        "--extension", WORK_PLAN_PROVIDER,
        "--no-approve",
      ],
      startupTimeoutMs: 15_000,
    },
  });
  const client = connect(server.wsUrl());
  try {
    const hello = await client.waitFor("hello", 30_000);
    client.send({ type: "prompt", text: "Replace the Work Plan" });
    const changed = await client.waitFor(
      (message) => message.type === "work_plan_changed" && message.workPlan?.id === "rpc-release",
      30_000,
    );
    assert.equal(changed.workPlan.tasks[0].status, "done");
    const sidecars = (await readdir(root, { recursive: true }))
      .filter((entry) => entry.endsWith(".work-plan.json"));
    assert.equal(sidecars.length, 1, "the real child persisted exactly one Work Plan sidecar");
    assert.deepEqual(JSON.parse(await readFile(path.join(root, sidecars[0]), "utf8")), changed.workPlan);
  } finally {
    client.close();
    await server.stop();
  }
});
