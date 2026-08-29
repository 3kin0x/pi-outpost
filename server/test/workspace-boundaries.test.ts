import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Workspace, shouldRetireWorkspace, type WorkspaceOptions } from "../src/workspace.ts";

const limits = {
  pdfMaxBytes: 1_000_000,
  docxMaxBytes: 1_000_000,
  xlsxMaxBytes: 1_000_000,
  pptxMaxBytes: 1_000_000,
  structuredExchangeMaxBytes: 1_000_000,
};

function options(cwd: string, sandboxRoot = cwd): WorkspaceOptions {
  return {
    settings: {
      cwd,
      sandbox: { root: sandboxRoot, allowWrite: false, allowBash: false, readExceptions: [] },
    },
    limits,
    watchFiles: true,
    unconfinedTools: [],
    onDirectoryChanged: () => {},
    createRuntime: async () => {
      throw new Error("Workspace.create must not build a runtime");
    },
  };
}

async function runPath(tool: ToolDefinition, target: string): Promise<unknown> {
  return tool.execute("call-1", { path: target }, undefined);
}

async function fixture(): Promise<{ parent: string; alpha: string; beta: string; moved: string }> {
  const parent = await mkdtemp(path.join(tmpdir(), "pi-workspace-boundaries-"));
  const alpha = path.join(parent, "alpha");
  const beta = path.join(parent, "beta");
  const moved = path.join(parent, "alpha-moved");
  await Promise.all([alpha, beta, moved].map((dir) => mkdir(dir)));
  await Promise.all([
    writeFile(path.join(alpha, "alpha.txt"), "alpha\n"),
    writeFile(path.join(beta, "secret.txt"), "beta\n"),
    writeFile(path.join(moved, "moved.txt"), "moved\n"),
  ]);
  return {
    parent,
    alpha: await realpath(alpha),
    beta: await realpath(beta),
    moved: await realpath(moved),
  };
}

// openlore: scenario=SandboxIsPerWorkspace spec=multi-project-workspaces
describe("SandboxIsPerWorkspace", () => {
  test("the actual read tool of one workspace refuses another workspace's file", async (t) => {
    const dirs = await fixture();
    t.after(() => rm(dirs.parent, { recursive: true, force: true }));
    const [alpha, beta] = await Promise.all([Workspace.create(options(dirs.alpha)), Workspace.create(options(dirs.beta))]);
    t.after(() => Promise.all([alpha.stop(), beta.stop()]));

    const read = alpha.sandboxedTools?.find((tool) => tool.name === "read");
    assert.ok(read, "the workspace owns a real sandboxed read tool");
    await assert.rejects(() => runPath(read, path.join(dirs.beta, "secret.txt")), /outside the sandbox/);
  });
});

// openlore: scenario=WorkspaceOwnsItsResources spec=workspace-architecture
describe("WorkspaceOwnsItsResources", () => {
  test("moving one sandbox root replaces only that workspace's watcher and toolset", async (t) => {
    const dirs = await fixture();
    t.after(() => rm(dirs.parent, { recursive: true, force: true }));
    const [alpha, beta] = await Promise.all([Workspace.create(options(dirs.alpha)), Workspace.create(options(dirs.beta))]);
    t.after(() => Promise.all([alpha.stop(), beta.stop()]));
    const betaResources = {
      browserRoot: beta.browserRoot,
      watcher: beta.fileWatcher,
      tools: beta.sandboxedTools,
    };
    const alphaWatcher = alpha.fileWatcher;
    const alphaTools = alpha.sandboxedTools;

    await alpha.rebuildResources(options(dirs.alpha, dirs.moved).settings);

    assert.equal(alpha.browserRoot, dirs.moved);
    assert.notEqual(alpha.fileWatcher, alphaWatcher);
    assert.notEqual(alpha.sandboxedTools, alphaTools);
    assert.equal(beta.browserRoot, betaResources.browserRoot);
    assert.equal(beta.fileWatcher, betaResources.watcher);
    assert.equal(beta.sandboxedTools, betaResources.tools);
    const betaRead = beta.sandboxedTools?.find((tool) => tool.name === "read");
    assert.ok(betaRead);
    await assert.doesNotReject(() => runPath(betaRead, "secret.txt"));
  });
});

// openlore: scenario=RetirementDisabled spec=workspace-config
describe("RetirementDisabled", () => {
  test("a zero timeout cannot retire even a long-idle, unwatched workspace", () => {
    assert.equal(
      shouldRetireWorkspace({ timeoutMs: 0, now: 100_000, lastUsedAt: 0, watched: false, busy: false }),
      false,
    );
  });

  test("the same workspace retires once a positive timeout has elapsed", () => {
    assert.equal(
      shouldRetireWorkspace({ timeoutMs: 30_000, now: 100_000, lastUsedAt: 0, watched: false, busy: false }),
      true,
    );
  });
});

// openlore: scenario=RetirementIsNotClosing spec=workspace-config
describe("a retired workspace releases its renderers", () => {
  test("retiring drops the extension renderers that close over the disposed session", async (t) => {
    const dirs = await fixture();
    t.after(() => rm(dirs.parent, { recursive: true, force: true }));
    const alpha = await Workspace.create(options(dirs.alpha));
    t.after(() => alpha.stop());

    // What `refreshExtensionRender` installs: closures over the workspace's live
    // agent. Held past retirement they keep the whole runtime reachable.
    alpha.renderer.configure({
      getToolDefinition: () => undefined,
      getMessageRenderer: () => ((() => ({ render: () => ["drawn by the extension"] })) as never),
      cwd: dirs.alpha,
    });
    assert.ok(alpha.renderer.renderCustomMessageHtml("plan", "content", undefined, true));

    await alpha.retire();

    assert.equal(alpha.renderer.renderCustomMessageHtml("plan", "content", undefined, true), undefined);
  });
});
