/**
 * The project selector: a header button, and the menu it opens.
 *
 * Drawn from `docs/design/multi-project-selector/` — read its README before
 * changing what this looks like. Two decisions from there are load-bearing rather
 * than decorative:
 *
 *  - **No monograms.** The full name carries identity and the path disambiguates
 *    two projects with the same basename; an initial would cost the reader a
 *    decoding step for something the name already says.
 *  - **The state is a word, not only a colour.** The dot repeats it, and the five
 *    marks differ in SHAPE — dashed ring, spinning arc, small dot, pulsing halo,
 *    glyph — so the column is legible in greyscale.
 *
 * Absent entirely while a single project is open: nothing new appears in a header
 * that already carries seven controls until there is something to choose.
 */
import { useEffect, useRef, useState } from "react";
import type { WorkspaceActivity, WorkspaceInfo } from "@pi-outpost/shared";
import { eventHitsNode } from "../util/clickOutside";

interface ProjectMenuProps {
  workspace: WorkspaceInfo | null;
  workspaces: WorkspaceInfo[];
  locked: boolean;
  onSwitch: (root: string) => void;
  onOpen: () => void;
  onClose: (root: string) => void;
}

const LABELS: Record<WorkspaceActivity, string> = {
  stopped: "arrêté",
  starting: "démarre…",
  idle: "au repos",
  working: "travaille",
  waiting: "t'attend",
};

/** The state mark. Shape first, colour second — see the file header. */
function ActivityMark({ activity }: { activity: WorkspaceActivity }) {
  switch (activity) {
    case "stopped":
      return <span className="h-2 w-2 shrink-0 rounded-full border border-dashed border-zinc-400 dark:border-zinc-600" />;
    case "starting":
      return (
        <svg className="h-2.5 w-2.5 shrink-0 animate-spin text-zinc-500 dark:text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
          <path d="M12 3a9 9 0 0 1 9 9" />
        </svg>
      );
    case "working":
      return (
        <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
          <span className="absolute h-2 w-2 animate-ping rounded-full bg-blue-700 opacity-60 dark:bg-blue-400" />
          <span className="relative h-2 w-2 rounded-full bg-blue-700 dark:bg-blue-400" />
        </span>
      );
    case "waiting":
      return <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />;
    default:
      return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400 dark:bg-zinc-600" />;
  }
}

/** The exclamation used wherever attention is reported. */
function AttentionGlyph({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M12 6v7" />
      <path d="M12 18h.01" />
    </svg>
  );
}

export function ProjectMenu(props: ProjectMenuProps) {
  const { workspace, workspaces, locked } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocument = (event: MouseEvent) => {
      // `composedPath`, not `contains`: inside the widget every document-level
      // event is retargeted to the shadow host, so `contains` answers "outside"
      // for every click in the embed — including the one picking a project,
      // which mousedown then killed before it could ever fire.
      if (!eventHitsNode(event, rootRef.current)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocument);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocument);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // A pinned server offers nothing at all, rather than a disabled control that
  // advertises something unavailable.
  if (locked) return null;

  // One project: no selector, but opening a second must stay reachable — this menu
  // is the only path to it, so hiding it entirely would make the one-to-two flow
  // impossible. A bare "+" instead of a row that would only ever name itself.
  if (workspaces.length < 2 || !workspace) {
    return (
      <button
        type="button"
        onClick={props.onOpen}
        title="Ouvrir un projet…"
        aria-label="Ouvrir un projet"
        className="flex items-center rounded-md border border-zinc-300 px-2 py-1 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </button>
    );
  }

  const others = workspaces.filter((w) => w.root !== workspace.root);
  const waiting = workspaces.filter((w) => w.needsAttention);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={`Projet : ${workspace.name} (${LABELS[workspace.activity]})`}
        className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
          waiting.length > 0
            ? "border-amber-500 bg-amber-50 text-zinc-700 dark:bg-amber-950/40 dark:text-zinc-200"
            : "border-zinc-400 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
        }`}
      >
        <ActivityMark activity={workspace.activity} />
        <span className="font-medium">{workspace.name}</span>
        {waiting.length > 0 ? (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
            <AttentionGlyph className="h-3 w-3" />
            <span className="font-semibold">{waiting.length}</span>
          </span>
        ) : (
          // Muted dots: one per other open project, pulsing where an agent is
          // working. They say "something is happening elsewhere", not where —
          // nothing to decode, and the names are one click away.
          others.some((w) => w.activity === "working") && (
            <>
              <span className="h-3 w-px bg-zinc-300 dark:bg-zinc-600" />
              <span className="flex items-center gap-1">
                {others.map((w) =>
                  w.activity === "working" ? (
                    <span key={w.root} className="relative flex h-1.5 w-1.5 items-center justify-center">
                      <span className="absolute h-1.5 w-1.5 animate-ping rounded-full bg-blue-700 opacity-60 dark:bg-blue-400" />
                      <span className="relative h-1.5 w-1.5 rounded-full bg-blue-700 dark:bg-blue-400" />
                    </span>
                  ) : (
                    <span key={w.root} className="h-1 w-1 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                  ),
                )}
              </span>
            </>
          )
        )}
        <svg className="h-3 w-3 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-40 mt-1 w-87 rounded-md border border-zinc-300 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {workspaces.map((w) => {
            const active = w.root === workspace.root;
            return (
              <div
                key={w.root}
                className={`group flex items-center gap-2.5 rounded-md px-2.5 py-2 ${active ? "bg-zinc-100 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"}`}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    if (!active) props.onSwitch(w.root);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <ActivityMark activity={w.activity} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={`truncate text-[13px] ${active ? "font-semibold text-zinc-900 dark:text-zinc-100" : "font-medium text-zinc-900 dark:text-zinc-100"}`}>
                      {w.name}
                    </span>
                    {/* The path is what separates two projects with the same basename. */}
                    <span className="truncate font-mono text-[11px] text-zinc-400 dark:text-zinc-500">{w.root}</span>
                  </span>
                </button>
                <span className="flex shrink-0 items-center gap-1.5">
                  {w.needsAttention ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-500">
                      <AttentionGlyph className="h-3 w-3" />
                      {LABELS.waiting}
                    </span>
                  ) : (
                    <span className={`text-[11px] ${w.activity === "working" ? "text-blue-700 dark:text-blue-400" : "text-zinc-400 dark:text-zinc-500"}`}>
                      {LABELS[w.activity]}
                    </span>
                  )}
                  {/* Offered even while the project is working: the server owns the
                      refusal, and hiding the control would leave the user unable to
                      learn that a running turn is what stands in the way. */}
                  {workspaces.length > 1 && (
                    <button
                      type="button"
                      title={`Fermer ${w.name}`}
                      aria-label={`Fermer ${w.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        props.onClose(w.root);
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded border border-transparent text-zinc-400 opacity-0 group-hover:border-zinc-300 group-hover:opacity-100 hover:text-zinc-700 dark:group-hover:border-zinc-600 dark:hover:text-zinc-200"
                    >
                      <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  )}
                </span>
              </div>
            );
          })}

          <div className="my-1 h-px bg-zinc-200 dark:bg-zinc-700" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              props.onOpen();
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
          >
            <svg className="h-3.5 w-3.5 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            Ouvrir un projet…
          </button>
        </div>
      )}
    </div>
  );
}
