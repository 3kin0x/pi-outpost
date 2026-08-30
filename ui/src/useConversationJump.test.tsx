import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import type { ChatItem } from "@pi-outpost/shared";
import { useConversationJump } from "./useConversationJump";

const items: ChatItem[] = [
  { kind: "user", text: "go" },
  { kind: "assistant", blocks: [], usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 } },
  { kind: "tool", toolCallId: "call-1", toolName: "read", args: {}, output: "out" },
];

/** Stands in for the conversation: same anchors, same hideTools filter. */
function Conversation({ startHidden = false, onStick }: { startHidden?: boolean; onStick?: (next: boolean) => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [hideTools, setHideTools] = useState(startHidden);
  const { jumpToItem, highlightIndex } = useConversationJump({
    items,
    scrollerRef,
    hideTools,
    onShowTools: () => setHideTools(false),
    onJump: () => {
      stickToBottom.current = false;
      onStick?.(false);
    },
  });

  return (
    <div>
      <button type="button" onClick={() => jumpToItem(1)}>
        jump to turn
      </button>
      <button type="button" onClick={() => jumpToItem(2)}>
        jump to tool
      </button>
      <div ref={scrollerRef}>
        {items.map((item, i) =>
          item.kind === "tool" && hideTools ? null : (
            <div key={i} data-item-index={i} data-highlighted={highlightIndex === i}>
              {item.kind}
            </div>
          ),
        )}
      </div>
      <span data-testid="stick">{String(stickToBottom.current)}</span>
    </div>
  );
}

function anchor(index: number) {
  return document.querySelector(`[data-item-index="${index}"]`);
}

describe("useConversationJump", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom has no layout, so scrollIntoView is not implemented.
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("scrolls to the item and marks it on arrival", () => {
    render(<Conversation />);
    act(() => {
      screen.getByText("jump to turn").click();
    });
    expect(anchor(1)?.getAttribute("data-highlighted")).toBe("true");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("clears the mark on its own", () => {
    render(<Conversation />);
    act(() => {
      screen.getByText("jump to turn").click();
    });
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(anchor(1)?.getAttribute("data-highlighted")).toBe("false");
  });

  it("reveals a hidden tool call before scrolling to it", () => {
    render(<Conversation startHidden />);
    expect(anchor(2)).toBeNull();
    act(() => {
      screen.getByText("jump to tool").click();
    });
    expect(anchor(2)).not.toBeNull();
    expect(anchor(2)?.getAttribute("data-highlighted")).toBe("true");
  });

  it("stops the conversation sticking to the bottom after a jump", () => {
    render(<Conversation />);
    act(() => {
      screen.getByText("jump to turn").click();
    });
    expect(screen.getByTestId("stick").textContent).toBe("false");
  });

  it("reports the jump to its owner rather than writing the fact itself", () => {
    // The conversation keeps a second, render-visible copy of this fact and knows
    // the scroller's geometry. A hook that wrote the ref directly could reach only
    // one of the two, and could not tell a jump that moved the reader from one
    // that changed nothing.
    const onStick = vi.fn();
    render(<Conversation onStick={onStick} />);
    act(() => {
      screen.getByText("jump to turn").click();
    });
    expect(onStick).toHaveBeenCalledWith(false);
  });

  it("does nothing for an index outside the conversation", () => {
    render(<Conversation />);
    expect(() => {
      act(() => {
        screen.getByText("jump to turn").click();
      });
    }).not.toThrow();
    expect(anchor(9)).toBeNull();
  });
});
