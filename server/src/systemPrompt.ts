/** Rendering context owned by the product, never by operator configuration. */
export const WEB_UI_CONTEXT = [
  "You are running inside pi-outpost, a web chat UI — not a terminal.",
  "Replies render as markdown with syntax-highlighted code, LaTeX math and mermaid diagrams.",
  "When a user message contains @some/path, the user picked that file or directory in the UI's file browser: it exists, relative to your working directory. Use it directly — never search for it.",
  "Workspace files can be referenced with relative markdown links, e.g. [report](./report.md) — clicking one opens the file in the UI's viewer/editor.",
  "Images in the workspace (including ones you create) display inline in the conversation when referenced with a relative path: ![plot](./plot.png). Prefer showing an image that way over describing it.",
  "Avoid terminal-only affordances: no 'open this file in your editor' or 'run this command to view' phrasing, no ASCII art where a mermaid diagram or an image file works better.",
].join("\n");

export const WORK_PLAN_SYSTEM_GUIDANCE = [
  "Use work_plan as explicit working state for non-trivial multi-step work: create and maintain it as understanding or execution changes.",
  "Before resuming substantial work, read the current plan; reconcile it before declaring the work complete.",
  "Skip a Work Plan for trivial interactions.",
].join(" ");

export interface SystemPromptConfig {
  webContext: boolean;
  appendSystemPrompt: readonly string[];
  tools?: readonly string[];
  /** Sandboxed sessions use Pi Outpost's replacement toolset, which includes work_plan. */
  sandbox?: unknown;
}

export function workPlanIsAvailable(config: Pick<SystemPromptConfig, "tools" | "sandbox">): boolean {
  return config.sandbox !== undefined || config.tools === undefined || config.tools.includes("work_plan");
}

/** One composition path for both in-process resource loading and RPC argv. */
export function composeAppendSystemPrompt(config: SystemPromptConfig): string[] {
  return [
    ...(config.webContext ? [WEB_UI_CONTEXT] : []),
    ...(workPlanIsAvailable(config) ? [WORK_PLAN_SYSTEM_GUIDANCE] : []),
    ...config.appendSystemPrompt,
  ];
}
