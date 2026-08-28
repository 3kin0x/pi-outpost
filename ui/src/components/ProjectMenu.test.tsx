/**
 * The project selector, at the boundaries the spec draws around it:
 * what it offers, what it refuses to offer, and what it says without words.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { WorkspaceInfo } from "@pi-outpost/shared";
import { ProjectMenu } from "./ProjectMenu";

function workspace(overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
  return {
    root: "/srv/alpha",
    name: "alpha",
    activity: "idle",
    needsAttention: false,
    ...overrides,
  };
}

type Props = React.ComponentProps<typeof ProjectMenu>;

function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    workspace: workspace(),
    workspaces: [workspace(), workspace({ root: "/srv/beta", name: "beta" })],
    locked: false,
    onSwitch: vi.fn(),
    onOpen: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return { ...render(<ProjectMenu {...props} />), props };
}

describe("what the selector offers", () => {
  it("names every open project with its path and its state in words", () => {
    setup({
      workspaces: [
        workspace(),
        workspace({ root: "/srv/beta", name: "beta", activity: "working" }),
        workspace({ root: "/srv/gamma", name: "gamma", activity: "stopped" }),
      ],
    });

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const menu = screen.getByRole("menu");

    for (const [name, path, state] of [
      ["alpha", "/srv/alpha", "au repos"],
      ["beta", "/srv/beta", "travaille"],
      ["gamma", "/srv/gamma", "arrêté"],
    ]) {
      expect(within(menu).getByText(name)).toBeInTheDocument();
      // The path is what separates two projects sharing a basename.
      expect(within(menu).getByText(path)).toBeInTheDocument();
      expect(within(menu).getByText(state)).toBeInTheDocument();
    }
  });

  it("switches to the project that was clicked, and not to the current one", () => {
    const { props } = setup();

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByRole("menuitem", { name: /beta/ }));
    expect(props.onSwitch).toHaveBeenCalledWith("/srv/beta");

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByRole("menuitem", { name: /alpha/ }));
    expect(props.onSwitch).toHaveBeenCalledTimes(1);
  });

  it("offers closing a project even while it works — the server owns the refusal", () => {
    const { props } = setup({
      workspaces: [workspace(), workspace({ root: "/srv/beta", name: "beta", activity: "working" })],
    });

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByRole("button", { name: "Fermer beta" }));
    expect(props.onClose).toHaveBeenCalledWith("/srv/beta");
  });

  it("keeps opening reachable with a single project, where there is nothing to choose", () => {
    const { props } = setup({ workspaces: [workspace()] });

    // No selector — but the one-to-two flow has to start somewhere.
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir un projet" }));
    expect(props.onOpen).toHaveBeenCalled();
  });
});

describe("what a pinned server offers", () => {
  it("offers nothing at all — not a disabled control", () => {
    const { container } = setup({ locked: true });

    // The widget embeds with this set, and a greyed-out selector would advertise
    // a choice the host has already made.
    expect(container).toBeEmptyDOMElement();
  });
});

describe("attention, without interrupting anyone", () => {
  it("counts the waiting projects on the button", () => {
    setup({
      workspaces: [
        workspace(),
        workspace({ root: "/srv/beta", name: "beta", activity: "waiting", needsAttention: true }),
        workspace({ root: "/srv/gamma", name: "gamma", activity: "waiting", needsAttention: true }),
      ],
    });

    const button = screen.getByRole("button", { expanded: false });
    expect(button).toHaveTextContent("2");
    // The badge is the only change to the current project's screen: no dialog,
    // no focus move — there is nothing else here to render.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("names the waiting project in words once the menu is open", () => {
    setup({
      workspaces: [workspace(), workspace({ root: "/srv/beta", name: "beta", activity: "waiting", needsAttention: true })],
    });

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const row = within(screen.getByRole("menu")).getByText("beta").closest("div")!;
    expect(within(row).getByText("t'attend")).toBeInTheDocument();
  });
});
