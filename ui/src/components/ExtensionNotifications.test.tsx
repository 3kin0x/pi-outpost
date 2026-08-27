import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ExtensionNotifications } from "./ExtensionNotifications";
import type { ExtensionNotification } from "../useAgent";

describe("ExtensionNotifications", () => {
  it("returns null when empty", () => {
    const { container } = render(<ExtensionNotifications notifications={[]} onDismiss={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders toasts", () => {
    const notifications: ExtensionNotification[] = [
      { id: "1", message: "Info message", notifyType: "info" },
      { id: "2", message: "Warning message", notifyType: "warning" },
    ];
    render(<ExtensionNotifications notifications={notifications} onDismiss={vi.fn()} />);
    expect(screen.getByText("Info message")).toBeInTheDocument();
    expect(screen.getByText("Warning message")).toBeInTheDocument();
  });

  it("applies correct styles per type", () => {
    const nfo: ExtensionNotification[] = [{ id: "1", message: "Info", notifyType: "info" }];
    const warn: ExtensionNotification[] = [{ id: "2", message: "Warning", notifyType: "warning" }];
    const err: ExtensionNotification[] = [{ id: "3", message: "Error", notifyType: "error" }];

    const { container: c1 } = render(<ExtensionNotifications notifications={nfo} onDismiss={vi.fn()} />);
    const { container: c2 } = render(<ExtensionNotifications notifications={warn} onDismiss={vi.fn()} />);
    const { container: c3 } = render(<ExtensionNotifications notifications={err} onDismiss={vi.fn()} />);

    const t1 = c1.querySelector("[class*='border-blue']");
    const t2 = c2.querySelector("[class*='border-amber']");
    const t3 = c3.querySelector("[class*='border-red']");
    expect(t1).toBeInTheDocument();
    expect(t2).toBeInTheDocument();
    expect(t3).toBeInTheDocument();
  });

  it("auto-dismisses after 6 seconds", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<ExtensionNotifications notifications={[{ id: "1", message: "Auto", notifyType: "info" }]} onDismiss={onDismiss} />);
    vi.advanceTimersByTime(6000);
    expect(onDismiss).toHaveBeenCalledWith("1");
    vi.useRealTimers();
  });

  // The bug this guards: the parent re-creates `onDismiss` on every render, so an
  // effect keyed on the callback restarted the six-second timer each time. A
  // streaming answer re-renders far faster than that, and the toast became
  // permanent — sitting on top of the Work Plan panel.
  it("auto-dismisses on schedule even while the parent keeps re-rendering", () => {
    vi.useFakeTimers();
    try {
      const onDismiss = vi.fn();
      const notifications: ExtensionNotification[] = [{ id: "1", message: "Auto", notifyType: "info" }];
      const { rerender } = render(<ExtensionNotifications notifications={notifications} onDismiss={onDismiss} />);
      // A fresh inline callback per render, exactly as App passes one down.
      for (let elapsed = 0; elapsed < 6000; elapsed += 100) {
        vi.advanceTimersByTime(100);
        rerender(<ExtensionNotifications notifications={notifications} onDismiss={(id) => onDismiss(id)} />);
      }
      expect(onDismiss).toHaveBeenCalledWith("1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("dismisses on demand from the close button", () => {
    const onDismiss = vi.fn();
    render(<ExtensionNotifications notifications={[{ id: "1", message: "Manual", notifyType: "info" }]} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(onDismiss).toHaveBeenCalledWith("1");
  });
});
