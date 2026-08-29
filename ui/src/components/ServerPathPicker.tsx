import { useEffect, useState } from "react";
import type { ServerBrowseState } from "../useAgent";

interface ServerPathPickerProps {
  /** Which setting is being picked — shown as the panel's heading. */
  label: string;
  /** The listing to show; null while nothing has come back yet. */
  browse: ServerBrowseState | null;
  /** Walk into a directory (or back up to a parent). */
  onBrowse: (path: string) => void;
  /** Take the directory currently shown as the setting's value. */
  onSelect: (path: string) => void;
  onCancel: () => void;
}

/**
 * Directory picker for a path-valued setting.
 *
 * It shows directories on the *server*, not in the workspace: an operator points
 * a setting at a mounted share, and that share is by definition outside the
 * sandbox the file browser is confined to. It reports a chosen path through
 * `onSelect` and holds no state of its own — which is what lets every path field
 * in the settings menu reuse the one component and one listing.
 */
export function ServerPathPicker({ label, browse, onBrowse, onSelect, onCancel }: ServerPathPickerProps) {
  const path = browse?.path ?? "/";
  const entries = browse?.entries ?? [];
  const loading = browse?.status === "loading";

  /**
   * The path as a field, not a caption.
   *
   * Two things it fixes. "Up" is meaningless without saying where you are — a
   * label alone left the button pointing at somewhere the user could not name.
   * And typing a path beats descending ten levels by mouse when you already know
   * the destination.
   *
   * Local while being typed, resynced whenever the server answers with a
   * different directory — so walking the list keeps the field current, and a
   * half-typed path is never overwritten by the listing it is about to replace.
   */
  const [typed, setTyped] = useState(path);
  useEffect(() => {
    setTyped(path);
  }, [path]);

  return (
    <div className="rounded-md border border-zinc-300 p-2 dark:border-zinc-700" data-testid="server-path-picker">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">{label}</span>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>
      <form
        className="mb-2 flex gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          const target = typed.trim();
          if (target) onBrowse(target);
        }}
      >
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            // Escape abandons the edit rather than the picker: the field is one
            // control inside it, and closing the whole panel on Escape would
            // discard a walk the user has not finished.
            if (event.key !== "Escape") return;
            event.stopPropagation();
            setTyped(path);
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Current directory"
          data-testid="picker-path"
          className="min-w-0 flex-1 rounded border border-zinc-300 px-2 py-1 font-mono text-xs text-zinc-700 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        />
        <button
          type="submit"
          disabled={typed.trim() === "" || typed === path}
          className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
        >
          Go
        </button>
      </form>
      {browse?.status === "error" && (
        <p role="alert" className="mb-2 text-xs text-red-600 dark:text-red-400">
          {browse.error}
        </p>
      )}
      <div className="mb-2 flex gap-2">
        <button
          type="button"
          disabled={!browse?.parent}
          onClick={() => browse?.parent && onBrowse(browse.parent)}
          className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
        >
          Up
        </button>
        <button
          type="button"
          onClick={() => onSelect(path)}
          className="rounded bg-zinc-800 px-2 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-200 dark:text-zinc-900"
        >
          Use this directory
        </button>
      </div>
      <ul className="max-h-40 overflow-y-auto">
        {loading && entries.length === 0 && <li className="px-2 py-1 text-xs text-zinc-400">Loading…</li>}
        {!loading && entries.length === 0 && browse?.status !== "error" && (
          <li className="px-2 py-1 text-xs text-zinc-400 dark:text-zinc-500">No subdirectories</li>
        )}
        {entries.map((entry) => (
          <li key={entry.path}>
            <button
              type="button"
              onClick={() => onBrowse(entry.path)}
              className="w-full truncate rounded px-2 py-1 text-left font-mono text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              title={entry.path}
            >
              {entry.name}
              {/* A drive is spelled the way Windows spells it: "C:\", not "C:/". */}
              {entry.name.endsWith(":") ? "\\" : "/"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
