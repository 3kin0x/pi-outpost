/**
 * The open projects, keyed by their resolved root.
 *
 * Thin on purpose. What it exists to own is the *identity* rule — a directory maps
 * to at most one workspace — because that is what makes opening an already-open
 * directory a lookup rather than a duplicate, and what lets a reopened project find
 * its own history: `SessionManager` is keyed by cwd, so two workspaces sharing a
 * root would share a session store while believing they did not.
 *
 * It is not a lifecycle manager: opening and retiring are the server's business,
 * because both have to persist the open set and talk to clients first.
 */
import type { Workspace } from "./workspace.ts";

export class WorkspaceRegistry {
  private readonly byRoot = new Map<string, Workspace>();

  /**
   * The workspace a connection gets when it names none. The first one added, and
   * the only one on a server where nothing has been opened — which is what keeps
   * an existing configuration and an existing client working untouched.
   */
  private defaultRoot: string | undefined;

  /**
   * Register a workspace, and return the one that holds the root — which is the
   * argument, unless something is already registered there.
   *
   * Returning the incumbent rather than replacing it is what makes the identity
   * rule survive a race: two opens of the same directory can both finish building
   * before either registers, and an overwrite would leave the loser live — clients,
   * watcher, runtime and pending requests intact — while `all()` no longer returns
   * it, so nothing would ever cancel or stop it. The caller compares the result
   * with what it passed and disposes of the loser.
   */
  add(workspace: Workspace): Workspace {
    const existing = this.byRoot.get(workspace.root);
    if (existing) return existing;
    this.byRoot.set(workspace.root, workspace);
    this.defaultRoot ??= workspace.root;
    return workspace;
  }

  /** Undefined when nothing is open at that root — never a fresh, empty workspace. */
  get(root: string): Workspace | undefined {
    return this.byRoot.get(root);
  }

  remove(root: string): void {
    this.byRoot.delete(root);
    if (this.defaultRoot !== root) return;
    // The default just closed: promote whatever remains rather than leaving the
    // server with no answer for a connection that names nothing.
    this.defaultRoot = this.byRoot.keys().next().value;
  }

  get default(): Workspace | undefined {
    return this.defaultRoot === undefined ? undefined : this.byRoot.get(this.defaultRoot);
  }

  get size(): number {
    return this.byRoot.size;
  }

  all(): Iterable<Workspace> {
    return this.byRoot.values();
  }
}
