import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { outcomeVerification, workPlanProgress, type WorkPlan } from "@pi-outpost/shared";

function plan(statuses: WorkPlan["tasks"][number]["status"][], results: WorkPlan["tasks"][number]["evidence"][number]["result"][] = []): WorkPlan {
  return {
    version: 1,
    id: "plan",
    title: "Outcome",
    updatedAt: "2026-09-01T00:00:00.000Z",
    tasks: statuses.map((status, index) => ({
      id: `task-${index}`,
      title: `Task ${index}`,
      status,
      dependsOn: [],
      resources: [],
      evidence: index === 0 ? results.map((result, evidenceIndex) => ({ id: `e-${evidenceIndex}`, type: "test", result })) : [],
    })),
  };
}

describe("Outcome shared aggregates", () => {
  test("counts every Work Plan status without inferring completion", () => {
    assert.deepEqual(workPlanProgress(plan(["todo", "in_progress", "done", "blocked", "needs_review"])), {
      todo: 1,
      in_progress: 1,
      done: 1,
      blocked: 1,
      needs_review: 1,
    });
  });

  test("uses conservative verification precedence", () => {
    assert.equal(outcomeVerification(plan(["done"], ["passed", "failed"])), "failed");
    assert.equal(outcomeVerification(plan(["done"], ["passed", "inconclusive"])), "inconclusive");
    assert.equal(outcomeVerification(plan(["done"], ["passed", "informational"])), "passed");
    assert.equal(outcomeVerification(plan(["done"], ["informational"])), "not-recorded");
    assert.equal(outcomeVerification(plan(["done"])), "not-recorded");
    assert.equal(outcomeVerification(null), "not-recorded");
  });
});
