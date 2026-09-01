import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeAppendSystemPrompt, WEB_UI_CONTEXT, WORK_PLAN_SYSTEM_GUIDANCE } from "../src/systemPrompt.ts";

describe("product system-prompt composition", () => {
  it("places default web context before capability guidance and operator entries", () => {
    assert.deepEqual(composeAppendSystemPrompt({
      webContext: true,
      appendSystemPrompt: ["Only discuss this project."],
      tools: undefined,
      sandbox: undefined,
    }), [WEB_UI_CONTEXT, WORK_PLAN_SYSTEM_GUIDANCE, "Only discuss this project."]);
  });

  it("web-context opt-out leaves unrelated product and operator guidance intact", () => {
    assert.deepEqual(composeAppendSystemPrompt({
      webContext: false,
      appendSystemPrompt: ["Only discuss this project."],
      tools: undefined,
      sandbox: undefined,
    }), [WORK_PLAN_SYSTEM_GUIDANCE, "Only discuss this project."]);
  });

  it("adds Work Plan behavior once before unchanged operator entries when the tool is available", () => {
    const operator = ["Operator line one.\nKeep spacing.", "Operator line two."];
    const composed = composeAppendSystemPrompt({
      webContext: false,
      appendSystemPrompt: operator,
      tools: undefined,
      sandbox: undefined,
    });
    assert.deepEqual(composed, [WORK_PLAN_SYSTEM_GUIDANCE, ...operator]);
    assert.equal(composed.filter((entry) => entry === WORK_PLAN_SYSTEM_GUIDANCE).length, 1);
    assert.match(WORK_PLAN_SYSTEM_GUIDANCE, /needs_review/);
    assert.match(WORK_PLAN_SYSTEM_GUIDANCE, /every other task to done or needs_review/);
    assert.match(WORK_PLAN_SYSTEM_GUIDANCE, /acknowledge review.*tasks to done/);
    assert.match(WORK_PLAN_SYSTEM_GUIDANCE, /meaningful work resumes/);
  });

  it("omits Work Plan guidance when an unsandboxed allowlist excludes the tool", () => {
    assert.deepEqual(composeAppendSystemPrompt({
      webContext: false,
      appendSystemPrompt: ["Operator entry."],
      tools: ["read"],
      sandbox: undefined,
    }), ["Operator entry."]);
  });

  it("keeps guidance for the sandbox replacement toolset", () => {
    const composed = composeAppendSystemPrompt({
      webContext: false,
      appendSystemPrompt: [],
      tools: ["read"],
      sandbox: { root: "/workspace" },
    });
    assert.deepEqual(composed, [WORK_PLAN_SYSTEM_GUIDANCE]);
  });
});
