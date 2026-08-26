/**
 * A workspace: one project the server holds open, and everything rooted at it.
 *
 * Before this existed, all of it lived as module-level bindings in index.ts —
 * `AGENT_CWD`, `BROWSER_ROOT`, `WRITABLE_ROOT`, `GIT`, `fileWatcher`,
 * `sandboxedTools`, `runtime`, `activeWorkPlan` — established once at boot and
 * never re-owned. That shape is what makes a server serve exactly one project:
 * there is no second copy of any of it to hand a second project.
 *
 * The set of fields here is not a design; it is an inventory. `handleUpdateConfig`
 * already had to rebuild precisely this list when the sandbox root moved, which is
 * how we know it is complete: anything it forgot would already be a bug today.
 *
 * What a workspace deliberately does NOT own: the HTTP server, the client set, the
 * credential store, and the agentDir. Those are the server's, shared across every
 * workspace, and duplicating them would fragment state that is genuinely global.
 */
import fs from "node:fs/promises";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { AgentRuntime } from "./agentRuntime.ts";
import type { SandboxConfig } from "./config.ts";
import { type DirectoryWatcher, createDirectoryWatcher } from "./fileWatcher.ts";
import { resolveBrowserRoot, resolveWritableRoot } from "./fileBrowser.ts";
import { probeGit } from "./git.ts";
import { createSandboxedTools } from "./sandbox.ts";
import type { WorkPlan } from "@pi-outpost/shared";

/**
 * What a workspace needs to know about itself. A narrow slice of AppConfig rather
 * than the whole thing: everything else in that object is server-wide, and taking
 * the whole config here would let a second workspace read the first one's settings
 * by accident.
 */
export interface WorkspaceSettings {
  /** The project directory. Also the workspace's identity — see `Workspace.root`. */
  cwd: string;
  sandbox?: SandboxConfig;
}

/** Server-wide limits a workspace passes through when it builds its toolset. */
export interface WorkspaceToolLimits {
  pdfMaxBytes: number;
  docxMaxBytes: number;
  xlsxMaxBytes: number;
  pptxMaxBytes: number;
  structuredExchangeMaxBytes: number;
}

export interface WorkspaceOptions {
  settings: WorkspaceSettings;
  limits: WorkspaceToolLimits;
  /** Whether to watch the browser root. Server-wide (`config.files.watch`). */
  watchFiles: boolean;
  /**
   * Tools that are the same on both sides of the sandbox — they read and write
   * nothing on disk, so they are not confined and are appended to every toolset.
   */
  unconfinedTools: ToolDefinition[];
  /**
   * Where a directory change in THIS workspace goes. Scoped by the caller: a
   * watcher fires for one project's tree, and only clients bound to that project
   * may hear about it.
   */
  onDirectoryChanged: (relPath: string) => void;
  /**
   * Builds the agent runtime for this workspace. Injected because the two runtime
   * flavours are assembled from configuration this object deliberately cannot see
   * (extensions, skills, prompt templates, RPC arguments).
   */
  createRuntime: (settings: WorkspaceSettings, sandboxedTools: ToolDefinition[] | undefined) => Promise<AgentRuntime>;
}

export class Workspace {
  /**
   * Identity is the resolved root path — no generated id to persist and reconcile.
   * Opening a directory that is already open is therefore a lookup rather than a
   * duplicate, and a reopened project finds its own history, since `SessionManager`
   * is already keyed by cwd.
   */
  readonly root: string;

  runtime: AgentRuntime;
  settings: WorkspaceSettings;

  browserRoot: string;
  writableRoot: string | null | undefined;
  git: { toplevel: string } | null;
  fileWatcher: DirectoryWatcher | undefined;
  sandboxedTools: ToolDefinition[] | undefined;

  /** Loaded from the runtime's session file by the caller; null until then. */
  workPlan: WorkPlan | null = null;
  workPlanSessionFile: string | undefined;

  private readonly options: WorkspaceOptions;
  private stopped = false;

  private constructor(
    root: string,
    runtime: AgentRuntime,
    resources: WorkspaceResources,
    options: WorkspaceOptions,
  ) {
    this.root = root;
    this.runtime = runtime;
    this.settings = options.settings;
    this.browserRoot = resources.browserRoot;
    this.writableRoot = resources.writableRoot;
    this.git = resources.git;
    this.fileWatcher = resources.fileWatcher;
    this.sandboxedTools = resources.sandboxedTools;
    this.options = options;
  }

  /**
   * Build every resource, then the runtime on top of them — the toolset has to
   * exist before the session that is given it.
   */
  static async open(options: WorkspaceOptions): Promise<Workspace> {
    // Identity is the PROJECT directory, never the browser root: a sandbox may be
    // rooted somewhere else entirely, and keying on that would make a workspace
    // answer to a path its sessions are not stored under — SessionManager is keyed
    // by cwd — and let two different projects collide on one sandbox subtree.
    const root = await fs.realpath(options.settings.cwd);
    const resources = await buildResources(options);
    const runtime = await options.createRuntime(options.settings, resources.sandboxedTools);
    return new Workspace(root, runtime, resources, options);
  }

  /**
   * Whether a turn is running. The one question that gates both retirement and
   * closing: a workspace nobody is watching is the normal state under multi-project,
   * so "unused" can never be allowed to mean "unwatched".
   */
  isBusy(): boolean {
    return this.runtime.snapshot().isStreaming;
  }

  /**
   * Rebuild everything rooted at the sandbox root, after it moved. Every watched
   * path was relative to the root that just moved, so the watcher is replaced
   * rather than kept.
   *
   * The runtime is untouched here: rebuilding its toolset is a separate step the
   * caller owns, because it replaces the live session in front of the user.
   */
  async rebuildResources(settings: WorkspaceSettings): Promise<void> {
    // Build first, adopt second. A failure here — a configured root that no longer
    // exists, a toolset that cannot be constructed — must leave the workspace
    // exactly as it was, settings included: the same discipline handleUpdateConfig
    // already applies, so that nothing ever reports a boundary it did not apply.
    const resources = await buildResources({ ...this.options, settings });
    this.settings = settings;
    this.fileWatcher?.close();
    this.browserRoot = resources.browserRoot;
    this.writableRoot = resources.writableRoot;
    this.git = resources.git;
    this.fileWatcher = resources.fileWatcher;
    this.sandboxedTools = resources.sandboxedTools;
  }

  /**
   * Release everything. Idempotent: retirement and an explicit close can race, and
   * closing a watcher twice is not worth a caller-side guard at every call site.
   */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.fileWatcher?.close();
    this.fileWatcher = undefined;
    await this.runtime.dispose();
  }
}

interface WorkspaceResources {
  browserRoot: string;
  writableRoot: string | null | undefined;
  git: { toplevel: string } | null;
  fileWatcher: DirectoryWatcher | undefined;
  sandboxedTools: ToolDefinition[] | undefined;
}

async function buildResources(options: WorkspaceOptions): Promise<WorkspaceResources> {
  const { settings, limits } = options;
  const browserRoot = await resolveBrowserRoot(settings);
  const writableRoot = await resolveWritableRoot(settings, browserRoot);
  const git = await probeGit(browserRoot);
  const sandboxedTools = settings.sandbox
    ? [
        ...(await createSandboxedTools(
          settings.sandbox,
          limits.pdfMaxBytes,
          limits.docxMaxBytes,
          limits.xlsxMaxBytes,
          limits.pptxMaxBytes,
          limits.structuredExchangeMaxBytes,
        )),
        ...options.unconfinedTools,
      ]
    : undefined;
  const fileWatcher = options.watchFiles
    ? createDirectoryWatcher({ root: browserRoot, onChange: options.onDirectoryChanged })
    : undefined;
  return { browserRoot, writableRoot, git, fileWatcher, sandboxedTools };
}
