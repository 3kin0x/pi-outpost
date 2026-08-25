import { Type, type TSchema } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { WORK_PLAN_ACTIONS, WORK_PLAN_CREATE_MAX_DEPTH, WORK_PLAN_LIMITS, WORK_PLAN_STATUSES } from "@pi-outpost/shared/work-plan";
import { applyWorkPlanMutation } from "./workPlanStore.ts";

const objectOptions = { additionalProperties: false } as const;
const boundedText = (maxLength: number, description?: string) => Type.String({
  minLength: 1,
  maxLength,
  pattern: "\\S",
  ...(description === undefined ? {} : { description }),
});
const identifierSchema = boundedText(WORK_PLAN_LIMITS.title);
const titleSchema = boundedText(WORK_PLAN_LIMITS.title);
const descriptionSchema = boundedText(WORK_PLAN_LIMITS.description);
const reasonSchema = boundedText(WORK_PLAN_LIMITS.reason);
/**
 * One `enum` node, not a union of literal branches.
 *
 * `Type.Union([...Type.Literal])` emits `anyOf`, and pi reports a failed call by
 * listing every branch that rejected it: a mistyped status came back as "must be
 * equal to constant" once per accepted value, none of them naming the accepted
 * values. An `enum` fails once and carries them.
 */
const stringEnum = <T extends string>(values: readonly T[], description?: string) =>
  Type.Unsafe<T>({ type: "string", enum: [...values], ...(description === undefined ? {} : { description }) });
const statusSchema = stringEnum(WORK_PLAN_STATUSES);
const resourceSchema = Type.Object({
  uri: boundedText(WORK_PLAN_LIMITS.uri),
  label: Type.Optional(boundedText(WORK_PLAN_LIMITS.title)),
}, objectOptions);
const resourcesSchema = Type.Array(resourceSchema, { maxItems: WORK_PLAN_LIMITS.resourcesPerTask });
const dependenciesSchema = Type.Array(identifierSchema, { maxItems: WORK_PLAN_LIMITS.tasks, uniqueItems: true });

const normalizedTaskSchema = Type.Object({
  id: identifierSchema,
  title: titleSchema,
  description: Type.Optional(descriptionSchema),
  status: statusSchema,
  parentId: Type.Optional(identifierSchema),
  dependsOn: Type.Optional(dependenciesSchema),
  resources: Type.Optional(resourcesSchema),
  statusReason: Type.Optional(reasonSchema),
}, objectOptions);

const normalizedPlanSchema = Type.Object({
  version: Type.Literal(1),
  id: identifierSchema,
  title: titleSchema,
  tasks: Type.Array(normalizedTaskSchema, { maxItems: WORK_PLAN_LIMITS.tasks }),
  updatedAt: boundedText(WORK_PLAN_LIMITS.title),
}, objectOptions);

const creationTaskSchema = (depth: number): TSchema => Type.Object({
  id: Type.Optional(boundedText(
    WORK_PLAN_LIMITS.title,
    "Optional identifier, unique across the plan; one is generated when omitted.",
  )),
  title: titleSchema,
  description: Type.Optional(descriptionSchema),
  status: Type.Optional(statusSchema),
  statusReason: Type.Optional(reasonSchema),
  resources: Type.Optional(resourcesSchema),
  dependsOn: Type.Optional(Type.Array(identifierSchema, {
    maxItems: WORK_PLAN_LIMITS.tasks,
    uniqueItems: true,
    description: "Ids of other tasks in this same call that must finish first. Give those tasks an explicit id.",
  })),
  ...(depth < WORK_PLAN_CREATE_MAX_DEPTH
    ? { subtasks: Type.Optional(Type.Array(creationTaskSchema(depth + 1), {
        maxItems: WORK_PLAN_LIMITS.tasks,
        description: `Direct subtasks only; the complete plan may contain at most ${WORK_PLAN_LIMITS.tasks} tasks.`,
      })) }
    : {}),
}, objectOptions);

const taskChangesSchema = Type.Object({
  title: Type.Optional(titleSchema),
  description: Type.Optional(Type.Union([descriptionSchema, Type.Null()])),
  status: Type.Optional(statusSchema),
  statusReason: Type.Optional(Type.Union([reasonSchema, Type.Null()])),
  parentId: Type.Optional(Type.Union([identifierSchema, Type.Null()])),
  dependsOn: Type.Optional(dependenciesSchema),
  resources: Type.Optional(resourcesSchema),
}, objectOptions);

/**
 * One object, not a union of ten.
 *
 * A `Type.Union` emits a bare top-level `anyOf`, and pi validates a tool call
 * against the whole schema: every branch that fails contributes its own errors,
 * so a single wrong property comes back as "action: must be equal to constant"
 * repeated once per action the model did not ask for, and the one line that
 * names the real problem is buried and says only "must not have additional
 * properties". A model then repairs by guessing. Here `action` is an enum and
 * the per-action requirements are checked by `mutateWorkPlan`, which names the
 * offending field ("tasks[2].dependsOn is not accepted").
 */
export const workPlanParameters = Type.Object({
  action: stringEnum(
    WORK_PLAN_ACTIONS,
    "What to do. Every property below is required by some actions and ignored by the rest.",
  ),
  title: Type.Optional(Type.String({ ...titleSchema, description: "Plan title (create), or the task's new title (update_task, when no changes object is given)." })),
  tasks: Type.Optional(Type.Array(creationTaskSchema(1), {
    maxItems: WORK_PLAN_LIMITS.tasks,
    description: `Top-level tasks (create); each may carry subtasks. At most ${WORK_PLAN_LIMITS.tasks} tasks total and ${WORK_PLAN_LIMITS.serializedBytes} serialized bytes across the complete plan.`,
  })),
  plan: Type.Optional(Type.Object({ ...normalizedPlanSchema.properties }, { ...objectOptions, description: "A complete normalized plan (replace)." })),
  task: Type.Optional(Type.Object({ ...normalizedTaskSchema.properties }, { ...objectOptions, description: "One complete task, id and status included (add_task)." })),
  taskId: Type.Optional(Type.String({ ...identifierSchema, description: "Which task to act on (update_task, move_task, remove_task, set_dependencies, set_resources)." })),
  changes: Type.Optional(Type.Object({ ...taskChangesSchema.properties }, { ...objectOptions, description: "Fields to change (update_task). The same fields may be given here beside taskId instead." })),
  status: Type.Optional(stringEnum(WORK_PLAN_STATUSES, "New status (update_task, when no changes object is given).")),
  description: Type.Optional(Type.Union([descriptionSchema, Type.Null()], { description: "New description, or null to clear it (update_task, when no changes object is given)." })),
  statusReason: Type.Optional(Type.Union([reasonSchema, Type.Null()], { description: "Why the task sits in its status, or null to clear it (update_task, when no changes object is given)." })),
  parentId: Type.Optional(Type.Union([identifierSchema, Type.Null()], { description: "New parent, or null for top level (move_task)." })),
  dependsOn: Type.Optional(Type.Array(identifierSchema, { maxItems: WORK_PLAN_LIMITS.tasks, uniqueItems: true, description: "Complete dependency set for taskId (set_dependencies)." })),
  resources: Type.Optional(Type.Array(resourceSchema, { maxItems: WORK_PLAN_LIMITS.resourcesPerTask, description: "Complete resource set for taskId (set_resources)." })),
}, objectOptions);

export function createWorkPlanToolDefinition(): ToolDefinition {
  return {
    name: "work_plan",
    label: "Work Plan",
    description: "Read or atomically update the persistent Work Plan for this session. Use create for a compact two-level task hierarchy (500 tasks total, 64 KiB normalized plan) whose tasks need only a title, replace for a complete normalized version-1 document, and the task operations for precise later mutations.",
    promptSnippet: "Create, inspect, and update the session's persistent Work Plan",
    // A worked call, because the schema alone left models repairing by guess. The
    // titles are deliberately meaningless: an example that reads like real work
    // gets copied into real plans (a live model lifted "Add the theme tokens"
    // verbatim from an earlier draft of this list).
    promptGuidelines: [
      'Create the whole plan in one call, dependencies included: {"action":"create","title":"<plan title>","tasks":[{"id":"a","title":"<first task>"},{"id":"b","title":"<second task>","dependsOn":["a"],"subtasks":[{"title":"<a step of the second task>"}]}]}',
      "Give a task an explicit short id whenever something references it; ids are generated for the rest.",
      'Update one task with {"action":"update_task","taskId":"b","status":"in_progress"}. Statuses are todo, in_progress, done, blocked, needs_review.',
      // Pointing a small model at `replace` for this was a trap: that action wants
      // a complete normalized document, down to a plan id and an updatedAt it
      // would have to invent. `clear` then `create` reaches the same state through
      // the compact form it already knows.
      "A session holds one plan: to start a different one, clear it and create the new one. replace is for handing back a complete normalized document you already have.",
    ],
    parameters: workPlanParameters,
    executionMode: "sequential",
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const mutation = params as never;
      try {
        const sessionFile = ctx.sessionManager.getSessionFile();
        const plan = await applyWorkPlanMutation(sessionFile, mutation);
        const action = (params as { action: string }).action;
        const summary = plan === null
          ? "This session has no Work Plan."
          : `Work Plan \"${plan.title}\": ${plan.tasks.length} tasks (${plan.tasks.filter((task) => task.status === "done").length} done).`;
        return {
          // `details` drives authoritative UI synchronization but is not model
          // context. A resumed agent must receive the complete working state in
          // content; otherwise post-compaction `get` would expose only a counter.
          content: [{ type: "text", text: (action === "get" || action === "create") && plan !== null ? `${summary}\n${JSON.stringify(plan)}` : summary }],
          details: { type: "work_plan", sessionFile, plan, changed: action !== "get" },
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Work Plan update refused: ${error instanceof Error ? error.message : String(error)}` }], details: undefined, isError: true };
      }
    },
  };
}
