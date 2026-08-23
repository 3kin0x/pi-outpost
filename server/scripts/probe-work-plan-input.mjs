/**
 * Compare first-call work_plan reliability against a real configured model.
 *
 * The three arms are interleaved to reduce provider drift:
 *   baseline       — the shipped pre-change schema with opaque payloads
 *   typed          — explicit action schemas, without compact create
 *   typed-create   — explicit action schemas plus compact create
 *
 * Usage:
 *   WORK_PLAN_PROBE_TRIALS=10 node --import tsx/esm scripts/probe-work-plan-input.mjs
 */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createAgentSessionFromServices,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { workPlanParameters } from "../src/workPlanTool.ts";
import { WORK_PLAN_SYSTEM_GUIDANCE } from "../src/systemPrompt.ts";
import { mutateWorkPlan } from "../../shared/src/workPlan.ts";

const trials = Number.parseInt(process.env.WORK_PLAN_PROBE_TRIALS ?? "10", 10);
assert.ok(Number.isInteger(trials) && trials > 0, "WORK_PLAN_PROBE_TRIALS must be a positive integer");

const baselineParameters = Type.Object({
  action: Type.Union([
    Type.Literal("get"), Type.Literal("clear"), Type.Literal("replace"), Type.Literal("add_task"),
    Type.Literal("update_task"), Type.Literal("move_task"), Type.Literal("remove_task"),
    Type.Literal("set_dependencies"), Type.Literal("set_resources"),
  ]),
  plan: Type.Optional(Type.Unknown()),
  task: Type.Optional(Type.Unknown()),
  taskId: Type.Optional(Type.String()),
  changes: Type.Optional(Type.Unknown()),
  parentId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  dependsOn: Type.Optional(Type.Array(Type.String())),
  resources: Type.Optional(Type.Array(Type.Object({ uri: Type.String(), label: Type.Optional(Type.String()) }))),
});

const typedBranches = workPlanParameters.anyOf.filter(
  (branch) => branch.properties?.action?.const !== "create",
);
const typedParameters = Type.Union(typedBranches);

const allArms = [
  {
    name: "baseline",
    parameters: baselineParameters,
    expectedAction: "replace",
    description: "Read or atomically update the persistent Work Plan for this session. It is the agent's explicit working-state representation, not merely progress reporting: use it to drive systematic decomposition, execution tracking, and verification. Use human-readable outcomes, not tool mechanics. Create a plan only for non-trivial work that benefits from explicit decomposition; refine it as understanding changes. On a resumed session, call action=get before continuing substantial work, and reconcile the plan before declaring that work complete.",
  },
  {
    name: "typed",
    parameters: typedParameters,
    expectedAction: "replace",
    description: "Read or atomically update the persistent Work Plan for this session. Use replace for a complete normalized version-1 document and the task operations for precise later mutations.",
  },
  {
    name: "typed-create",
    parameters: workPlanParameters,
    expectedAction: "create",
    description: "Read or atomically update the persistent Work Plan for this session. Use create for a compact two-level task hierarchy (500 tasks total, 64 KiB normalized plan), replace for a complete normalized version-1 document, and task operations for precise later mutations.",
  },
];
const requestedArms = new Set((process.env.WORK_PLAN_PROBE_ARMS ?? "").split(",").filter(Boolean));
const arms = requestedArms.size === 0 ? allArms : allArms.filter((arm) => requestedArms.has(arm.name));
assert.equal(arms.length, requestedArms.size || allArms.length, "WORK_PLAN_PROBE_ARMS contains an unknown arm");

const prompt = [
  "This is a non-trivial implementation with three outcomes: inspect the current behavior, implement the change, and verify it.",
  "Create the persistent Work Plan now with those three top-level tasks; give the implementation task two direct subtasks.",
  "Use work_plan exactly once, then stop. Do not explain the plan in prose.",
].join(" ");

async function runArm(arm, iteration) {
  const cwd = await mkdtemp(path.join(tmpdir(), `work-plan-probe-${arm.name}-`));
  const calls = [];
  const endings = new Map();
  let stoppedAfterFirstCall = false;
  let session;
  try {
    const agentDir = getAgentDir();
    const services = await createAgentSessionServices({
      cwd,
      agentDir,
      resourceLoaderOptions: {
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        appendSystemPrompt: [WORK_PLAN_SYSTEM_GUIDANCE],
      },
    });

    ({ session } = await createAgentSessionFromServices({
      services,
      thinkingLevel: "off",
      noTools: "builtin",
      tools: ["work_plan"],
      customTools: [{
        name: "work_plan",
        label: "Work Plan",
        description: arm.description,
        promptSnippet: "Create, inspect, and update the session's persistent Work Plan",
        parameters: arm.parameters,
        executionMode: "sequential",
        async execute(_id, params) {
          try {
            mutateWorkPlan(null, params);
            return { content: [{ type: "text", text: `Accepted ${params.action}.` }] };
          } catch (error) {
            return {
              content: [{ type: "text", text: `Rejected: ${error instanceof Error ? error.message : String(error)}` }],
              isError: true,
            };
          }
        },
      }],
      sessionManager: SessionManager.inMemory(cwd),
    }));

    session.subscribe((event) => {
      if (event.type === "tool_execution_start" && event.toolName === "work_plan") {
        calls.push({ id: event.toolCallId, args: event.args });
      }
      if (event.type === "tool_execution_end" && event.toolName === "work_plan") {
        endings.set(event.toolCallId, { isError: event.isError, result: event.result });
        if (calls.length === 1) {
          stoppedAfterFirstCall = true;
          void session.abort();
        }
      }
    });

    const model = session.model;
    assert.equal(session.thinkingLevel, "off");
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      void session.abort();
    }, 90_000);
    try {
      await session.prompt(prompt).catch((error) => {
        if (!timedOut && !stoppedAfterFirstCall) throw error;
      });
    } finally {
      clearTimeout(timeout);
    }

    const first = calls[0];
    const ending = first ? endings.get(first.id) : undefined;
    return {
      iteration,
      arm: arm.name,
      model: `${model.provider}/${model.id}`,
      modelReasoningCapability: model.reasoning,
      thinkingLevel: session.thinkingLevel,
      firstCall: first?.args ?? null,
      firstCallAccepted: Boolean(first && ending && !ending.isError && !ending.result?.isError),
      expectedAction: arm.expectedAction,
      usedExpectedAction: first?.args?.action === arm.expectedAction,
      callCount: calls.length,
      timedOut,
    };
  } finally {
    session?.dispose();
    await rm(cwd, { recursive: true, force: true });
  }
}

const results = [];
for (let iteration = 1; iteration <= trials; iteration += 1) {
  for (const arm of arms) {
    const result = await runArm(arm, iteration);
    results.push(result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
}

const summary = Object.fromEntries(arms.map((arm) => {
  const samples = results.filter((result) => result.arm === arm.name);
  return [arm.name, {
    acceptedFirstCall: samples.filter((sample) => sample.firstCallAccepted).length,
    expectedActionFirst: samples.filter((sample) => sample.usedExpectedAction).length,
    trials: samples.length,
  }];
}));
process.stdout.write(`${JSON.stringify({ summary }, null, 2)}\n`);

if (process.env.WORK_PLAN_PROBE_OUTPUT) {
  await writeFile(process.env.WORK_PLAN_PROBE_OUTPUT, `${JSON.stringify({
    capturedAt: new Date().toISOString(),
    trials,
    results,
    summary,
  }, null, 2)}\n`);
}

if (trials >= 10 && summary["typed-create"]) {
  assert.ok(summary["typed-create"].acceptedFirstCall >= 9, "typed-create must achieve at least 9/10 accepted first calls");
}
