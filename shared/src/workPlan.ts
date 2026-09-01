export const WORK_PLAN_STATUSES = ["todo", "in_progress", "done", "blocked", "needs_review"] as const;
export type WorkPlanStatus = (typeof WORK_PLAN_STATUSES)[number];

/** Every operation the tool accepts; the tool schema publishes this list verbatim. */
export const WORK_PLAN_ACTIONS = [
  "get",
  "create",
  "replace",
  "add_task",
  "update_task",
  "move_task",
  "remove_task",
  "set_dependencies",
  "set_resources",
  "clear",
] as const;
export type WorkPlanAction = (typeof WORK_PLAN_ACTIONS)[number];

export interface WorkPlanResource {
  /** Generic address. `workspace:<path>` is navigable by Pi Outpost. */
  uri: string;
  label?: string;
}

export interface WorkPlanTask {
  id: string;
  title: string;
  description?: string;
  status: WorkPlanStatus;
  parentId?: string;
  dependsOn: string[];
  resources: WorkPlanResource[];
  statusReason?: string;
}

export interface WorkPlan {
  version: 1;
  id: string;
  title: string;
  tasks: WorkPlanTask[];
  updatedAt: string;
}

/**
 * Whether the authoritative plan says background work is complete and awaits a
 * human review. Every task participates, including parents: an unreconciled
 * container must not make the workspace look finished just because one child is
 * ready.
 */
export function isWorkPlanReadyForReview(plan: WorkPlan | null): boolean {
  return plan !== null
    && plan.tasks.length > 0
    && plan.tasks.some((task) => task.status === "needs_review")
    && plan.tasks.every((task) => task.status === "done" || task.status === "needs_review");
}

export const WORK_PLAN_LIMITS = {
  // `action=get` returns the complete plan to the model after resume/compaction.
  // Keep that recovery state useful without letting it refill an entire context.
  serializedBytes: 64 * 1024,
  tasks: 500,
  title: 200,
  description: 4_000,
  reason: 2_000,
  resourcesPerTask: 50,
  uri: 2_000,
} as const;

/** Finite agent-facing creation schema; persisted plans remain a flat graph. */
export const WORK_PLAN_CREATE_MAX_DEPTH = 2;

export interface WorkPlanDraftTask {
  /** Optional caller-chosen identity; generated when omitted. */
  id?: string;
  title: string;
  description?: string;
  status?: WorkPlanStatus;
  statusReason?: string;
  resources?: WorkPlanResource[];
  /** Ids of other tasks in the same draft; resolved once the whole tree is read. */
  dependsOn?: string[];
  subtasks?: WorkPlanDraftTask[];
}

export interface WorkPlanDraft {
  title: string;
  tasks: WorkPlanDraftTask[];
}

export interface WorkPlanDraftNormalizationOptions {
  /** Injectable seams keep identity and time assertions deterministic. */
  nextId?: () => string;
  now?: () => string;
}

export type WorkPlanMutation =
  | { action: "get" }
  | { action: "clear" }
  | { action: "create"; title: unknown; tasks: unknown }
  | { action: "replace"; plan: unknown }
  | { action: "add_task"; task: unknown }
  | { action: "update_task"; taskId: string; changes?: unknown }
  | { action: "move_task"; taskId: string; parentId?: string | null }
  | { action: "remove_task"; taskId: string }
  | { action: "set_dependencies"; taskId: string; dependsOn: unknown }
  | { action: "set_resources"; taskId: string; resources: unknown };

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("must be an object");
  return value as Record<string, unknown>;
}

function onlyFields(raw: Record<string, unknown>, allowed: readonly string[], field: string): void {
  const unexpected = Object.keys(raw).find((key) => !allowed.includes(key));
  if (unexpected !== undefined) throw new Error(`${field}.${unexpected} is not accepted`);
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} must be a non-empty string`);
  if (value.length > max) throw new Error(`${field} is longer than ${max} characters`);
  return value.trim();
}

function optionalText(value: unknown, field: string, max: number): string | undefined {
  // `null` is the JSON-representable way for an agent to clear an optional
  // field; `undefined` cannot survive the tool-call serialization boundary.
  if (value === undefined || value === null) return undefined;
  return text(value, field, max);
}

function ids(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  const result = value.map((item, index) => text(item, `${field}[${index}]`, WORK_PLAN_LIMITS.title));
  if (new Set(result).size !== result.length) throw new Error(`${field} contains duplicates`);
  return result;
}

function resources(value: unknown): WorkPlanResource[] {
  if (!Array.isArray(value)) throw new Error("resources must be an array");
  if (value.length > WORK_PLAN_LIMITS.resourcesPerTask) throw new Error("too many resources");
  const result = value.map((item, index) => {
    const raw = object(item);
    return {
      uri: text(raw.uri, `resources[${index}].uri`, WORK_PLAN_LIMITS.uri),
      ...(raw.label === undefined ? {} : { label: text(raw.label, `resources[${index}].label`, WORK_PLAN_LIMITS.title) }),
    };
  });
  if (new Set(result.map((resource) => resource.uri)).size !== result.length) {
    throw new Error("resources contains a duplicate resource URI");
  }
  return result;
}

function task(value: unknown): WorkPlanTask {
  const raw = object(value);
  const status = raw.status;
  if (typeof status !== "string" || !WORK_PLAN_STATUSES.includes(status as WorkPlanStatus)) {
    throw new Error(`status must be one of ${WORK_PLAN_STATUSES.join(", ")}`);
  }
  return {
    id: text(raw.id, "task.id", WORK_PLAN_LIMITS.title),
    title: text(raw.title, "task.title", WORK_PLAN_LIMITS.title),
    ...(raw.description === undefined ? {} : { description: optionalText(raw.description, "task.description", WORK_PLAN_LIMITS.description) }),
    status: status as WorkPlanStatus,
    ...(raw.parentId === undefined || raw.parentId === null
      ? {}
      : { parentId: text(raw.parentId, "task.parentId", WORK_PLAN_LIMITS.title) }),
    dependsOn: raw.dependsOn === undefined ? [] : ids(raw.dependsOn, "task.dependsOn"),
    resources: raw.resources === undefined ? [] : resources(raw.resources),
    ...(raw.statusReason === undefined ? {} : { statusReason: optionalText(raw.statusReason, "task.statusReason", WORK_PLAN_LIMITS.reason) }),
  };
}

function assertGraph(tasks: WorkPlanTask[]): void {
  const byId = new Map<string, WorkPlanTask>();
  for (const item of tasks) {
    if (byId.has(item.id)) throw new Error(`duplicate task id: ${item.id}`);
    byId.set(item.id, item);
  }
  for (const item of tasks) {
    if (item.parentId !== undefined && !byId.has(item.parentId)) throw new Error(`unknown parent task: ${item.parentId}`);
    if (item.parentId === item.id) throw new Error(`task ${item.id} cannot parent itself`);
    for (const dependency of item.dependsOn) {
      if (!byId.has(dependency)) throw new Error(`unknown dependency: ${dependency}`);
      if (dependency === item.id) throw new Error(`task ${item.id} cannot depend on itself`);
    }
  }
  const visit = (id: string, edge: "parent" | "dependency", visiting: Set<string>, visited: Set<string>) => {
    if (visiting.has(id)) throw new Error(`${edge} cycle detected at task ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    const item = byId.get(id)!;
    const next = edge === "parent" ? (item.parentId ? [item.parentId] : []) : item.dependsOn;
    for (const target of next) visit(target, edge, visiting, visited);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) {
    visit(id, "parent", new Set(), new Set());
    visit(id, "dependency", new Set(), new Set());
  }
}

export function validateWorkPlan(value: unknown): WorkPlan {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error("work plan must be JSON-serializable");
  }
  if (new TextEncoder().encode(serialized).byteLength > WORK_PLAN_LIMITS.serializedBytes) {
    throw new Error(`work plan is larger than ${WORK_PLAN_LIMITS.serializedBytes} bytes`);
  }
  const raw = object(value);
  if (raw.version !== 1) throw new Error("work plan version must be 1");
  if (!Array.isArray(raw.tasks)) throw new Error("tasks must be an array");
  if (raw.tasks.length > WORK_PLAN_LIMITS.tasks) throw new Error(`a work plan may contain at most ${WORK_PLAN_LIMITS.tasks} tasks`);
  const tasks = raw.tasks.map(task);
  assertGraph(tasks);
  const updatedAt = typeof raw.updatedAt === "string" && !Number.isNaN(Date.parse(raw.updatedAt)) ? raw.updatedAt : new Date().toISOString();
  return {
    version: 1,
    id: text(raw.id, "plan.id", WORK_PLAN_LIMITS.title),
    title: text(raw.title, "plan.title", WORK_PLAN_LIMITS.title),
    tasks,
    updatedAt,
  };
}

/** Convert the compact agent-authored tree into the one canonical flat document. */
export function normalizeWorkPlanDraft(
  value: unknown,
  options: WorkPlanDraftNormalizationOptions = {},
): WorkPlan {
  const raw = object(value);
  onlyFields(raw, ["title", "tasks"], "plan");
  if (!Array.isArray(raw.tasks)) throw new Error("tasks must be an array");

  const usedIds = new Set<string>();
  const generate = (): string => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = text(
        options.nextId?.() ?? globalThis.crypto.randomUUID(),
        "generated id",
        WORK_PLAN_LIMITS.title,
      );
      if (!usedIds.has(candidate)) {
        usedIds.add(candidate);
        return candidate;
      }
    }
    throw new Error("could not generate a unique Work Plan identifier");
  };
  /**
   * Models name their tasks: refusing a supplied id costs a repair round, and the
   * union's validation message does not say which property was refused, so the
   * repair guesses. Honour it instead — identity stays unique either way.
   */
  const claim = (value: unknown, field: string): string => {
    const id = text(value, field, WORK_PLAN_LIMITS.title);
    if (usedIds.has(id)) throw new Error(`duplicate task id: ${id}`);
    usedIds.add(id);
    return id;
  };

  const planId = generate();
  const tasks: WorkPlanTask[] = [];
  const visit = (items: unknown[], depth: number, parentId?: string): void => {
    if (depth > WORK_PLAN_CREATE_MAX_DEPTH) {
      throw new Error(`creation tasks may be nested at most ${WORK_PLAN_CREATE_MAX_DEPTH} levels`);
    }
    if (items.length > WORK_PLAN_LIMITS.tasks) {
      throw new Error(`a task collection may contain at most ${WORK_PLAN_LIMITS.tasks} tasks`);
    }
    for (const [index, item] of items.entries()) {
      const draft = object(item);
      onlyFields(draft, ["id", "title", "description", "status", "statusReason", "resources", "dependsOn", "subtasks"], `tasks[${index}]`);
      const status = draft.status ?? "todo";
      if (typeof status !== "string" || !WORK_PLAN_STATUSES.includes(status as WorkPlanStatus)) {
        throw new Error(`status must be one of ${WORK_PLAN_STATUSES.join(", ")}`);
      }
      const id = draft.id === undefined ? generate() : claim(draft.id, `tasks[${index}].id`);
      tasks.push({
        id,
        title: text(draft.title, "task.title", WORK_PLAN_LIMITS.title),
        ...(draft.description === undefined
          ? {}
          : { description: text(draft.description, "task.description", WORK_PLAN_LIMITS.description) }),
        status: status as WorkPlanStatus,
        ...(parentId === undefined ? {} : { parentId }),
        // Resolved after the whole tree is read: a plan names its dependencies in
        // reading order, so a task may depend on one declared further down.
        dependsOn: draft.dependsOn === undefined ? [] : ids(draft.dependsOn, `tasks[${index}].dependsOn`),
        resources: draft.resources === undefined ? [] : resources(draft.resources),
        ...(draft.statusReason === undefined
          ? {}
          : { statusReason: text(draft.statusReason, "task.statusReason", WORK_PLAN_LIMITS.reason) }),
      });
      if (draft.subtasks !== undefined) {
        if (!Array.isArray(draft.subtasks)) throw new Error(`tasks[${index}].subtasks must be an array`);
        visit(draft.subtasks, depth + 1, id);
      }
      if (tasks.length > WORK_PLAN_LIMITS.tasks) {
        throw new Error(`a work plan may contain at most ${WORK_PLAN_LIMITS.tasks} tasks`);
      }
    }
  };
  visit(raw.tasks, 1);
  return validateWorkPlan({
    version: 1,
    id: planId,
    title: text(raw.title, "plan.title", WORK_PLAN_LIMITS.title),
    tasks,
    updatedAt: options.now?.() ?? new Date().toISOString(),
  });
}

/**
 * The changed fields of an `update_task` that did not wrap them in `changes`.
 *
 * `{"action":"update_task","taskId":"b","status":"done"}` is what a model writes
 * when it is thinking about the task rather than about this tool's envelope, and
 * refusing it bought nothing: the schema's own message for that shape does not
 * even name `status`. An explicit `changes` still wins — this reads only the
 * fields left at the top level, and never `taskId`, whose whole purpose there is
 * to say which task is being changed rather than to change identity.
 */
function loosenedChanges(mutation: Record<string, unknown>): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const field of ["title", "description", "status", "statusReason", "parentId", "dependsOn", "resources"]) {
    if (mutation[field] !== undefined) changed[field] = mutation[field];
  }
  return changed;
}

/**
 * What each action cannot do without.
 *
 * The published schema declares one object whose per-action arguments are all
 * optional — that is what makes a refusal name the field it refuses instead of
 * enumerating ten branch failures. The requirement itself still has to be
 * checked, here, by name: without this a `{"action":"remove_task"}` missing its
 * `taskId` looked up index -1, changed nothing, and was reported to the model as
 * a successful removal.
 */
const REQUIRED_ARGUMENTS: Partial<Record<WorkPlanAction, readonly string[]>> = {
  create: ["title", "tasks"],
  replace: ["plan"],
  add_task: ["task"],
  update_task: ["taskId"],
  move_task: ["taskId"],
  remove_task: ["taskId"],
  set_dependencies: ["taskId", "dependsOn"],
  set_resources: ["taskId", "resources"],
};

function assertRequiredArguments(mutation: Record<string, unknown>): void {
  for (const field of REQUIRED_ARGUMENTS[mutation.action as WorkPlanAction] ?? []) {
    if (mutation[field] === undefined || mutation[field] === null) {
      throw new Error(`action=${String(mutation.action)} requires ${field}`);
    }
  }
}

export function mutateWorkPlan(current: WorkPlan | null, mutation: WorkPlanMutation): WorkPlan | null {
  assertRequiredArguments(mutation as Record<string, unknown>);
  if (mutation.action === "get") return current;
  if (mutation.action === "clear") return null;
  if (mutation.action === "create") {
    if (current !== null) throw new Error("this session already has a Work Plan; use action=replace to overwrite it");
    return normalizeWorkPlanDraft({ title: mutation.title, tasks: mutation.tasks });
  }
  if (mutation.action === "replace") return validateWorkPlan(mutation.plan);
  if (current === null) throw new Error("create a plan with action=create or action=replace before mutating tasks");
  let tasks = current.tasks.map((item) => ({ ...item, dependsOn: [...item.dependsOn], resources: item.resources.map((resource) => ({ ...resource })) }));
  const index = "taskId" in mutation ? tasks.findIndex((item) => item.id === mutation.taskId) : -1;
  if ("taskId" in mutation && index < 0) throw new Error(`unknown task: ${mutation.taskId}`);
  switch (mutation.action) {
    case "add_task":
      tasks.push(task(mutation.task));
      break;
    case "update_task": {
      const changes = object(mutation.changes ?? loosenedChanges(mutation));
      if (changes.id !== undefined) throw new Error("task identity cannot be changed");
      if (Object.keys(changes).length === 0) {
        throw new Error("action=update_task requires at least one changed field, in changes or beside taskId");
      }
      tasks[index] = task({ ...tasks[index], ...changes, id: tasks[index].id });
      break;
    }
    case "move_task":
      tasks[index] = {
        ...tasks[index],
        ...(mutation.parentId === undefined || mutation.parentId === null
          ? { parentId: undefined }
          : { parentId: text(mutation.parentId, "parentId", WORK_PLAN_LIMITS.title) }),
      };
      break;
    case "remove_task": {
      const removed = new Set<string>([mutation.taskId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const item of tasks) if (item.parentId && removed.has(item.parentId) && !removed.has(item.id)) { removed.add(item.id); changed = true; }
      }
      tasks = tasks.filter((item) => !removed.has(item.id)).map((item) => ({ ...item, dependsOn: item.dependsOn.filter((id) => !removed.has(id)) }));
      break;
    }
    case "set_dependencies":
      tasks[index] = { ...tasks[index], dependsOn: ids(mutation.dependsOn, "dependsOn") };
      break;
    case "set_resources":
      tasks[index] = { ...tasks[index], resources: resources(mutation.resources) };
      break;
  }
  return validateWorkPlan({ ...current, tasks, updatedAt: new Date().toISOString() });
}
