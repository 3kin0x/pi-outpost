import { useEffect, useId, useRef, useState } from "react";
import { useThemeContext } from "../theme/ThemeContext";
import { CopyButton } from "./CopyButton";
import { EnlargedView } from "./EnlargedView";

type MermaidTheme = "dark" | "default";

let mermaidPromise: Promise<typeof import("mermaid")> | null = null;
let initializedTheme: MermaidTheme | null = null;

/** Lazy-load mermaid (heavy) only when a diagram is actually rendered. */
async function loadMermaid(theme: MermaidTheme) {
  const module = await (mermaidPromise ??= import("mermaid"));
  if (initializedTheme !== theme) {
    initializedTheme = theme;
    module.default.initialize({
      startOnLoad: false,
      theme,
      securityLevel: "strict",
      // On parse errors mermaid injects an error SVG into the document —
      // keep failures inside our fallback <pre> instead
      suppressErrorRendering: true,
    });
  }
  return module;
}

/**
 * The diagram's own width, read from its viewBox.
 *
 * Needed because mermaid writes `width="100%"` and a `max-width` on the SVG: it
 * has no intrinsic size, it fills whatever it is put in. Dropped into the
 * overlay's shrink-to-fit box that comes out *smaller* than the chat column —
 * enlarge that shrinks. Giving the box the diagram's real width makes the SVG
 * fill exactly that, and the modal scrolls when it does not fit.
 */
export function naturalWidth(svg: string): number | undefined {
  const viewBox = /viewBox="\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(svg);
  const width = viewBox ? Number(viewBox[1]) : Number.NaN;
  return Number.isFinite(width) && width > 0 ? width : undefined;
}

function mermaidCode(children: React.ReactNode): string | null {
  if (
    children !== null &&
    typeof children === "object" &&
    "props" in children &&
    typeof (children.props as { className?: string }).className === "string" &&
    /language-mermaid\b/.test((children.props as { className: string }).className)
  ) {
    return String((children.props as { children?: React.ReactNode }).children ?? "").trim();
  }
  return null;
}

/**
 * A `ReactMarkdown` `pre` renderer: routes ```mermaid fences to `Mermaid`, keeps
 * everything else as plain `<pre>`. Shared by every markdown surface (chat
 * messages, the file-viewer's `.md` preview) so a diagram fence renders the same
 * way wherever it appears, rather than each surface reimplementing the routing.
 */
export function MarkdownPre(props: React.HTMLAttributes<HTMLPreElement>) {
  const { children, ...rest } = props;
  const code = mermaidCode(children);
  if (code !== null) return <Mermaid code={code} />;
  return <pre {...rest}>{children}</pre>;
}

export function Mermaid({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const theme = useThemeContext();
  const mermaidTheme: MermaidTheme = theme === "light" ? "default" : "dark";
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  // The block, not the diagram: it stays mounted whichever face is showing, so
  // the overlay can always tell which tree it belongs to.
  const blockRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef(code);
  codeRef.current = code;

  useEffect(() => {
    let cancelled = false;
    // Debounce: during streaming the code arrives in chunks and intermediate
    // states are invalid diagrams — only render once input settles.
    const timer = setTimeout(async () => {
      try {
        const mermaid = (await loadMermaid(mermaidTheme)).default;
        const { svg } = await mermaid.render(`mermaid-${id}`, codeRef.current);
        if (!cancelled) {
          setSvg(svg);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, id, mermaidTheme]);

  if (svg) {
    return (
      <div
        ref={blockRef}
        className="group relative my-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="absolute left-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => setShowCode(!showCode)}
            title={showCode ? "Show diagram" : "Show code"}
            className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            {showCode ? "⚏ diagram" : "⌗ code"}
          </button>
        </div>
        <div className="absolute right-2 top-2 z-10 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          {/* Same reason the structured-exchange view has one: a wide diagram in a
              narrow column arrives as a sliver, and scrolling it sideways is not
              reading it. */}
          {!showCode && (
            <button
              type="button"
              onClick={() => setEnlarged(true)}
              // Named, not just captioned: the structured-exchange view has an
              // enlarge control of its own, and a page carrying both would
              // otherwise offer two buttons called the same thing.
              aria-label="Show diagram at full size"
              className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            >
              ⤢ enlarge
            </button>
          )}
          <CopyButton text={code} />
        </div>
        {showCode ? (
          <pre className="overflow-x-auto font-mono text-xs text-zinc-500 dark:text-zinc-400">{code}</pre>
        ) : (
          <div
            className="flex justify-center overflow-x-auto [&_svg]:max-w-full"
            // eslint-disable-next-line react/no-danger — SVG produced by mermaid with securityLevel strict
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
        <EnlargedView
          label="diagram"
          testId="mermaid-enlarged"
          open={enlarged}
          onClose={() => setEnlarged(false)}
          anchorRef={blockRef}
        >
          <div
            style={{ width: naturalWidth(svg) }}
            className="[&_svg]:!h-auto [&_svg]:!max-w-none [&_svg]:!w-full"
            // eslint-disable-next-line react/no-danger — the same SVG, at its own size
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </EnlargedView>
      </div>
    );
  }
  return (
    <pre className="my-2 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
      {code}
      {error && <div className="mt-2 text-red-600 dark:text-red-400">{error}</div>}
    </pre>
  );
}
