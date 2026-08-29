/**
 * Re-invoke pi extension TUI renderers server-side and convert ANSI → HTML.
 * Same approach as pi's export-html (`createToolHtmlRenderer`).
 *
 * Relative imports from node_modules: pi-coding-agent does not export these modules
 * in package.json "exports", so we reach into dist/ directly. Stable in the monorepo
 * layout (they are resolved at build time, so a restructured node_modules is caught
 * by tsc before shipping).
 */
import { createCustomMessage } from "../../node_modules/@earendil-works/pi-coding-agent/dist/core/messages.js";
import { ansiLinesToHtml } from "../../node_modules/@earendil-works/pi-coding-agent/dist/core/export-html/ansi-to-html.js";
import { createToolHtmlRenderer } from "../../node_modules/@earendil-works/pi-coding-agent/dist/core/export-html/tool-renderer.js";
import { getThemeByName } from "../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import type { MessageRenderer, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";

const RENDER_WIDTH = 100;

/** Minimal pi-tui Component surface used by renderers. */
interface RenderComponent {
  render(width: number): string[];
}

export interface RenderedHtml {
  /** Expanded view (always present when rendering succeeds). */
  expanded: string;
  /** Collapsed preview when it differs from expanded. */
  collapsed?: string;
}

export interface ExtensionRenderDeps {
  getToolDefinition: (name: string) => ToolDefinition | undefined;
  getMessageRenderer: (customType: string) => MessageRenderer | undefined;
  cwd: string;
  themeName?: string;
}

/**
 * The renderers one workspace's extensions provide, and the HTML they produce.
 *
 * An instance per workspace, not a module singleton. The singleton this replaced
 * was configured by whichever project started last, so with two projects open the
 * second one's extensions rendered the first one's tool cards — with its own
 * extension runner and its own cwd, which is how a card ends up naming a path
 * that belongs to another project. Display correctness rather than a boundary:
 * nothing crosses the sandbox here, but what the reader sees is attributed to the
 * wrong project.
 */
export class ExtensionRenderer {
  private deps?: ExtensionRenderDeps;
  private theme?: Theme;
  private toolRenderer?: ReturnType<typeof createToolHtmlRenderer>;

  configure(next: ExtensionRenderDeps | undefined): void {
    this.deps = next;
    this.theme = next ? (getThemeByName(next.themeName ?? "dark") ?? getThemeByName("dark")) : undefined;
    this.toolRenderer =
      next && this.theme
        ? createToolHtmlRenderer({
            getToolDefinition: (name: string) => next.getToolDefinition(name),
            theme: this.theme,
            cwd: next.cwd,
            width: RENDER_WIDTH,
          })
        : undefined;
  }

  /** Render an extension's compact call header, if it provides one. */
  renderToolCallHtml(toolCallId: string, toolName: string, args: unknown): string | undefined {
    if (!this.toolRenderer) return undefined;
    try {
      const html = this.toolRenderer.renderCall(toolCallId, toolName, args);
      return html?.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  renderToolResultHtml(
    toolCallId: string,
    toolName: string,
    content: string | ToolContentBlock[] | undefined,
    details: unknown,
    isError: boolean,
  ): RenderedHtml | undefined {
    if (!this.toolRenderer) return undefined;
    try {
      const blocks = normalizeToolContent(content);
      const rendered = this.toolRenderer.renderResult(toolCallId, toolName, blocks, details, isError);
      if (!rendered?.expanded?.trim()) return undefined;
      return {
        expanded: rendered.expanded,
        ...(rendered.collapsed && rendered.collapsed !== rendered.expanded ? { collapsed: rendered.collapsed } : {}),
      };
    } catch {
      return undefined;
    }
  }

  renderCustomMessageHtml(
    customType: string,
    content: string | ToolContentBlock[],
    details: unknown | undefined,
    display: boolean,
  ): RenderedHtml | undefined {
    if (!this.deps || !this.theme) return undefined;
    const msgRenderer = this.deps.getMessageRenderer(customType);
    if (!msgRenderer) return undefined;

    try {
      const message = createCustomMessage(
        customType,
        content as Parameters<typeof createCustomMessage>[1],
        display,
        details,
        new Date().toISOString(),
      );
      const collapsed = componentToHtml(msgRenderer(message, { expanded: false, outputPad: 0 }, this.theme) as RenderComponent);
      const expanded = componentToHtml(msgRenderer(message, { expanded: true, outputPad: 0 }, this.theme) as RenderComponent);
      if (!expanded) return undefined;
      return {
        expanded,
        ...(collapsed && collapsed !== expanded ? { collapsed } : {}),
      };
    } catch {
      return undefined;
    }
  }
}

function componentToHtml(component: RenderComponent | undefined): string | undefined {
  if (!component) return undefined;
  try {
    const html = ansiLinesToHtml(component.render(RENDER_WIDTH));
    return html.trim() ? html : undefined;
  } catch {
    return undefined;
  }
}

export type ToolContentBlock = {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
};

export function normalizeToolContent(content: string | ToolContentBlock[] | undefined): ToolContentBlock[] {
  if (content === undefined) return [];
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  return content;
}
