/**
 * The embed workspace-control policy, over the real server and the real socket.
 *
 * The setting is a presentation choice the server hands to a mounted widget, so
 * what matters here is what actually leaves the server: the configured value on
 * every snapshot, silence when it is the default, and the fact that it never
 * stands in for the workspace lock.
 */
import assert from "node:assert/strict";
import { realpath } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { connect, makeWorkspace, startServer } from "./harness.mjs";

/** A server with one project and the given embed policy. */
async function serverWith(config, t) {
  const root = await realpath(await makeWorkspace({ "a.md": "alpha\n" }));
  const server = await startServer(root, config);
  t.after(() => server.stop());
  return { root, server };
}

// openlore: scenario=SettingsModeIsTheDefault spec=config
test("a server that configures nothing says nothing about embed controls", async (t) => {
  const { server } = await serverWith({}, t);
  const client = connect(server.wsUrl());
  t.after(() => client.close());

  const hello = await client.waitFor((m) => m.type === "hello");

  // Absence is the contract: a client that predates the setting must keep the
  // interface it had, and the only way to promise that is to send nothing.
  assert.equal(hello.embedWorkspaceControls, undefined);
});

// openlore: scenario=ProjectsModeIsConfigured spec=config
test("a configured policy reaches the widget on the snapshot it connects with", async (t) => {
  const { server } = await serverWith({ embed: { workspaceControls: "projects" } }, t);
  const client = connect(server.wsUrl());
  t.after(() => client.close());

  const hello = await client.waitFor((m) => m.type === "hello");

  assert.equal(hello.embedWorkspaceControls, "projects");
});

// openlore: scenario=RootModeIsConfigured spec=config
test("root mode reaches the widget the same way", async (t) => {
  const { server } = await serverWith({ embed: { workspaceControls: "root" } }, t);
  const client = connect(server.wsUrl());
  t.after(() => client.close());

  const hello = await client.waitFor((m) => m.type === "hello");

  assert.equal(hello.embedWorkspaceControls, "root");
});

test("the policy travels on a later acknowledgement too, not only the first hello", async (t) => {
  const { root, server } = await serverWith({ embed: { workspaceControls: "root" } }, t);
  const client = connect(server.wsUrl());
  t.after(() => client.close());
  await client.waitFor((m) => m.type === "hello");

  // A widget that has its root replaced is served a fresh snapshot; losing the
  // policy there would make the control it just used disappear under it.
  client.send({ type: "update_config", sandbox: { root, allowWrite: true, allowBash: false, writableRoot: root } });
  const ack = await client.waitFor((m) => m.type === "update_config_ack" || m.type === "error");

  assert.equal(ack.type, "update_config_ack", ack.message);
  assert.equal(ack.embedWorkspaceControls, "root");
});

// openlore: scenario=PolicyDoesNotWeakenWorkspaceLock spec=config
test("offering project controls to embeds does not unlock the server", async (t) => {
  const beta = await realpath(await makeWorkspace({ "b.md": "beta\n" }));
  const { server } = await serverWith({ embed: { workspaceControls: "projects" }, workspaceLock: true }, t);
  const client = connect(server.wsUrl());
  t.after(() => client.close());
  const hello = await client.waitFor((m) => m.type === "hello");

  // The policy chooses which authorized control is presented. The lock decides
  // what is authorized, and it still refuses over the wire — where a forged or
  // stale request arrives regardless of what any interface offered.
  assert.equal(hello.embedWorkspaceControls, "projects");
  assert.equal(hello.workspaceLocked, true);

  client.send({ type: "open_project", root: beta });
  const refusal = await client.waitFor((m) => m.type === "workspace_error");
  assert.match(refusal.message, /pinned/i);
});

// openlore: scenario=RootReplacementMustPreserveAValidSandbox spec=embed
test("a replacement root that would strand the writable root is refused, and nothing moves", async (t) => {
  const root = await realpath(await makeWorkspace({ "a.md": "alpha\n", "inner/b.md": "beta\n" }));
  const inner = path.join(root, "inner");
  const server = await startServer(root, {
    embed: { workspaceControls: "root" },
    sandbox: { root, allowWrite: true, writableRoot: root, allowBash: false },
  });
  t.after(() => server.stop());
  const client = connect(server.wsUrl());
  t.after(() => client.close());
  const hello = await client.waitFor((m) => m.type === "hello");
  assert.equal(hello.sandbox.root, root);

  // The control preserves the sandbox it was given and replaces only the root.
  // Here that pair is invalid — the writable root would fall outside the new
  // root — and the server has to refuse the pair rather than silently drop or
  // relocate the writable root the operator configured.
  client.send({ type: "update_config", sandbox: { root: inner, allowWrite: true, allowBash: false, writableRoot: root } });
  const refusal = await client.waitFor((m) => m.type === "error" || m.type === "update_config_ack");

  assert.equal(refusal.type, "error", "an incompatible pair must not be applied");
  assert.match(refusal.message, /writableRoot/);

  const second = connect(server.wsUrl());
  t.after(() => second.close());
  const after = await second.waitFor((m) => m.type === "hello");
  // Persist-first means the refusal happened before anything was written: the
  // boundary a later connection is told about is still the original one.
  assert.equal(after.sandbox.root, root);
  assert.equal(after.sandbox.writableRoot, root);
});

test("a valid replacement moves the root and keeps the same project", async (t) => {
  const root = await realpath(await makeWorkspace({ "a.md": "alpha\n", "inner/b.md": "beta\n" }));
  const inner = path.join(root, "inner");
  const server = await startServer(root, {
    embed: { workspaceControls: "root" },
    sandbox: { root, allowWrite: true, writableRoot: root, allowBash: false },
  });
  t.after(() => server.stop());
  const client = connect(server.wsUrl());
  t.after(() => client.close());
  const hello = await client.waitFor((m) => m.type === "hello");

  client.send({ type: "update_config", sandbox: { root: inner, allowWrite: true, allowBash: false, writableRoot: inner } });
  const ack = await client.waitFor((m) => m.type === "update_config_ack" || m.type === "error");

  assert.equal(ack.type, "update_config_ack", ack.message);
  assert.equal(ack.sandbox.root, inner);
  // A root replacement is not an open: the widget is looking at the same project,
  // and no second one appeared beside it.
  assert.equal(ack.workspaces, hello.workspaces);
  assert.equal(ack.workspace, hello.workspace);
});
