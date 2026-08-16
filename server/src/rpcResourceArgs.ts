/**
 * The resource configuration, expressed as `pi` command-line flags.
 *
 * The embedded runtime hands skills, extensions, prompt templates, the tool
 * allowlist and the system prompt straight to `createAgentSessionServices`. An
 * RPC child cannot be handed objects, but pi exposes the same choices as flags
 * (`--skill`, `--extension`, `--prompt-template`, `--tools`, `--system-prompt`,
 * `--append-system-prompt`, and the matching `--no-*` switches), so the same
 * configuration produces the same resource set on both runtimes.
 *
 * Without this, an operator's `skillPaths` and `noExtensions` would be silently
 * ignored in RPC mode while pi quietly discovered *its own* `.pi/` and
 * `~/.pi/agent/` resources instead — a different agent than the one configured.
 *
 * Every value is one argv element: nothing here is a shell string, so a skill
 * path with a space and a multi-line system prompt both arrive intact.
 */
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "./config.ts";

export interface RpcResourceContext {
  /** Skills shipped with pi-outpost, already filtered by `noSkills` upstream. */
  bundledSkills: string[];
  /** The final prompt suffix, web-UI context block included when enabled. */
  appendSystemPrompt: string[];
}

/**
 * Which configuration key produced which flag.
 *
 * Pi-derived agents do not all speak the same command line: OMP, for instance,
 * has no `--skill` path loader (only a `--skills=<glob>` filter) and no
 * prompt-template flags at all. Such a child exits reporting "unknown flags",
 * which names the flag but not the setting — and the operator wrote the setting,
 * not the flag. This table turns one into the other in the startup error.
 */
const FLAG_ORIGIN = new Map<string, string>([
  ["--extension", "extensionPaths/extensionScripts"],
  ["--no-extensions", "noExtensions"],
  ["--skill", "skillPaths (and the bundled skills)"],
  ["--no-skills", "noSkills"],
  ["--prompt-template", "promptPaths"],
  ["--no-prompt-templates", "noPromptTemplates"],
  ["--tools", "tools"],
  ["--system-prompt", "systemPrompt"],
  ["--append-system-prompt", "appendSystemPrompt"],
  ["--offline", "offline"],
]);

/**
 * A sentence naming the settings behind the flags a child rejected, or nothing
 * when its complaint is about something pi-outpost did not put there.
 */
export function explainRejectedFlags(childOutput: string): string | undefined {
  const rejected = [...FLAG_ORIGIN.keys()].filter((flag) => new RegExp(`${flag}(?![\\w-])`).test(childOutput));
  if (rejected.length === 0) return undefined;
  const named = rejected.map((flag) => `${flag} (from "${FLAG_ORIGIN.get(flag)}")`).join(", ");
  return `That executable does not accept ${named}. Either remove the setting, or use an agent that supports it.`;
}

/**
 * Where the child can load pi-outpost's own tools from (see piOutpostTools.ts).
 *
 * Two shapes, checked in this order: the bundle a build emits next to the server
 * bundle, then the TypeScript source next to this file in a checkout — pi's loader
 * reads `.ts` directly. Nothing is guessed: if neither exists, the caller gets an
 * error naming both, because starting an RPC child that silently lacks
 * `present_structure` and the document extractors would look like the agent simply
 * choosing not to use them.
 */
export async function resolveToolsExtension(): Promise<string> {
  // `fileURLToPath`, never `url.pathname`: a pathname is percent-encoded and keeps
  // its leading slash, so a checkout under "~/My Projects/" yields "%20" and a
  // Windows path yields "/C:/…". Both fail every `access` below, and RPC mode would
  // refuse to start at all on a directory whose only sin is having a space in it.
  const candidates = [
    new URL("./pi-outpost-tools.mjs", import.meta.url),
    new URL("./piOutpostTools.ts", import.meta.url),
  ].map((url) => fileURLToPath(url));
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try the next shape
    }
  }
  throw new Error(
    `[pi] the RPC runtime needs pi-outpost's tools extension, and neither ${candidates.join(" nor ")} exists. ` +
      `A packaged build must ship pi-outpost-tools.mjs next to the server bundle.`,
  );
}

export function rpcResourceArgs(config: AppConfig, context: RpcResourceContext): string[] {
  const args: string[] = [];
  const each = (flag: string, values: readonly string[]) => {
    for (const value of values) args.push(flag, value);
  };

  // Discovery switches first, so an explicit path that follows still loads: pi
  // keeps `-e`/`--skill` paths under `--no-extensions`/`--no-skills`, which is the
  // same rule the embedded loader applies to additionalSkillPaths.
  if (config.noExtensions) args.push("--no-extensions");
  each("--extension", [...config.extensionPaths, ...config.extensionScripts]);

  if (config.noSkills) args.push("--no-skills");
  // The operator's paths come first for the same reason as in the embedded
  // runtime: the loader keeps the first skill under a given name, so theirs must
  // precede ours for an override to override anything.
  each("--skill", [...config.skillPaths, ...context.bundledSkills]);

  if (config.noPromptTemplates) args.push("--no-prompt-templates");
  each("--prompt-template", config.promptPaths);

  if (config.tools !== undefined) args.push("--tools", config.tools.join(","));

  if (config.systemPrompt !== undefined) args.push("--system-prompt", config.systemPrompt);
  each("--append-system-prompt", context.appendSystemPrompt);

  // The embedded runtime gets this through PI_OFFLINE, which the child inherits;
  // passing the flag too makes the intent visible in the logged command line.
  if (config.offline) args.push("--offline");

  return args;
}
