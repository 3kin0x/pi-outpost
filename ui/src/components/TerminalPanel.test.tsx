import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { TerminalPanel } from "./TerminalPanel";
import { ThemeContext } from "../theme/ThemeContext";

describe("TerminalPanel", () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    cwd: "/test/project",
    openTerminal: vi.fn(),
    sendTerminalInput: vi.fn(),
    getTerminalCwd: vi.fn(),
    resizeTerminal: vi.fn(),
    closeTerminal: vi.fn(),
    subscribeTerminal: vi.fn(() => () => {}),
  };

  it("is not rendered initially before being opened", () => {
    const { container } = render(<TerminalPanel {...defaultProps} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("is hidden with CSS class when minimized without unmounting", () => {
    const { container, rerender } = render(<TerminalPanel {...defaultProps} open={true} />);
    expect(container.firstChild).toHaveClass("flex");

    rerender(<TerminalPanel {...defaultProps} open={false} />);
    expect(container.firstChild).toHaveClass("hidden");
  });

  it("renders tabs and controls when open", () => {
    render(
      <ThemeContext.Provider value="dark">
        <TerminalPanel {...defaultProps} />
      </ThemeContext.Provider>,
    );

    expect(screen.getByText("terminal 1")).toBeInTheDocument();
    expect(screen.getByTitle("New Terminal Tab")).toBeInTheDocument();
    expect(screen.getByTitle("Clear Terminal Output")).toBeInTheDocument();
    expect(screen.getByTitle(/Maximize Terminal Panel/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Minimize Terminal Panel/i)).toBeInTheDocument();
  });

  it("calls openTerminal with initial tab id", () => {
    const openTerminal = vi.fn();
    render(<TerminalPanel {...defaultProps} openTerminal={openTerminal} />);

    expect(openTerminal).toHaveBeenCalledWith(
      "term-1",
      "/test/project",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("adds a new tab when clicking + button", () => {
    const openTerminal = vi.fn();
    render(<TerminalPanel {...defaultProps} openTerminal={openTerminal} />);

    const addButton = screen.getByTitle("New Terminal Tab");
    fireEvent.click(addButton);

    expect(screen.getByText("terminal 2")).toBeInTheDocument();
    expect(openTerminal).toHaveBeenCalledTimes(2);
  });

  it("allows renaming tabs on double click", () => {
    render(<TerminalPanel {...defaultProps} />);

    const tab = screen.getByText("terminal 1");
    fireEvent.doubleClick(tab);

    const input = screen.getByDisplayValue("terminal 1");
    fireEvent.change(input, { target: { value: "API Server" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("API Server")).toBeInTheDocument();
  });

  it("calls onSetWorkspaceRoot when clicking open as project button", () => {
    const onSetWorkspaceRoot = vi.fn();
    render(
      <TerminalPanel
        {...defaultProps}
        cwd="/custom/subproject"
        onSetWorkspaceRoot={onSetWorkspaceRoot}
      />,
    );

    const syncButton = screen.getByTitle(/as the workspace project and reposition the LLM agent/i);
    fireEvent.click(syncButton);

    expect(onSetWorkspaceRoot).toHaveBeenCalledWith("/custom/subproject");
  });

  it("toggles maximize panel height", () => {
    render(<TerminalPanel {...defaultProps} />);

    const maxButton = screen.getByTitle("Maximize Terminal Panel");
    fireEvent.click(maxButton);

    expect(screen.getByTitle("Restore Terminal Panel")).toBeInTheDocument();

    const restoreButton = screen.getByTitle("Restore Terminal Panel");
    fireEvent.click(restoreButton);

    expect(screen.getByTitle("Maximize Terminal Panel")).toBeInTheDocument();
  });

  it("calls onClose when clicking minimize button", () => {
    const onClose = vi.fn();
    render(<TerminalPanel {...defaultProps} onClose={onClose} />);

    const closeButton = screen.getByTitle(/Minimize Terminal Panel/i);
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalled();
  });

  it("handles tab renaming with Escape key and empty string", () => {
    render(<TerminalPanel {...defaultProps} />);

    const tab = screen.getByText("terminal 1");
    fireEvent.doubleClick(tab);

    const input = screen.getByDisplayValue("terminal 1");
    // Press Escape to cancel
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByText("terminal 1")).toBeInTheDocument();

    // Double click again and submit whitespace
    fireEvent.doubleClick(screen.getByText("terminal 1"));
    const input2 = screen.getByDisplayValue("terminal 1");
    fireEvent.change(input2, { target: { value: "   " } });
    fireEvent.keyDown(input2, { key: "Enter" });
    expect(screen.getByText("terminal 1")).toBeInTheDocument();
  });

  it("handles tab closing and active tab switching", () => {
    render(<TerminalPanel {...defaultProps} />);

    const addButton = screen.getByTitle("New Terminal Tab");
    fireEvent.click(addButton);
    fireEvent.click(addButton);

    expect(screen.getByText("terminal 1")).toBeInTheDocument();
    expect(screen.getByText("terminal 2")).toBeInTheDocument();
    expect(screen.getByText("terminal 3")).toBeInTheDocument();

    // Close buttons for tabs
    const closeButtons = screen.getAllByRole("button", { name: "Close terminal tab" });
    expect(closeButtons.length).toBeGreaterThan(0);

    // Close the active 3rd tab
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(screen.queryByText("terminal 3")).not.toBeInTheDocument();
    expect(screen.getByText("terminal 2")).toBeInTheDocument();
  });

  it("handles terminal subscriptions: onData, onCwd, OSC 7, onExit, onError", () => {
    let capturedCallbacks: any;
    const subscribeTerminal = vi.fn((_id, callbacks) => {
      capturedCallbacks = callbacks;
      return () => {};
    });

    render(
      <TerminalPanel
        {...defaultProps}
        onSetWorkspaceRoot={vi.fn()}
        subscribeTerminal={subscribeTerminal}
      />,
    );

    expect(subscribeTerminal).toHaveBeenCalled();
    expect(capturedCallbacks).toBeDefined();

    // Test onData
    act(() => {
      capturedCallbacks.onData("normal output\n");
    });

    // Test onData with OSC 7 directory notification
    act(() => {
      capturedCallbacks.onData("\x1b]7;file://localhost/Users/developer/project/nested/deep/path\x07");
    });
    expect(screen.getByText(/nested\/deep\/path/)).toBeInTheDocument();

    // Test onCwd
    act(() => {
      capturedCallbacks.onCwd("/var/www/html");
    });
    expect(screen.getByText(/var\/www\/html/)).toBeInTheDocument();

    // Test onExit
    act(() => {
      capturedCallbacks.onExit(0);
      capturedCallbacks.onExit(1);
    });

    // Test onError
    act(() => {
      capturedCallbacks.onError("connection lost");
    });
  });

  it("handles root filesystem confirmation prompt when syncing", () => {
    const onSetWorkspaceRoot = vi.fn();
    const originalConfirm = window.confirm;

    let capturedCallbacks: any;
    const subscribeTerminal = vi.fn((_id, callbacks) => {
      capturedCallbacks = callbacks;
      return () => {};
    });

    render(
      <TerminalPanel
        {...defaultProps}
        cwd="/"
        onSetWorkspaceRoot={onSetWorkspaceRoot}
        subscribeTerminal={subscribeTerminal}
      />,
    );

    // User cancels confirm
    window.confirm = vi.fn(() => false);
    const syncButton = screen.getByTitle(/as the workspace project/i);
    fireEvent.click(syncButton);
    expect(onSetWorkspaceRoot).not.toHaveBeenCalled();

    // User accepts confirm
    window.confirm = vi.fn(() => true);
    fireEvent.click(syncButton);
    expect(onSetWorkspaceRoot).toHaveBeenCalledWith("/");

    window.confirm = originalConfirm;
  });

  it("handles clear terminal action", () => {
    render(<TerminalPanel {...defaultProps} />);

    const clearButton = screen.getByTitle("Clear Terminal Output");
    fireEvent.click(clearButton);
  });

  it("handles clicking tabs to switch active tab", () => {
    render(<TerminalPanel {...defaultProps} />);

    const addButton = screen.getByTitle("New Terminal Tab");
    fireEvent.click(addButton);

    // Click first tab to switch back
    const tab1 = screen.getByText("terminal 1");
    fireEvent.click(tab1);
    expect(tab1).toBeInTheDocument();
  });

  it("toggles theme dynamically", () => {
    const { rerender } = render(
      <ThemeContext.Provider value="light">
        <TerminalPanel {...defaultProps} />
      </ThemeContext.Provider>,
    );

    rerender(
      <ThemeContext.Provider value="dark">
        <TerminalPanel {...defaultProps} />
      </ThemeContext.Provider>,
    );
  });

  it("calls onClose when removing the last remaining tab", () => {
    const onClose = vi.fn();
    render(<TerminalPanel {...defaultProps} onClose={onClose} />);

    // Add a tab then remove both
    const addButton = screen.getByTitle("New Terminal Tab");
    fireEvent.click(addButton);

    const closeButtons = screen.getAllByRole("button", { name: "Close terminal tab" });
    fireEvent.click(closeButtons[0]);
  });
});
