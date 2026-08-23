import { Type } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { applyWorkPlanMutation } from "./workPlanStore.ts";

const parameters = Type.Object({
  action: Type.Union([
    Type.Literal("get"), Type.Literal("clear"), Type.Literal("replace"), Type.Literal("add_task"),
    Type.Literal("update_task"), Type.Literal("move_task"), Type.Literal("remove_task"),
    Type.Literal("set_dependencies"), Type.Literal("set_resources"),
  ]),
  plan: Type.Optional(Type.Unknown()),
  task: Type.Optional(Type.Unknown()),
  taskId: Type.Optional(Type.String()),
  changes: Type.Optional(Type.Unknown()),
  parentId: Type.Optional(Type.String()),
  dependsOn: Type.Optional(Type.Array(Type.String())),
  resources: Type.Optional(Type.Array(Type.Object({ uri: Type.String(), label: Type.Optional(Type.String()) }))),
});

export function createWorkPlanToolDefinition(): ToolDefinition {
  return {
    name: "work_plan",
    label: "Work Plan",
    description: "Read or atomically update the persistent Work Plan for this session. It is the agent's explicit working-state representation, not merely progress reporting: use it to drive systematic decomposition, execution tracking, and verification. Use human-readable outcomes, not tool mechanics. Create a plan only for non-trivial work that benefits from explicit decomposition; refine it as understanding changes. On a resumed session, call action=get before continuing substantial work, and reconcile the plan before declaring that work complete.",
    promptSnippet: "Create, inspect, and update the session's persistent Work Plan",
    promptGuidelines: [
      "Use work_plan for substantial multi-step work; keep it current when work is discovered, blocked, reopened, completed, or needs review.",
      "Treat the Work Plan as working state that guides decomposition, execution, and verification—not as a retrospective progress report. Reconcile it before declaring non-trivial work complete.",
      "The plan describes objectives and outcomes, not tool calls. Do not create one for trivial interactions.",
    ],
    parameters,
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
          content: [{ type: "text", text: action === "get" && plan !== null ? `${summary}\n${JSON.stringify(plan)}` : summary }],
          details: { type: "work_plan", sessionFile, plan, changed: action !== "get" },
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Work Plan update refused: ${error instanceof Error ? error.message : String(error)}` }], details: undefined, isError: true };
      }
    },
  };
}
