/**
 * The single sandbox root a `root`-mode embed may move.
 *
 * The control is only worth having if its refusals are as clear as its
 * affordance: a locked root and a server without a sandbox must both say so
 * rather than offer a chooser that cannot deliver.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkspaceRootControl } from "./WorkspaceRootControl";

type Props = React.ComponentProps<typeof WorkspaceRootControl>;

function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    sandbox: { root: "/srv/alpha" },
    browse: { status: "loaded", path: "/srv/beta", parent: "/srv", entries: [], requestId: "r1" },
    applyState: null,
    onBrowse: vi.fn(),
    onCloseBrowser: vi.fn(),
    onOpened: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  };
  const view = render(<WorkspaceRootControl {...props} />);
  return { ...view, props };
}

const openControl = () => screen.getByRole("button", { name: /Sandbox root/ });

describe("what the control offers", () => {
  it("names the current root and opens the picker on it", () => {
    const { props } = setup();

    // The last segment is what a header has room for; the whole path is still
    // reachable, since an operator picking a root needs to know which one.
    expect(openControl()).toHaveTextContent("alpha");
    expect(openControl()).toHaveAttribute("title", "/srv/alpha");

    fireEvent.click(openControl());

    expect(screen.getByTestId("server-path-picker")).toBeInTheDocument();
    // Starting where the sandbox already is, not at the filesystem root: the
    // neighbour of the current root is the likely answer.
    expect(props.onBrowse).toHaveBeenCalledWith("/srv/alpha");
    expect(props.onOpened).toHaveBeenCalled();
  });

  it("takes the chosen directory but leaves the picker up until the server answers", () => {
    const { props } = setup();
    fireEvent.click(openControl());

    fireEvent.click(screen.getByRole("button", { name: "Use this directory" }));

    expect(props.onSelect).toHaveBeenCalledWith("/srv/beta");
    // Closing here would report a move that has not happened yet — and a refusal
    // would then have nowhere to land.
    expect(screen.getByTestId("server-path-picker")).toBeInTheDocument();
  });

  it("closes once the replacement is applied", () => {
    const { props, rerender } = setup();
    fireEvent.click(openControl());
    fireEvent.click(screen.getByRole("button", { name: "Use this directory" }));

    rerender(<WorkspaceRootControl {...props} applyState={{ status: "applying" }} />);
    expect(screen.getByTestId("server-path-picker")).toBeInTheDocument();

    rerender(<WorkspaceRootControl {...props} applyState={null} sandbox={{ root: "/srv/beta" }} />);

    expect(screen.queryByTestId("server-path-picker")).not.toBeInTheDocument();
    expect(props.onCloseBrowser).toHaveBeenCalled();
  });

  it("keeps the picker open on a refusal, and says why", () => {
    const { props, rerender } = setup();
    fireEvent.click(openControl());
    fireEvent.click(screen.getByRole("button", { name: "Use this directory" }));
    rerender(<WorkspaceRootControl {...props} applyState={{ status: "applying" }} />);

    rerender(
      <WorkspaceRootControl
        {...props}
        applyState={{ status: "error", message: '"sandbox.writableRoot" must be inside "sandbox.root"' }}
      />,
    );

    // The root did not move, so the control must not look as though it did.
    expect(screen.getByTestId("server-path-picker")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("must be inside");
    expect(openControl()).toHaveTextContent("alpha");
  });

  it("chooses nothing when the picker is cancelled", () => {
    const { props } = setup();
    fireEvent.click(openControl());

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onCloseBrowser).toHaveBeenCalled();
    expect(screen.queryByTestId("server-path-picker")).not.toBeInTheDocument();
  });
});

describe("what the control refuses to offer", () => {
  it("reports a locked root instead of a chooser", () => {
    const { props } = setup({ sandbox: { root: "/srv/alpha", locks: { root: true } } });

    const button = screen.getByRole("button", { name: /Sandbox root: \/srv\/alpha \(locked\)/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);

    // Not a control that opens and then fails: the server would refuse the write,
    // and the user would have walked a filesystem for nothing.
    expect(screen.queryByTestId("server-path-picker")).not.toBeInTheDocument();
    expect(props.onBrowse).not.toHaveBeenCalled();
  });

  it("says there is no sandbox rather than pretending a boundary can be moved", () => {
    setup({ sandbox: null });

    expect(screen.getByText("No sandbox")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("sharing the one server-browse listing", () => {
  it("closes its picker when another header picker opens, and leaves the listing alone", () => {
    const { props, rerender } = setup();
    fireEvent.click(openControl());

    rerender(<WorkspaceRootControl {...props} blocked />);

    // Two pickers over one listing would show one of them a walk it did not start.
    expect(screen.queryByTestId("server-path-picker")).not.toBeInTheDocument();
    // But the listing belongs to whichever control just opened: releasing it here
    // would throw away the request that control is waiting on, and leave it empty.
    expect(props.onCloseBrowser).not.toHaveBeenCalled();
  });
});
