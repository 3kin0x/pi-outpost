/**
 * Multi-project workspaces, over the real server and the real WebSocket.
 *
 * These check the boundaries that the feature is only worth having if it holds:
 * a project's sessions belong to that project, a client watching one hears about
 * the others' activity but not their content, the last project cannot be closed,
 * and a persisted set that cannot be written leaves the server untouched.
 *
 * Everything here is scoped to what a single test process can prove. Whether the
 * switch *looks* right — the cross-fade, the badge, the draft — is the bench's
 * job, not this file's.
 */
import assert from "node:assert/strict";
import { chmod, realpath } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { connect, makeWorkspace, startServer } from "./harness.mjs";

/** A second project directory, alongside the server's own. */
async function secondProject(name = "beta") {
  // Resolved: the server reports realpath'd roots (on macOS /var/… is a link to
  // /private/var/…), and a client must address a project by the root the server
  // gave it rather than one it built itself.
  return realpath(await makeWorkspace({ [`${name}.md`]: `# ${name}\n` }));
}

test("a single-project server offers no selector", async (t) => {
  const root = await realpath(await makeWorkspace({ "a.md": "alpha\n" }));
  const server = await startServer(root);
  t.after(() => server.stop());

  const client = connect(server.wsUrl());
  t.after(() => client.close());
  const hello = await client.waitFor((m) => m.type === "hello");

  // Absent, not empty: an existing client meets nothing new where there is
  // nothing to choose.
  assert.equal(hello.workspace, undefined, "no bound workspace is advertised");
  assert.equal(hello.workspaces, undefined, "no project list is advertised");
});

test("a persisted project is listed but has no session until it is opened", async (t) => {
  const beta = await secondProject();
  const root = await realpath(await makeWorkspace({ "a.md": "alpha\n" }));
  const server = await startServer(root, { openProjects: [beta] });
  t.after(() => server.stop());

  const client = connect(server.wsUrl());
  t.after(() => client.close());
  const hello = await client.waitFor((m) => m.type === "hello");

  assert.equal(hello.workspaces.length, 2, "both projects are listed");
  const restored = hello.workspaces.find((w) => w.root === beta);
  // Startup must not grow with the number of open projects: the session is built
  // on first use, not at boot.
  assert.equal(restored.activity, "stopped", "the restored project has no session yet");
  assert.equal(hello.workspace.root, root, "the connection is bound to the server's own project");
});

test("switching builds the other project's session and keeps its history apart", async (t) => {
  const beta = await secondProject();
  const root = await realpath(await makeWorkspace({ "a.md": "alpha\n" }));
  const server = await startServer(root, { openProjects: [beta] });
  t.after(() => server.stop());

  const client = connect(server.wsUrl());
  t.after(() => client.close());
  const hello = await client.waitFor((m) => m.type === "hello");

  client.send({ type: "switch_workspace", root: beta });
  const switched = await client.waitFor((m) => m.type === "workspace_switched");

  assert.equal(switched.workspace.root, beta, "the connection is now bound to the other project");
  // A session of its own, not the first project's handed over.
  assert.notEqual(switched.sessionId, hello.sessionId, "the second project got its own session");
  assert.equal(
    switched.workspaces.find((w) => w.root === beta).activity,
    "idle",
    "starting it is what the switch did",
  );
});

test("session listing is scoped to the project the connection is bound to", async (t) => {
  const beta = await secondProject();
  const root = await realpath(await makeWorkspace({ "a.md": "alpha\n" }));
  const server = await startServer(root, { openProjects: [beta] });
  t.after(() => server.stop());

  const client = connect(server.wsUrl());
  t.after(() => client.close());
  await client.waitFor((m) => m.type === "hello");

  client.send({ type: "list_sessions" });
  const onAlpha = await client.waitFor((m) => m.type === "sessions");

  client.send({ type: "switch_workspace", root: beta });
  await client.waitFor((m) => m.type === "workspace_switched");
  client.send({ type: "list_sessions" });
  const onBeta = await client.waitFor((m) => m.type === "sessions");

  // The cache behind this is keyed by project; one shared entry used to answer
  // the second listing with the first project's session paths.
  const alphaPaths = new Set(onAlpha.sessions.map((s) => s.path));
  for (const session of onBeta.sessions) {
    assert.ok(!alphaPaths.has(session.path), `${session.path} belongs to the other project`);
  }
});

test("a client hears about another project's activity, and none of its content", async (t) => {
  const beta = await secondProject();
  const root = await realpath(await makeWorkspace({ "a.md": "alpha\n" }));
  const server = await startServer(root, { openProjects: [beta] });
  t.after(() => server.stop());

  const watcher = connect(server.wsUrl());
  const mover = connect(server.wsUrl());
  t.after(() => {
    watcher.close();
    mover.close();
  });
  await watcher.waitFor((m) => m.type === "hello");
  await mover.waitFor((m) => m.type === "hello");

  // The second client starts the other project; the first stays where it is.
  mover.send({ type: "switch_workspace", root: beta });
  await mover.waitFor((m) => m.type === "workspace_switched");

  const activity = await watcher.waitFor((m) => m.type === "workspace_activity");
  assert.ok(
    activity.workspaces.some((w) => w.root === beta && w.activity !== "stopped"),
    "the other project's state reached a client bound elsewhere",
  );
  // Activity carries no conversation: that is what makes it safe to send to
  // everyone.
  assert.equal(Object.keys(activity).sort().join(","), "type,workspaces");
});

test("the last project cannot be closed", async (t) => {
  const root = await realpath(await makeWorkspace({ "a.md": "alpha\n" }));
  const server = await startServer(root);
  t.after(() => server.stop());

  const client = connect(server.wsUrl());
  t.after(() => client.close());
  await client.waitFor((m) => m.type === "hello");

  client.send({ type: "close_project", root });
  const error = await client.waitFor((m) => m.type === "workspace_error");
  assert.match(error.message, /last open project/i);
});

test("a pinned server refuses to open, close or switch", async (t) => {
  const beta = await secondProject();
  const root = await realpath(await makeWorkspace({ "a.md": "alpha\n" }));
  const server = await startServer(root, { openProjects: [beta], workspaceLock: true });
  t.after(() => server.stop());

  const client = connect(server.wsUrl());
  t.after(() => client.close());
  const hello = await client.waitFor((m) => m.type === "hello");
  assert.equal(hello.workspaceLocked, true, "the client is told, so it can hide the affordance");

  client.send({ type: "switch_workspace", root: beta });
  const refusedSwitch = await client.waitFor((m) => m.type === "workspace_error");
  assert.match(refusedSwitch.message, /pinned/i);

  client.send({ type: "open_project", root: beta });
  const refusedOpen = await client.waitFor(
    (m) => m.type === "workspace_error" && m !== refusedSwitch,
  );
  assert.match(refusedOpen.message, /pinned/i);
});

test("opening an unreadable path fails and opens nothing", async (t) => {
  const root = await realpath(await makeWorkspace({ "a.md": "alpha\n" }));
  const server = await startServer(root);
  t.after(() => server.stop());

  const client = connect(server.wsUrl());
  t.after(() => client.close());
  await client.waitFor((m) => m.type === "hello");

  client.send({ type: "open_project", root: path.join(root, "does-not-exist") });
  const error = await client.waitFor((m) => m.type === "workspace_error");
  assert.match(error.message, /cannot open/i);

  // Nothing was added: the set is still one project long.
  client.send({ type: "list_sessions" });
  await client.waitFor((m) => m.type === "sessions");
  const second = connect(server.wsUrl());
  t.after(() => second.close());
  const hello = await second.waitFor((m) => m.type === "hello");
  assert.equal(hello.workspaces, undefined, "still a single-project server");
});

test("opening a directory that is already open reuses it", async (t) => {
  const beta = await secondProject();
  const root = await realpath(await makeWorkspace({ "a.md": "alpha\n" }));
  const server = await startServer(root, { openProjects: [beta] });
  t.after(() => server.stop());

  const client = connect(server.wsUrl());
  t.after(() => client.close());
  const hello = await client.waitFor((m) => m.type === "hello");

  client.send({ type: "open_project", root: beta });
  const switched = await client.waitFor((m) => m.type === "workspace_switched");

  assert.equal(switched.workspace.root, beta);
  // Two workspaces on one root would be two writers on one session store.
  assert.equal(switched.workspaces.length, hello.workspaces.length, "no duplicate project");
});

// SKIPPED: the persist-first rule is real and implemented (handleOpenProject
// writes before it builds, and rolls back if the build then fails), but making the
// filesystem actually refuse the write proved unreliable here — the write is a
// temp file renamed over the target, so neither a read-only config file nor a
// read-only directory stopped it in this environment. Left in place rather than
// deleted: the behaviour deserves a test, and this records what the next attempt
// has to defeat.
test.skip("a persisted set that cannot be written leaves the server untouched", async (t) => {
  const beta = await secondProject();
  const root = await realpath(await makeWorkspace({ "a.md": "alpha\n" }));
  const server = await startServer(root);
  t.after(() => server.stop());

  const client = connect(server.wsUrl());
  t.after(() => client.close());
  await client.waitFor((m) => m.type === "hello");

  // Persist-first is the rule: a set that cannot be saved must not be applied,
  // or a project the user watched appear would vanish at the next start.
  //
  // The DIRECTORY, not the file: the write is atomic — a temp file renamed over
  // the target — so a read-only config file is still replaceable, and only a
  // read-only directory actually stops it.
  const configDir = path.dirname(server.configFile);
  await chmod(configDir, 0o555);
  t.after(() => chmod(configDir, 0o755).catch(() => {}));

  client.send({ type: "open_project", root: beta });
  const error = await client.waitFor((m) => m.type === "workspace_error");
  assert.match(error.message, /cannot save|could not save/i);

  const second = connect(server.wsUrl());
  t.after(() => second.close());
  const hello = await second.waitFor((m) => m.type === "hello");
  assert.equal(hello.workspaces, undefined, "the project was not opened");
});
