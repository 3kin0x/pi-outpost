export const WORK_PLAN_STATUSES = ["todo", "in_progress", "done", "blocked", "needs_review"] as const;
export type WorkPlanStatus = (typeof WORK_PLAN_STATUSES)[number];

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

export type WorkPlanMutation =
  | { action: "get" }
  | { action: "clear" }
  | { action: "replace"; plan: unknown }
  | { action: "add_task"; task: unknown }
  | { action: "update_task"; taskId: string; changes: unknown }
  | { action: "move_task"; taskId: string; parentId?: string | null }
  | { action: "remove_task"; taskId: string }
  | { action: "set_dependencies"; taskId: string; dependsOn: unknown }
  | { action: "set_resources"; taskId: string; resources: unknown };

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("must be an object");
  return value as Record<string, unknown>;
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

export function mutateWorkPlan(current: WorkPlan | null, mutation: WorkPlanMutation): WorkPlan | null {
  if (mutation.action === "get") return current;
  if (mutation.action === "clear") return null;
  if (mutation.action === "replace") return validateWorkPlan(mutation.plan);
  if (current === null) throw new Error("create a plan with action=replace before mutating tasks");
  let tasks = current.tasks.map((item) => ({ ...item, dependsOn: [...item.dependsOn], resources: item.resources.map((resource) => ({ ...resource })) }));
  const index = "taskId" in mutation ? tasks.findIndex((item) => item.id === mutation.taskId) : -1;
  if ("taskId" in mutation && index < 0) throw new Error(`unknown task: ${mutation.taskId}`);
  switch (mutation.action) {
    case "add_task":
      tasks.push(task(mutation.task));
      break;
    case "update_task": {
      const changes = object(mutation.changes);
      if (changes.id !== undefined) throw new Error("task identity cannot be changed");
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
