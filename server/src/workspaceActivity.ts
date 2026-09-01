import type { WorkspaceActivity } from "@pi-outpost/shared";

export interface WorkspaceActivityState {
  starting: boolean;
  started: boolean;
  waiting: boolean;
  busy: boolean;
  workPlanReadyForReview: boolean;
}

/** One server-owned precedence table for every workspace summary consumer. */
export function deriveWorkspaceActivity(state: WorkspaceActivityState): WorkspaceActivity {
  if (state.starting) return "starting";
  if (!state.started) return "stopped";
  if (state.waiting) return "waiting";
  if (state.busy) return "working";
  if (state.workPlanReadyForReview) return "ready-for-review";
  return "idle";
}

export function workspaceActivityNeedsAttention(activity: WorkspaceActivity): boolean {
  return activity === "waiting" || activity === "ready-for-review";
}
