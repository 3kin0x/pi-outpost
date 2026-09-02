import type { GitFileState, WorkPlan, WorkPlanEvidenceResult, WorkPlanStatus } from "./protocol.ts";

export type OutcomeAvailability = "available" | "empty" | "partial" | "unavailable";
export type OutcomeVerification = "passed" | "failed" | "inconclusive" | "not-recorded";
export type OutcomeStatus = WorkPlanStatus | WorkPlanEvidenceResult | GitFileState | OutcomeVerification | "unavailable";

/** The only actions an Outcome entry may offer. Render payloads never carry executable action names. */
export type OutcomeTarget =
  | { kind: "work-plan-task"; taskId: string }
  | { kind: "workspace-file"; path: string }
  | { kind: "workspace-diff"; path: string }
  | { kind: "external-url"; url: string };

export interface OutcomeEntry {
  id: string;
  source: string;
  title: string;
  status: OutcomeStatus;
  detail?: string;
  group?: string;
  reference?: string;
  target?: OutcomeTarget;
}

export interface OutcomeSection {
  id: string;
  title: string;
  order: number;
  availability: OutcomeAvailability;
  summary?: string;
  entries: OutcomeEntry[];
}

export interface WorkspaceOutcome {
  workspaceRoot: string;
  sessionId: string;
  sections: OutcomeSection[];
}

export type WorkPlanProgress = Record<WorkPlanStatus, number>;

export function workPlanProgress(plan: WorkPlan | null): WorkPlanProgress {
  const progress: WorkPlanProgress = { todo: 0, in_progress: 0, done: 0, blocked: 0, needs_review: 0 };
  for (const task of plan?.tasks ?? []) progress[task.status] += 1;
  return progress;
}

/** Conservative verification aggregate. Informational records are visible but do not verify work. */
export function outcomeVerification(plan: WorkPlan | null): OutcomeVerification {
  const results = (plan?.tasks ?? []).flatMap((task) => task.evidence.map((evidence) => evidence.result));
  if (results.includes("failed")) return "failed";
  if (results.includes("inconclusive")) return "inconclusive";
  if (results.includes("passed")) return "passed";
  return "not-recorded";
}
