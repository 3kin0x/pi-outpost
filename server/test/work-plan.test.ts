import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { mutateWorkPlan, validateWorkPlan, type WorkPlan } from "@pi-outpost/shared/work-plan";
import { applyWorkPlanMutation, copyWorkPlan, deleteWorkPlan, loadWorkPlan, workPlanPath } from "../src/workPlanStore.ts";
import { createWorkPlanToolDefinition } from "../src/workPlanTool.ts";

const base = (): WorkPlan => ({
  version: 1,
  id: "delivery",
  title: "Deliver the change",
  updatedAt: "2026-08-23T00:00:00.000Z",
  tasks: [
    { id: "analyse", title: "Analyse", status: "done", dependsOn: [], resources: [] },
    { id: "build", title: "Build", status: "in_progress", dependsOn: ["analyse"], resources: [{ uri: "workspace:src/index.ts" }] },
  ],
});

describe("Work Plan contract", () => {
  it("keeps task identity while editing and moving", () => {
    const edited = mutateWorkPlan(base(), { action: "update_task", taskId: "build", changes: { title: "Build safely", status: "done" } });
    assert.equal(edited?.tasks[1].id, "build");
    assert.equal(edited?.tasks[1].title, "Build safely");
    const moved = mutateWorkPlan(edited, { action: "move_task", taskId: "build", parentId: "analyse" });
    assert.equal(moved?.tasks[1].parentId, "analyse");
  });

  it("progressively decomposes a task without changing its identity", () => {
    const next = mutateWorkPlan(base(), {
      action: "add_task",
      task: { id: "verify", title: "Verify", status: "todo", parentId: "build", dependsOn: [], resources: [] },
    });
    assert.equal(next?.tasks.find((task) => task.id === "build")?.title, "Build");
    assert.equal(next?.tasks.find((task) => task.id === "verify")?.parentId, "build");
  });

  it("does not infer completion from unrelated activity", () => {
    const current = base();
    assert.deepEqual(mutateWorkPlan(current, { action: "get" }), current);
    assert.equal(current.tasks[1].status, "in_progress");
  });

  it("clears optional task text through JSON null", () => {
    const blocked = mutateWorkPlan(base(), {
      action: "update_task",
      taskId: "build",
      changes: { description: "Still working", status: "blocked", statusReason: "Waiting" },
    });
    const reopened = mutateWorkPlan(blocked, {
      action: "update_task",
      taskId: "build",
      changes: { description: null, status: "in_progress", statusReason: null },
    });
    assert.equal(reopened?.tasks[1].description, undefined);
    assert.equal(reopened?.tasks[1].statusReason, undefined);
  });

  it("rejects invalid hierarchy and dependency cycles without changing the input", () => {
    const plan = base();
    assert.throws(() => mutateWorkPlan(plan, { action: "move_task", taskId: "analyse", parentId: "missing" }), /unknown parent/);
    assert.throws(() => mutateWorkPlan(plan, { action: "set_dependencies", taskId: "analyse", dependsOn: ["build"] }), /dependency cycle/);
    assert.deepEqual(plan, base());
  });

  it("rejects a plan whose aggregate serialized state is too large", () => {
    const oversized = {
      ...base(),
      tasks: Array.from({ length: 130 }, (_, index) => ({
        id: `task-${index}`,
        title: `Task ${index}`,
        description: "x".repeat(4_000),
        status: "todo",
        dependsOn: [],
        resources: [],
      })),
    };
    assert.throws(() => validateWorkPlan(oversized), /larger than 500000 bytes/);
  });

  it("removes descendants and cleans dependencies atomically", () => {
    const nested = validateWorkPlan({ ...base(), tasks: [...base().tasks, { id: "verify", title: "Verify", status: "todo", parentId: "build", dependsOn: ["build"], resources: [] }] });
    const next = mutateWorkPlan(nested, { action: "remove_task", taskId: "build" });
    assert.deepEqual(next?.tasks.map((task) => task.id), ["analyse"]);
  });
});

describe("Work Plan persistence", () => {
  it("loads absence, persists atomically, copies forks, and deletes with the session", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-outpost-work-plan-"));
    try {
      const source = path.join(root, "source.jsonl");
      const fork = path.join(root, "fork.jsonl");
      assert.equal(await loadWorkPlan(source), null);
      await applyWorkPlanMutation(source, { action: "replace", plan: base() });
      assert.deepEqual(await loadWorkPlan(source), base());
      await copyWorkPlan(source, fork);
      await applyWorkPlanMutation(fork, { action: "update_task", taskId: "build", changes: { status: "done" } });
      assert.equal((await loadWorkPlan(source))?.tasks[1].status, "in_progress");
      assert.equal((await loadWorkPlan(fork))?.tasks[1].status, "done");
      await deleteWorkPlan(source);
      assert.equal(await loadWorkPlan(source), null);
      assert.equal(await fs.stat(workPlanPath(source)).catch(() => null), null);
      assert.deepEqual((await fs.readdir(root)).filter((name) => name.includes(".tmp")), []);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("work_plan tool", () => {
  it("frames the plan as maintained working state rather than progress ceremony", () => {
    const tool = createWorkPlanToolDefinition();
    const guidance = [tool.description, ...(tool.promptGuidelines ?? [])].join(" ");
    assert.match(guidance, /working.state/i);
    assert.match(guidance, /decomposition/i);
    assert.match(guidance, /verification/i);
    assert.match(guidance, /reconcile.*before declaring/i);
    assert.match(guidance, /trivial/i);
  });

  it("returns authoritative details and refuses a partial invalid mutation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-outpost-work-plan-tool-"));
    try {
      const sessionFile = path.join(root, "session.jsonl");
      await fs.writeFile(sessionFile, "original conversation\n");
      const tool = createWorkPlanToolDefinition();
      const ctx = { sessionManager: { getSessionFile: () => sessionFile } } as never;
      const replaced = await tool.execute("call-1", { action: "replace", plan: base() }, undefined, undefined, ctx);
      assert.equal((replaced.details as { type: string }).type, "work_plan");
      await fs.writeFile(sessionFile, "compacted conversation summary\n");
      const restored = await tool.execute("call-resume", { action: "get" }, undefined, undefined, ctx);
      assert.deepEqual((restored.details as { plan: WorkPlan }).plan, base());
      const modelContent = (restored.content[0] as { text: string }).text;
      assert.match(modelContent, /\"id\":\"build\"/);
      assert.match(modelContent, /workspace:src\/index\.ts/);
      const refused = await tool.execute("call-2", { action: "move_task", taskId: "build", parentId: "missing" }, undefined, undefined, ctx);
      assert.equal(refused.isError, true);
      assert.deepEqual(await loadWorkPlan(sessionFile), base());
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
