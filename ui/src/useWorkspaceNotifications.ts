/**
 * Raise a browser notification when a project the user is not watching needs them.
 *
 * Three levels, and the third is a prohibition (see the spec's
 * RaiseAttentionFromABackgroundWorkspace, and the design canvas):
 *
 *  - document in the foreground: the selector's badge alone. Nothing moves,
 *    nothing opens, the focus stays where it is.
 *  - document unattended: the badge plus one notification PER waiting project,
 *    each naming its own — a notification that does not say where to click cannot
 *    be acted on, so a coalesced "2 projects need you" would be worse than none.
 *  - never: a modal over the project the user is currently looking at. A question
 *    raised in one workspace must not seize the screen of another.
 */
import { useEffect, useRef } from "react";
import type { WorkspaceInfo } from "@pi-outpost/shared";

export function useWorkspaceNotifications(workspaces: WorkspaceInfo[], activeRoot: string | null): void {
  /** Roots already notified, so one blocked turn raises one notification. */
  const notified = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof Notification === "undefined") return;

    const waiting = workspaces.filter((w) => w.needsAttention && w.root !== activeRoot);

    // Cleared as soon as a project stops waiting, so the NEXT question there
    // notifies again rather than being swallowed as a duplicate.
    for (const root of [...notified.current]) {
      if (!waiting.some((w) => w.root === root)) notified.current.delete(root);
    }

    // Asking is the user's call to make; never prompt for permission on our own.
    if (Notification.permission !== "granted") return;
    // The badge already covers the foreground case, and interrupting someone who
    // is looking at the app is the level this design refuses.
    if (typeof document !== "undefined" && document.visibilityState === "visible") return;

    for (const workspace of waiting) {
      if (notified.current.has(workspace.root)) continue;
      notified.current.add(workspace.root);
      try {
        new Notification(`${workspace.name} needs you`, {
          body: "The agent needs an answer to continue.",
          // One notification per project, replaced rather than stacked if that
          // project asks again.
          tag: `pi-outpost:${workspace.root}`,
        });
      } catch {
        // A browser that refuses to construct one is not a failure worth surfacing:
        // the badge is still there, and it is the level that always works.
      }
    }
  }, [workspaces, activeRoot]);
}
