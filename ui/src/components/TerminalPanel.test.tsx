import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

    expect(screen.getByText("bash 1")).toBeInTheDocument();
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

    expect(screen.getByText("bash 2")).toBeInTheDocument();
    expect(openTerminal).toHaveBeenCalledTimes(2);
  });

  it("allows renaming tabs on double click", () => {
    render(<TerminalPanel {...defaultProps} />);

    const tab = screen.getByText("bash 1");
    fireEvent.doubleClick(tab);

    const input = screen.getByDisplayValue("bash 1");
    fireEvent.change(input, { target: { value: "API Server" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("API Server")).toBeInTheDocument();
  });

  it("calls onSetWorkspaceRoot when clicking sync button", () => {
    const onSetWorkspaceRoot = vi.fn();
    render(
      <TerminalPanel
        {...defaultProps}
        cwd="/custom/subproject"
        onSetWorkspaceRoot={onSetWorkspaceRoot}
      />,
    );

    const syncButton = screen.getByTitle(/Sync workspace root & LLM agent to/i);
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
});
