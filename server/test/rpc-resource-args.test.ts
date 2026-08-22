/**
 * The resource configuration, translated to pi flags for an RPC child.
 *
 * What these protect is parity: every key the embedded runtime hands to the SDK
 * has to appear on the child's command line, or the same configuration produces a
 * different agent depending on the runtime — and pi would quietly discover its own
 * `.pi/` resources in the gap.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import type { AppConfig } from "../src/config.ts";
import { explainRejectedFlags, resolveToolsExtension, rpcResourceArgs } from "../src/rpcResourceArgs.ts";

/** Only the fields rpcResourceArgs reads; the rest of AppConfig is irrelevant here. */
function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    noExtensions: false,
    extensionPaths: [],
    extensionScripts: [],
    noSkills: false,
    skillPaths: [],
    userSkillPaths: [],
    noPromptTemplates: false,
    promptPaths: [],
    offline: false,
    ...overrides,
  } as AppConfig;
}

const noExtras = { bundledSkills: [], appendSystemPrompt: [] };

/** The value that follows a flag, so assertions read as "the child was told X". */
function after(args: string[], flag: string): string | undefined {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

describe("rpcResourceArgs", () => {
  test("says nothing when nothing is configured", () => {
    assert.deepEqual(rpcResourceArgs(config(), noExtras), []);
  });

  test("passes every extension path and script as its own --extension", () => {
    const args = rpcResourceArgs(
      config({ extensionPaths: ["/ext/a.ts"], extensionScripts: ["/ext/b.mjs"] }),
      noExtras,
    );
    assert.deepEqual(args, ["--extension", "/ext/a.ts", "--extension", "/ext/b.mjs"]);
  });

  test("keeps explicit paths alongside the discovery switches they survive", () => {
    const args = rpcResourceArgs(
      config({ noExtensions: true, extensionPaths: ["/ext/a.ts"], noSkills: true, skillPaths: ["/skills/one"] }),
      noExtras,
    );
    assert.ok(args.indexOf("--no-extensions") < args.indexOf("--extension"), "the switch must precede the path");
    assert.ok(args.indexOf("--no-skills") < args.indexOf("--skill"));
    assert.equal(after(args, "--skill"), "/skills/one");
  });

  test("forwards the user's own skill paths after the operator's", () => {
    // Same rule as the embedded loader: the first skill under a given name wins, so
    // a directory added from Settings must not be able to shadow the deployment's.
    const args = rpcResourceArgs(config({ skillPaths: ["/deployment"], userSkillPaths: ["/mine"] }), {
      bundledSkills: ["/bundled"],
      appendSystemPrompt: [],
    });
    assert.deepEqual(args, ["--skill", "/deployment", "--skill", "/mine", "--skill", "/bundled"]);
  });

  test("puts the operator's skills before the bundled ones, so an override overrides", () => {
    const args = rpcResourceArgs(config({ skillPaths: ["/mine/structured-exchange"] }), {
      bundledSkills: ["/bundled/structured-exchange"],
      appendSystemPrompt: [],
    });
    assert.deepEqual(args, [
      "--skill",
      "/mine/structured-exchange",
      "--skill",
      "/bundled/structured-exchange",
    ]);
  });

  test("sends the tool allowlist as one comma-separated value", () => {
    assert.equal(after(rpcResourceArgs(config({ tools: ["read", "grep", "ls"] }), noExtras), "--tools"), "read,grep,ls");
  });

  test("an empty tool allowlist is still an allowlist, not an absent one", () => {
    // [] means "no tools", which is a real deployment choice. Omitting the flag
    // would hand the child the full built-in toolset instead.
    assert.deepEqual(rpcResourceArgs(config({ tools: [] }), noExtras), ["--tools", ""]);
  });

  test("keeps a multi-line system prompt as a single argument", () => {
    const prompt = "line one\nline two";
    const args = rpcResourceArgs(config({ systemPrompt: prompt }), noExtras);
    assert.deepEqual(args, ["--system-prompt", prompt]);
  });

  test("appends each prompt suffix separately, web context included", () => {
    const args = rpcResourceArgs(config(), { bundledSkills: [], appendSystemPrompt: ["web context", "be brief"] });
    assert.deepEqual(args, ["--append-system-prompt", "web context", "--append-system-prompt", "be brief"]);
  });

  test("carries a path containing spaces as one argument", () => {
    const skill = "/home/me/my skills/structured exchange";
    assert.equal(after(rpcResourceArgs(config({ skillPaths: [skill] }), noExtras), "--skill"), skill);
  });

  test("declares offline mode on the line as well as in the environment", () => {
    assert.deepEqual(rpcResourceArgs(config({ offline: true }), noExtras), ["--offline"]);
  });

  test("turns prompt-template discovery off and still loads the named directories", () => {
    const args = rpcResourceArgs(config({ noPromptTemplates: true, promptPaths: ["/prompts"] }), noExtras);
    assert.deepEqual(args, ["--no-prompt-templates", "--prompt-template", "/prompts"]);
  });
});

describe("explainRejectedFlags", () => {
  // Not every Pi-derived agent speaks the same command line. OMP has no `--skill`
  // path loader and no prompt-template flags, and says so by name — but the
  // operator wrote a setting, not a flag, so the error has to bridge the two.
  test("names the settings behind the flags an agent rejected", () => {
    const hint = explainRejectedFlags("Error: unknown flags: --skill, --no-prompt-templates");
    assert.match(hint ?? "", /--skill \(from "skillPaths \(and the bundled skills\)"\)/);
    assert.match(hint ?? "", /--no-prompt-templates \(from "noPromptTemplates"\)/);
  });

  test("says nothing about a failure that is not one of our flags", () => {
    assert.equal(explainRejectedFlags("the Pi RPC process ended (signal SIGKILL)"), undefined);
  });

  test("does not mistake a longer flag for one it knows", () => {
    // "--skills=git-*" is OMP's filter, not our loader: reporting skillPaths for it
    // would send the operator to edit a setting that produced nothing.
    assert.equal(explainRejectedFlags("Error: unknown flags: --skills=git-*"), undefined);
  });
});

describe("resolveToolsExtension", () => {
  test("finds the extension that gives an RPC child pi-outpost's own tools", async () => {
    const resolved = await resolveToolsExtension();
    assert.equal(path.basename(resolved), "piOutpostTools.ts");
  });
});
