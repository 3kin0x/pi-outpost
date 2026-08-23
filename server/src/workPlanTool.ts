import { Type, type TSchema } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { WORK_PLAN_CREATE_MAX_DEPTH, WORK_PLAN_LIMITS, WORK_PLAN_STATUSES } from "@pi-outpost/shared/work-plan";
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
const statusSchema = Type.Union(WORK_PLAN_STATUSES.map((status) => Type.Literal(status)));
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
  title: titleSchema,
  description: Type.Optional(descriptionSchema),
  status: Type.Optional(statusSchema),
  statusReason: Type.Optional(reasonSchema),
  resources: Type.Optional(resourcesSchema),
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

export const workPlanParameters = Type.Union([
  Type.Object({ action: Type.Literal("get") }, objectOptions),
  Type.Object({ action: Type.Literal("clear") }, objectOptions),
  Type.Object({
    action: Type.Literal("create"),
    title: titleSchema,
    tasks: Type.Array(creationTaskSchema(1), {
      maxItems: WORK_PLAN_LIMITS.tasks,
      description: `Top-level tasks; at most ${WORK_PLAN_LIMITS.tasks} tasks total and ${WORK_PLAN_LIMITS.serializedBytes} serialized bytes across the complete plan.`,
    }),
  }, objectOptions),
  Type.Object({ action: Type.Literal("replace"), plan: normalizedPlanSchema }, objectOptions),
  Type.Object({ action: Type.Literal("add_task"), task: normalizedTaskSchema }, objectOptions),
  Type.Object({ action: Type.Literal("update_task"), taskId: identifierSchema, changes: taskChangesSchema }, objectOptions),
  Type.Object({ action: Type.Literal("move_task"), taskId: identifierSchema, parentId: Type.Optional(Type.Union([identifierSchema, Type.Null()])) }, objectOptions),
  Type.Object({ action: Type.Literal("remove_task"), taskId: identifierSchema }, objectOptions),
  Type.Object({ action: Type.Literal("set_dependencies"), taskId: identifierSchema, dependsOn: dependenciesSchema }, objectOptions),
  Type.Object({ action: Type.Literal("set_resources"), taskId: identifierSchema, resources: resourcesSchema }, objectOptions),
]);

export function createWorkPlanToolDefinition(): ToolDefinition {
  return {
    name: "work_plan",
    label: "Work Plan",
    description: "Read or atomically update the persistent Work Plan for this session. Use create for a compact two-level task hierarchy (500 tasks total, 64 KiB normalized plan), replace for a complete normalized version-1 document, and the task operations for precise later mutations.",
    promptSnippet: "Create, inspect, and update the session's persistent Work Plan",
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
