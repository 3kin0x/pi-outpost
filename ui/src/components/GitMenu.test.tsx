import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { GitLogEntry, GitRepoStatus } from "@pi-outpost/shared";
import { GitMenu } from "./GitMenu";
import type { GitStatusState } from "../useAgent";

/** One repository at the browser root — the shape a single-project workspace has. */
const ONE: GitRepoStatus[] = [{ repo: "", branch: "main", ahead: 0, behind: 0 }];

/** A directory of projects: the root is no repository, each child is one. */
const TWO: GitRepoStatus[] = [
  { repo: "projA", branch: "main", ahead: 0, behind: 0 },
  { repo: "projB", branch: "release", ahead: 1, behind: 2 },
];

function status(repos: GitRepoStatus[] = ONE): GitStatusState {
  return { repos, files: {} };
}

const LOG: GitLogEntry[] = [
  { sha: "aaaaaaa1111", author: "Ada", date: new Date().toISOString(), subject: "most recent" },
  { sha: "bbbbbbb2222", author: "Grace", date: new Date(Date.now() - 3 * 86400_000).toISOString(), subject: "three days back" },
];

function setup(props: Partial<React.ComponentProps<typeof GitMenu>> = {}) {
  const onFetchLog = vi.fn();
  const onShowCommit = vi.fn();
  const view = render(
    <GitMenu status={status()} selected={null} log={LOG} onFetchLog={onFetchLog} onShowCommit={onShowCommit} {...props} />,
  );
  return { onFetchLog, onShowCommit, ...view };
}

/** The branch chip, which is also the menu's toggle. */
function chip() {
  return screen.getByRole("button", { name: /⎇/ });
}

describe("GitMenu", () => {
  it("shows the current branch", () => {
    setup();
    expect(chip()).toHaveTextContent("main");
  });

  it("waits for the branch rather than inventing one", () => {
    setup({ status: null });
    expect(chip()).toHaveTextContent("…");
  });

  it("shows ahead and behind counts only when there is something to report", () => {
    const { rerender } = setup();
    expect(chip()).not.toHaveTextContent("↑");
    rerender(
      <GitMenu
        status={status([{ repo: "", branch: "main", ahead: 2, behind: 3 }])}
        selected={null}
        log={LOG}
        onFetchLog={vi.fn()}
        onShowCommit={vi.fn()}
      />,
    );
    expect(chip()).toHaveTextContent("↑2");
    expect(chip()).toHaveTextContent("↓3");
  });

  it("keeps the menu closed until asked", () => {
    setup();
    expect(screen.queryByText("most recent")).not.toBeInTheDocument();
  });

  it("fetches the log when it opens, not on every render", () => {
    const { onFetchLog, rerender } = setup();
    expect(onFetchLog).not.toHaveBeenCalled();
    fireEvent.click(chip());
    expect(onFetchLog).toHaveBeenCalledTimes(1);
    rerender(<GitMenu status={status()} selected={null} log={LOG} onFetchLog={onFetchLog} onShowCommit={vi.fn()} />);
    expect(onFetchLog).toHaveBeenCalledTimes(1);
  });

  it("lists the commits once open", () => {
    setup();
    fireEvent.click(chip());
    expect(screen.getByText("most recent")).toBeInTheDocument();
    expect(screen.getByText("three days back")).toBeInTheDocument();
  });

  it("abbreviates the commit id", () => {
    setup();
    fireEvent.click(chip());
    expect(screen.getByText("aaaaaaa")).toBeInTheDocument();
    expect(screen.queryByText("aaaaaaa1111")).not.toBeInTheDocument();
  });

  it("dates commits relative to now", () => {
    setup();
    fireEvent.click(chip());
    expect(screen.getByText(/Ada · now/)).toBeInTheDocument();
    expect(screen.getByText(/Grace · 3d ago/)).toBeInTheDocument();
  });

  it("reports the chosen commit and closes", () => {
    const { onShowCommit } = setup();
    fireEvent.click(chip());
    fireEvent.click(screen.getByText("three days back"));
    expect(onShowCommit).toHaveBeenCalledWith("", "bbbbbbb2222");
    expect(screen.queryByText("three days back")).not.toBeInTheDocument();
  });

  it("says it is loading rather than showing an empty list", () => {
    setup({ log: null });
    fireEvent.click(chip());
    expect(screen.getByText("loading…")).toBeInTheDocument();
  });

  it("distinguishes a repository with no commits from one still loading", () => {
    setup({ log: [] });
    fireEvent.click(chip());
    expect(screen.getByText("no commits")).toBeInTheDocument();
    expect(screen.queryByText("loading…")).not.toBeInTheDocument();
  });

  it("closes when the pointer goes down outside it", () => {
    setup();
    fireEvent.click(chip());
    expect(screen.getByText("most recent")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("most recent")).not.toBeInTheDocument();
  });

  it("stays open when the pointer goes down inside it", () => {
    setup();
    fireEvent.click(chip());
    fireEvent.mouseDown(within(screen.getByText("most recent")).getByText("most recent"));
    expect(screen.getByText("most recent")).toBeInTheDocument();
  });

  it("keeps the whole subject reachable on hover, since the row truncates it", () => {
    setup();
    fireEvent.click(chip());

    expect(screen.getByText("most recent")).toHaveAttribute("title", "most recent");
  });

  describe("a workspace holding several repositories", () => {
    const render2 = (selected: string | null, handlers: Partial<React.ComponentProps<typeof GitMenu>> = {}) =>
      setup({ status: status(TWO), selected, ...handlers });

    it("names the branch of the repository owning the selected file", () => {
      const { rerender, onFetchLog, onShowCommit } = render2("projA/src/main.ts");
      expect(chip()).toHaveTextContent("main");
      expect(chip()).not.toHaveTextContent("release");

      rerender(
        <GitMenu status={status(TWO)} selected="projB/README.md" log={LOG} onFetchLog={onFetchLog} onShowCommit={onShowCommit} />,
      );
      expect(chip()).toHaveTextContent("release");
      expect(chip()).toHaveTextContent("↑1");
      expect(chip()).toHaveTextContent("↓2");
    });

    it("names the project too, since one branch name no longer says which", () => {
      render2("projB/README.md");
      expect(chip()).toHaveTextContent("projB");
    });

    it("names no branch while nothing is selected, and stays on screen", () => {
      render2(null);
      expect(chip()).toBeInTheDocument();
      expect(chip()).toHaveTextContent("—");
      expect(chip()).not.toHaveTextContent("main");
      expect(chip()).not.toHaveTextContent("release");
    });

    it("leaves the chip where it was when the selection is under no repository", () => {
      const { rerender, onFetchLog, onShowCommit } = render2("projA/src/main.ts");
      expect(chip()).toHaveTextContent("main");
      rerender(<GitMenu status={status(TWO)} selected="notes.md" log={LOG} onFetchLog={onFetchLog} onShowCommit={onShowCommit} />);
      expect(chip()).toHaveTextContent("main");
    });

    it("asks for the selected repository's log, and reports a commit against it", () => {
      const { onFetchLog, onShowCommit } = render2("projB/README.md");
      fireEvent.click(chip());
      expect(onFetchLog).toHaveBeenCalledWith("projB");
      fireEvent.click(screen.getByText("three days back"));
      expect(onShowCommit).toHaveBeenCalledWith("projB", "bbbbbbb2222");
    });

    it("offers no history to open while no repository is named", () => {
      const { onFetchLog } = render2(null);
      fireEvent.click(chip());
      expect(onFetchLog).not.toHaveBeenCalled();
      expect(screen.queryByText("most recent")).not.toBeInTheDocument();
    });
  });
});
