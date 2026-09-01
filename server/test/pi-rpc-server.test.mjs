/**
 * Running-server proof for the RPC adapter: the browser still sees the ordinary
 * WebSocket protocol, while a failed child makes readiness unhealthy and later
 * agent commands are refused rather than queued or replayed.
 */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { connect, makeWorkspace, startServer } from "./harness.mjs";

const FAKE = fileURLToPath(new URL("./fixtures/fake-pi-rpc.mjs", import.meta.url));

test("RPC child is launched with the configured resources and pi-outpost's own tools", async () => {
  const root = await makeWorkspace({
    "my-skill/SKILL.md": "---\nname: my-skill\ndescription: A configured skill\n---\n\nDo the thing.\n",
    "my-extension.ts": "export default function () {}\n",
    "prompts/greet.md": "Say hello.\n",
  });
  const fakeConfig = path.join(root, "fake-rpc.json");
  const launchLog = path.join(root, "launch.json");
  await writeFile(fakeConfig, JSON.stringify({ launchLog }));

  const server = await startServer(
    root,
    {
      agentRuntime: { mode: "rpc", executable: process.execPath, args: [FAKE], startupTimeoutMs: 5_000 },
      // The harness sandboxes by default; RPC refuses that pairing, and this test is
      // about resource forwarding rather than confinement.
      sandbox: undefined,
      noSkills: false,
      skillPaths: [path.join(root, "my-skill")],
      extensionPaths: [path.join(root, "my-extension.ts")],
      promptPaths: [path.join(root, "prompts")],
      noPromptTemplates: true,
      tools: ["read", "grep"],
      appendSystemPrompt: ["Be brief."],
      webContext: false,
    },
    { env: { FAKE_PI_RPC_CONFIG: fakeConfig } },
  );
  try {
    const launch = JSON.parse(await readFile(launchLog, "utf8"));
    const argv = launch.argv;
    const after = (flag) => argv[argv.indexOf(flag) + 1];

    // Configuration the embedded runtime passes as objects has to be said out loud
    // here, or pi would discover its own resources instead of serving ours.
    assert.equal(after("--skill"), path.join(root, "my-skill"), "a configured skill must reach the child");
    assert.equal(after("--extension"), path.join(root, "my-extension.ts"));
    assert.ok(argv.includes("--no-prompt-templates"));
    assert.equal(after("--prompt-template"), path.join(root, "prompts"));
    assert.equal(after("--tools"), "read,grep");
    assert.equal(after("--append-system-prompt"), "Be brief.");

    // The bundled structured-exchange skill and the tool it tells the model to call
    // travel together: the skill alone would describe a tool that does not exist.
    const skills = argv.filter((arg, index) => argv[index - 1] === "--skill");
    assert.ok(
      skills.some((skill) => skill.endsWith(path.join("skills", "structured-exchange"))),
      `the bundled structured-exchange skill must reach the child, got ${JSON.stringify(skills)}`,
    );
    const extensions = argv.filter((arg, index) => argv[index - 1] === "--extension");
    assert.ok(
      extensions.some((extension) => /piOutpostTools\.(ts|mjs)$|pi-outpost-tools\.mjs$/.test(extension)),
      `pi-outpost's tools extension must reach the child, got ${JSON.stringify(extensions)}`,
    );
    assert.deepEqual(JSON.parse(launch.toolsEnv).cwd, root);
    assert.ok(JSON.parse(launch.toolsEnv).maxBytes.pdf > 0);

    // Whatever else is on the line, the mode flag stays last and stays ours.
    assert.deepEqual(argv.slice(-2), ["--mode", "rpc"]);
  } finally {
    await server.stop();
  }
});

test("RPC server fails readiness closed and refuses a later prompt after child exit", async () => {
  const root = await makeWorkspace();
  const fakeConfig = path.join(root, "fake-rpc.json");
  const commandLog = path.join(root, "rpc-commands.jsonl");
  await writeFile(
    fakeConfig,
    JSON.stringify({
      commandLog,
      state: {
        sessionId: "rpc-browser-session",
        model: { provider: "omp", id: "little-coder", name: "Little Coder", reasoning: true },
      },
      exitAfter: "prompt",
      exitCode: 19,
    }),
  );

  const server = await startServer(
    root,
    {
      // A sandbox cannot be enforced on a child that builds its own tools, so the
      // pairing is refused at config load — see config.ts.
      sandbox: undefined,
      agentRuntime: {
        mode: "rpc",
        executable: process.execPath,
        args: [FAKE],
        startupTimeoutMs: 2_000,
        commandTimeoutMs: 500,
        shutdownGraceMs: 100,
      },
    },
    { env: { FAKE_PI_RPC_CONFIG: fakeConfig } },
  );
  const client = connect(server.wsUrl());
  try {
    const hello = await client.waitFor("hello");
    assert.equal(hello.sessionId, "rpc-browser-session");
    assert.equal(hello.model, "omp/little-coder");

    // The child is a local stdio implementation detail, not another network API.
    assert.equal((await fetch(`${server.base}/rpc`)).status, 404);
    assert.equal((await fetch(`${server.base}/pi-rpc`)).status, 404);

    client.send({ type: "navigate_tree", entryId: "missing" });
    const unsupported = await client.waitFor(
      (message) => message.type === "error" && message.message.includes("Tree navigation is not available"),
    );
    assert.match(unsupported.message, /rpc agent runtime/);

    client.send({ type: "prompt", text: "accepted once" });
    const failure = await client.waitFor(
      (message) => message.type === "error" && message.message.includes("Agent runtime failed"),
    );
    assert.match(failure.message, /exit code 19/);

    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 503);
    assert.deepEqual(await health.json(), { ok: false });

    client.send({ type: "prompt", text: "must be refused" });
    const refusal = await client.waitFor(
      (message) => message.type === "error" && message.message.startsWith("Agent runtime unavailable:"),
    );
    assert.match(refusal.message, /exit code 19/);

    const sent = (await readFile(commandLog, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.equal(sent.filter((command) => command.type === "prompt").length, 1, "the refused prompt must not be replayed");
  } finally {
    client.close();
    await server.stop();
  }
});

// openlore: scenario=ADeclaredSetOverridesTheRuntime spec=api
test("a declared set answers for the model, whatever the runtime reports", async () => {
  const root = await makeWorkspace();
  const fakeConfig = path.join(root, "fake-rpc.json");
  await writeFile(
    fakeConfig,
    JSON.stringify({
      state: { sessionId: "declared-1", model: { provider: "maison", id: "house", name: "House", reasoning: true } },
      commands_: {
        // The runtime is guessing about a model it does not know: it says everything
        get_available_thinking_levels: { data: { levels: ["off", "low", "medium", "high", "xhigh"] } },
        get_available_models: {
          data: { models: [{ provider: "maison", id: "house", name: "House", reasoning: true }] },
        },
      },
    }),
  );

  const server = await startServer(
    root,
    {
      sandbox: undefined,
      agentRuntime: { mode: "rpc", executable: process.execPath, args: [FAKE], startupTimeoutMs: 5_000 },
      thinkingLevels: [{ provider: "maison", levels: ["off"] }],
    },
    { env: { FAKE_PI_RPC_CONFIG: fakeConfig } },
  );
  const client = connect(server.wsUrl());
  try {
    const hello = await client.waitFor("hello");
    assert.deepEqual(hello.thinkingLevels, ["off"], "the operator's statement beats the runtime's guess");

    // openlore: scenario=AnExcludedLevelIsRefused spec=api
    client.send({ type: "set_thinking", level: "high" });
    // A refusal broadcasts nothing, so there is nothing to wait for. Send one the
    // deployment DOES allow and wait for that: anything the refusal produced would
    // have arrived first.
    client.send({ type: "set_thinking", level: "off" });
    await client.waitFor("thinking_changed", 20_000);
    assert.equal(
      client.received.some((m) => m.type === "thinking_changed" && m.level === "high"),
      false,
      "a level the deployment excluded must not reach the model",
    );
  } finally {
    client.close();
    await server.stop();
  }
});

test("the snapshot carries the model's accepted thinking levels, and they follow a model change", async () => {
  const root = await makeWorkspace();
  const fakeConfig = path.join(root, "fake-rpc.json");
  await writeFile(
    fakeConfig,
    JSON.stringify({
      state: { sessionId: "levels-1", model: { provider: "local", id: "qwen3.8", name: "Qwen3.8", reasoning: true } },
      commands_: {
        // first answer at bootstrap, second after set_model
        get_available_thinking_levels: [
          { data: { levels: ["low", "medium", "xhigh"] } },
          { data: { levels: ["off", "high"] } },
        ],
        get_available_models: {
          data: {
            models: [
              { provider: "local", id: "qwen3.8", name: "Qwen3.8", reasoning: true },
              { provider: "local", id: "other", name: "Other", reasoning: true },
            ],
          },
        },
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
  const client = connect(server.wsUrl());
  try {
    const hello = await client.waitFor("hello");
    assert.deepEqual(hello.thinkingLevels, ["off", "low", "medium", "xhigh"], "sanitised: off ensured, canonical order");

    client.send({ type: "set_model", provider: "local", id: "other" });
    const changed = await client.waitFor("model_changed");
    assert.equal(changed.model, "local/other");
    assert.deepEqual(changed.thinkingLevels, ["off", "high"], "the new model's set, not the old one");
  } finally {
    client.close();
    await server.stop();
  }
});
