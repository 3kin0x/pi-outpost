import type { ExtensionWidget } from "../useAgent";
import { parseAnsi } from "../util/ansi";

/**
 * One line of a widget, with its terminal styling honoured.
 *
 * Extension widgets are written for a terminal and arrive pre-styled — pi passes
 * the author's own escape sequences through unchanged. Printed verbatim they read
 * as `ESC[38;2;225;90;31m◆ESC[39m`; interpreted, they read as the author meant.
 */
function AnsiLine({ line }: { line: string }) {
  const segments = parseAnsi(line);
  return (
    <>
      {segments.map((segment, index) => (
        <span
          key={index}
          style={{
            ...(segment.color ? { color: segment.color } : {}),
            ...(segment.bold ? { fontWeight: 600 } : {}),
            ...(segment.dim ? { opacity: 0.7 } : {}),
            ...(segment.italic ? { fontStyle: "italic" } : {}),
            ...(segment.underline ? { textDecoration: "underline" } : {}),
          }}
        >
          {segment.text}
        </span>
      ))}
    </>
  );
}

/** Renders extension setWidget() content — see extensions.md#custom-ui. String-array widgets only (no factories). */
export function ExtensionWidgets({
  widgets,
  placement,
}: {
  widgets: Record<string, ExtensionWidget>;
  placement: "aboveEditor" | "belowEditor";
}) {
  const entries = Object.entries(widgets).filter(([, w]) => w.placement === placement);
  if (entries.length === 0) return null;
  return (
    <div className="mb-2 flex flex-col gap-1">
      {entries.map(([key, widget]) => (
        <div
          key={key}
          className="whitespace-pre-wrap rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 font-mono text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
        >
          {widget.lines.map((line, index) => (
            <div key={index}>
              <AnsiLine line={line} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
