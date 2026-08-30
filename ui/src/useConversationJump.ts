import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatItem } from "@pi-outpost/shared";

interface JumpOptions {
  items: ChatItem[];
  /** The conversation scroller — jump targets are looked up inside it. */
  scrollerRef: React.RefObject<HTMLElement | null>;
  /** True while tool cards are filtered out of the conversation. */
  hideTools: boolean;
  /** Reveals tool cards; called before jumping to one that is filtered out. */
  onShowTools: () => void;
  /**
   * Called once the jump has been issued, so the conversation can stop following
   * the bottom and not yank the arrival back to the end.
   *
   * A report rather than the `stickToBottom` ref this used to take: the
   * conversation now keeps a second, render-visible copy of that fact and knows
   * the scroller's geometry, both of which it must weigh before deciding. A hook
   * that wrote the ref directly could reach only one of the two, and could not
   * tell a jump that moved the reader from one that changed nothing. The target
   * goes with the report because that question is answered from its box.
   */
  onJump: (target: Element) => void;
}

/** How long the target stays marked after arrival. */
const HIGHLIGHT_MS = 2000;

/**
 * Scrolls the conversation to an item by its index and marks it briefly.
 *
 * The index is the analysis panel's navigation identity (see
 * `util/sessionAnalysis.ts`): items carry it as `data-item-index`, which is what
 * this looks up. A tool call the conversation is currently filtering out is
 * revealed first — scrolling to an unrendered node would make the click a
 * silent no-op, the worst outcome for a navigation affordance.
 */
export function useConversationJump({ items, scrollerRef, hideTools, onShowTools, onJump }: JumpOptions) {
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const pending = useRef<number | null>(null);
  // Bumped per jump so a second jump to the same item still scrolls.
  const [nonce, setNonce] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const jumpToItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) return;
      // Revealing tools re-renders; the effect below runs after that render, so
      // the target node exists by the time it is looked up.
      if (item.kind === "tool" && hideTools) onShowTools();
      pending.current = index;
      setNonce((current) => current + 1);
    },
    [items, hideTools, onShowTools],
  );

  useEffect(() => {
    const index = pending.current;
    if (index === null) return;
    pending.current = null;
    const target = scrollerRef.current?.querySelector(`[data-item-index="${index}"]`);
    if (!target) return;
    onJump(target);
    target.scrollIntoView?.({ behavior: "smooth", block: "center" });
    setHighlightIndex(index);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHighlightIndex(null), HIGHLIGHT_MS);
  }, [nonce, hideTools, scrollerRef, onJump]);

  return { jumpToItem, highlightIndex };
}
