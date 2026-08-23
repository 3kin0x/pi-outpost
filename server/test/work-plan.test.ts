import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { mutateWorkPlan, normalizeWorkPlanDraft, validateWorkPlan, WORK_PLAN_LIMITS, type WorkPlan } from "@pi-outpost/shared/work-plan";
import { applyWorkPlanMutation, copyWorkPlan, deleteWorkPlan, loadWorkPlan, sameSessionFile, workPlanPath } from "../src/workPlanStore.ts";
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
  it("normalizes a minimal creation draft into a canonical version-1 plan", () => {
    const generated = ["plan-generated", "task-one", "task-two"];
    const plan = normalizeWorkPlanDraft(
      { title: "Ship safely", tasks: [{ title: "Build" }, { title: "Verify" }] },
      { nextId: () => generated.shift()!, now: () => "2026-08-23T12:00:00.000Z" },
    );
    assert.deepEqual(plan, {
      version: 1,
      id: "plan-generated",
      title: "Ship safely",
      updatedAt: "2026-08-23T12:00:00.000Z",
      tasks: [
        { id: "task-one", title: "Build", status: "todo", dependsOn: [], resources: [] },
        { id: "task-two", title: "Verify", status: "todo", dependsOn: [], resources: [] },
      ],
    });
  });

  it("preserves explicit fields and flattens tasks plus one subtask level", () => {
    let id = 0;
    const nested = (depth: number): Record<string, unknown> => ({
      title: `Level ${depth}`,
      ...(depth === 1
        ? {
            description: "Explicit description",
            status: "blocked",
            statusReason: "Waiting for review",
            resources: [{ uri: "workspace:src/index.ts", label: "Entry point" }],
          }
        : {}),
      ...(depth < 2 ? { subtasks: [nested(depth + 1)] } : {}),
    });
    const plan = normalizeWorkPlanDraft(
      { title: "Nested", tasks: [nested(1)] },
      { nextId: () => `generated-${id++}`, now: () => "2026-08-23T12:00:00.000Z" },
    );
    assert.equal(plan.version, 1);
    assert.equal(plan.tasks.length, 2);
    assert.deepEqual(plan.tasks.map((task) => task.parentId), [undefined, "generated-1"]);
    assert.deepEqual(plan.tasks[0], {
      id: "generated-1",
      title: "Level 1",
      description: "Explicit description",
      status: "blocked",
      statusReason: "Waiting for review",
      dependsOn: [],
      resources: [{ uri: "workspace:src/index.ts", label: "Entry point" }],
    });
  });

  it("rejects depth, total-task, generated-ID, and serialized-size violations", () => {
    const nested = (depth: number): Record<string, unknown> => ({
      title: `Level ${depth}`,
      ...(depth < 3 ? { subtasks: [nested(depth + 1)] } : {}),
    });
    assert.throws(
      () => normalizeWorkPlanDraft({ title: "Too deep", tasks: [nested(1)] }),
      /at most 2 levels/,
    );
    assert.throws(
      () => normalizeWorkPlanDraft({
        title: "Too many",
        tasks: [{ title: "Root", subtasks: Array.from({ length: 500 }, (_, index) => ({ title: `Task ${index}` })) }],
      }),
      /at most 500 tasks/,
    );
    assert.throws(
      () => normalizeWorkPlanDraft(
        { title: "Collision", tasks: [{ title: "Task" }] },
        { nextId: () => "same-id" },
      ),
      /unique Work Plan identifier/,
    );
    assert.throws(
      () => normalizeWorkPlanDraft({
        title: "Too large",
        tasks: Array.from({ length: 20 }, (_, index) => ({ title: `Task ${index}`, description: "x".repeat(4_000) })),
      }),
      new RegExp(`larger than ${WORK_PLAN_LIMITS.serializedBytes} bytes`),
    );
  });

  it("rejects persistence fields in the ergonomic draft", () => {
    assert.throws(
      () => normalizeWorkPlanDraft({ title: "No IDs", tasks: [{ id: "caller-id", title: "Task" }] }),
      /tasks\[0\]\.id is not accepted/,
    );
  });

  it("keeps task identity while editing and moving", () => {
    const edited = mutateWorkPlan(base(), { action: "update_task", taskId: "build", changes: { title: "Build safely", status: "done" } });
    assert.equal(edited?.tasks[1].id, "build");
    assert.equal(edited?.tasks[1].title, "Build safely");
    const moved = mutateWorkPlan(edited, { action: "move_task", taskId: "build", parentId: "analyse" });
    assert.equal(moved?.tasks[1].parentId, "analyse");
  });

  it("keeps every unspecified field in a typed partial update", () => {
    const next = mutateWorkPlan(base(), {
      action: "update_task",
      taskId: "build",
      changes: { title: "Build carefully" },
    });
    assert.deepEqual(next?.tasks[1], {
      ...base().tasks[1],
      title: "Build carefully",
    });
  });

  it("progressively decomposes a task without changing its identity", () => {
    const next = mutateWorkPlan(base(), {
      action: "add_task",
      task: { id: "verify", title: "Verify", status: "todo", parentId: "build", dependsOn: [], resources: [] },
    });
    assert.equal(next?.tasks.find((task) => task.id === "build")?.title, "Build");
    assert.equal(next?.tasks.find((task) => task.id === "verify")?.parentId, "build");
  });

  it("keeps status unchanged when an explicit Work Plan operation only reads it", () => {
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

  it("promotes a task to the root when update_task clears parentId with JSON null", () => {
    const nested = mutateWorkPlan(base(), { action: "move_task", taskId: "build", parentId: "analyse" });
    const promoted = mutateWorkPlan(nested, {
      action: "update_task",
      taskId: "build",
      changes: { parentId: null },
    });
    assert.equal(promoted?.tasks[1].parentId, undefined);
  });

  it("rejects duplicate resource URIs before they reach keyed UI rows", () => {
    assert.throws(
      () => mutateWorkPlan(base(), {
        action: "set_resources",
        taskId: "build",
        resources: [{ uri: "workspace:a" }, { uri: "workspace:a", label: "duplicate" }],
      }),
      /duplicate resource URI/,
    );
  });

  it("rejects invalid hierarchy and dependency cycles without changing the input", () => {
    const plan = base();
    assert.throws(() => mutateWorkPlan(plan, { action: "move_task", taskId: "analyse", parentId: "missing" }), /unknown parent/);
    assert.throws(() => mutateWorkPlan(plan, { action: "set_dependencies", taskId: "analyse", dependsOn: ["build"] }), /dependency cycle/);
    assert.deepEqual(plan, base());
  });

  it("rejects a duplicate add_task identity without changing the plan", () => {
    const plan = base();
    assert.throws(
      () => mutateWorkPlan(plan, {
        action: "add_task",
        task: { id: "build", title: "Duplicate", status: "todo", dependsOn: [], resources: [] },
      }),
      /duplicate task id: build/,
    );
    assert.deepEqual(plan, base());
  });

  it("keeps normalized version-1 replacement compatible", () => {
    assert.deepEqual(mutateWorkPlan(null, { action: "replace", plan: base() }), base());
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
    assert.throws(
      () => validateWorkPlan(oversized),
      new RegExp(`larger than ${WORK_PLAN_LIMITS.serializedBytes} bytes`),
    );
    assert.ok(WORK_PLAN_LIMITS.serializedBytes <= 64 * 1024, "a get must not refill a compacted model context");
  });

  it("removes descendants and cleans dependencies atomically", () => {
    const nested = validateWorkPlan({ ...base(), tasks: [...base().tasks, { id: "verify", title: "Verify", status: "todo", parentId: "build", dependsOn: ["build"], resources: [] }] });
    const next = mutateWorkPlan(nested, { action: "remove_task", taskId: "build" });
    assert.deepEqual(next?.tasks.map((task) => task.id), ["analyse"]);
  });
});

describe("Work Plan persistence", () => {
  it("recognises equivalent relative and canonical session paths", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-outpost-work-plan-path-"));
    try {
      const sessionFile = path.join(root, "session.jsonl");
      await fs.writeFile(sessionFile, "");
      const relative = path.relative(process.cwd(), sessionFile);
      assert.equal(sameSessionFile(relative, await fs.realpath(sessionFile)), true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

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

  it("does not create a sidecar when any nested creation task is invalid", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-outpost-work-plan-invalid-create-"));
    try {
      const sessionFile = path.join(root, "session.jsonl");
      await assert.rejects(
        applyWorkPlanMutation(sessionFile, {
          action: "create",
          title: "Invalid",
          tasks: [{ title: "Valid" }, { title: "" }],
        }),
        /task.title must be a non-empty string/,
      );
      assert.equal(await loadWorkPlan(sessionFile), null);
      assert.equal(await fs.stat(workPlanPath(sessionFile)).catch(() => null), null);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("work_plan tool", () => {
  it("publishes a bounded action-specific schema with no unconstrained payload", () => {
    const schema = createWorkPlanToolDefinition().parameters as unknown as Record<string, unknown>;
    const emptySchemas: string[] = [];
    const walk = (value: unknown, at: string): void => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return;
      const record = value as Record<string, unknown>;
      if (Object.keys(record).length === 0) emptySchemas.push(at);
      for (const [key, child] of Object.entries(record)) {
        if (Array.isArray(child)) child.forEach((item, index) => walk(item, `${at}.${key}[${index}]`));
        else walk(child, `${at}.${key}`);
      }
    };
    walk(schema, "$parameters");
    assert.deepEqual(emptySchemas, [], `unconstrained schema nodes: ${emptySchemas.join(", ")}`);

    const branches = schema.anyOf as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(branches), "the root is an action-specific union");
    const branch = (action: string): Record<string, unknown> => {
      const found = branches.find((candidate) => {
        const properties = candidate.properties as Record<string, Record<string, unknown>> | undefined;
        return properties?.action?.const === action;
      });
      assert.ok(found, `missing ${action} branch`);
      return found;
    };
    const actions = [
      "get", "clear", "create", "replace", "add_task", "update_task", "move_task",
      "remove_task", "set_dependencies", "set_resources",
    ];
    for (const action of actions) branch(action);

    const create = branch("create");
    assert.deepEqual(create.required, ["action", "title", "tasks"]);
    let tasks = (create.properties as Record<string, Record<string, unknown>>).tasks;
    assert.match(String(tasks.description), /500 tasks total.*65536 serialized bytes/);
    for (let depth = 1; depth <= 2; depth += 1) {
      assert.equal(tasks.maxItems, WORK_PLAN_LIMITS.tasks, `task collection at depth ${depth} exposes its ceiling`);
      const draft = tasks.items as Record<string, unknown>;
      assert.deepEqual(draft.required, ["title"]);
      const properties = draft.properties as Record<string, Record<string, unknown>>;
      const statuses = (properties.status.anyOf as Array<Record<string, unknown>>).map((item) => item.const);
      assert.deepEqual(statuses, ["todo", "in_progress", "done", "blocked", "needs_review"]);
      if (depth < 2) tasks = properties.subtasks;
      else assert.equal(properties.subtasks, undefined, "subtasks cannot nest again");
    }

    assert.deepEqual(branch("replace").required, ["action", "plan"]);
    assert.deepEqual(branch("add_task").required, ["action", "task"]);
    assert.deepEqual(branch("update_task").required, ["action", "taskId", "changes"]);
    const changes = (branch("update_task").properties as Record<string, Record<string, unknown>>).changes;
    const changeProperties = changes.properties as Record<string, Record<string, unknown>>;
    for (const field of ["description", "statusReason", "parentId"]) {
      assert.ok(
        (changeProperties[field].anyOf as Array<Record<string, unknown>>).some((candidate) => candidate.type === "null"),
        `${field} declares JSON null clearing`,
      );
    }
  });

  it("keeps behavioral selection guidance out of the mechanical tool contract", () => {
    const tool = createWorkPlanToolDefinition();
    const guidance = [tool.description, ...(tool.promptGuidelines ?? [])].join(" ");
    assert.match(guidance, /persistent Work Plan/i);
    assert.doesNotMatch(guidance, /non-trivial|resume|reconcile|before declaring|skip/i);
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
      assert.ok(
        Buffer.byteLength(modelContent) <= WORK_PLAN_LIMITS.serializedBytes + 512,
        "the model-facing response stays within the plan's compact context budget",
      );
      assert.match(modelContent, /\"id\":\"build\"/);
      assert.match(modelContent, /workspace:src\/index\.ts/);
      const refused = await tool.execute("call-2", { action: "move_task", taskId: "build", parentId: "missing" }, undefined, undefined, ctx);
      assert.equal(refused.isError, true);
      assert.deepEqual(await loadWorkPlan(sessionFile), base());
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("creates once from a compact hierarchy and returns the bounded authoritative plan", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-outpost-work-plan-create-"));
    try {
      const sessionFile = path.join(root, "session.jsonl");
      await fs.writeFile(sessionFile, "conversation\n");
      const tool = createWorkPlanToolDefinition();
      const ctx = { sessionManager: { getSessionFile: () => sessionFile } } as never;
      const created = await tool.execute("create-1", {
        action: "create",
        title: "Deliver",
        tasks: [{ title: "Build", subtasks: [{ title: "Verify", status: "needs_review" }] }],
      }, undefined, undefined, ctx);
      assert.notEqual(created.isError, true);
      const plan = (created.details as { plan: WorkPlan }).plan;
      assert.equal(plan.version, 1);
      assert.equal(plan.tasks.length, 2);
      assert.equal(plan.tasks[1].parentId, plan.tasks[0].id);
      assert.match((created.content[0] as { text: string }).text, new RegExp(`"id":"${plan.tasks[0].id}"`));
      assert.ok(Buffer.byteLength((created.content[0] as { text: string }).text) <= WORK_PLAN_LIMITS.serializedBytes + 512);

      const refused = await tool.execute("create-2", {
        action: "create",
        title: "Overwrite",
        tasks: [{ title: "Replace existing state" }],
      }, undefined, undefined, ctx);
      assert.equal(refused.isError, true);
      assert.match((refused.content[0] as { text: string }).text, /already has a Work Plan.*replace/i);
      assert.deepEqual(await loadWorkPlan(sessionFile), plan);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
