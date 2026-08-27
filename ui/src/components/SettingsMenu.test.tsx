import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsMenu } from "./SettingsMenu";

type Props = React.ComponentProps<typeof SettingsMenu>;
type Sandbox = NonNullable<Props["sandbox"]>;

function sandbox(overrides: Partial<Sandbox> = {}): Sandbox {
  return { root: "/work", allowWrite: true, allowBash: false, ...overrides };
}

type Browse = NonNullable<Props["serverBrowse"]>;

function browse(overrides: Partial<Browse> = {}): Browse {
  return { status: "loaded", path: "/", parent: null, entries: [], requestId: "r1", ...overrides };
}

function setup(overrides: Partial<Props> = {}) {
  const onUpdateConfig = vi.fn();
  const onBrowseServerPath = vi.fn();
  const onCloseServerBrowser = vi.fn();
  const props: Props = {
    extensionPaths: [],
    tools: [],
    commands: [],
    sandbox: sandbox(),
    userSkillPaths: [],
    serverBrowse: null,
    applyState: null,
    onBrowseServerPath,
    onCloseServerBrowser,
    onUpdateConfig,
    ...overrides,
  };
  const view = render(<SettingsMenu {...props} />);
  const rerenderWith = (next: Partial<Props>) => view.rerender(<SettingsMenu {...props} {...next} />);
  return { onUpdateConfig, onBrowseServerPath, onCloseServerBrowser, ...view, rerenderWith };
}

const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "Settings" }));
const field = (name: RegExp) => screen.getByRole("textbox", { name });
const check = (name: RegExp) => screen.getByRole("checkbox", { name });
const applyButton = () => screen.getByRole("button", { name: /Apply/ });

describe("SettingsMenu", () => {
  it("shows the effective tools and loaded skills", () => {
    setup({
      tools: [{ name: "present_structure", active: true }, { name: "bash", active: false }],
      commands: [{ name: "skill:structured-exchange", source: "skill" }],
    });
    openMenu();
    expect(screen.getByText("1 tools active · 1 inactive")).toBeInTheDocument();
    expect(screen.getByText("1 skills loaded")).toBeInTheDocument();
    fireEvent.click(screen.getByText("1 tools active · 1 inactive"));
    fireEvent.click(screen.getByText("1 skills loaded"));
    expect(screen.getByText("present_structure")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("bash")).toBeInTheDocument();
    expect(screen.getByText("inactive")).toBeInTheDocument();
    expect(screen.getByText("skill:structured-exchange")).toBeInTheDocument();
  });

  it("stays closed until asked", () => {
    setup();
    expect(screen.queryByRole("heading", { name: "Settings" })).not.toBeInTheDocument();
    openMenu();
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });

  it("closes when the pointer goes down outside", () => {
    setup();
    openMenu();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("heading", { name: "Settings" })).not.toBeInTheDocument();
  });

  describe("extensions", () => {
    it("says when none are loaded", () => {
      setup({ extensionPaths: [] });
      openMenu();
      expect(screen.getByText("No extensions loaded")).toBeInTheDocument();
    });

    it("lists the loaded ones", () => {
      setup({ extensionPaths: ["/ext/openlore", "/ext/omni"] });
      openMenu();
      expect(screen.getByText("/ext/openlore")).toBeInTheDocument();
      expect(screen.getByText("/ext/omni")).toBeInTheDocument();
    });
  });

  describe("the sandbox form", () => {
    it("says when there is no sandbox to configure, and still applies the rest", () => {
      const { onUpdateConfig } = setup({ sandbox: null, userSkillPaths: ["/mnt/skills"] });
      openMenu();
      expect(screen.getByText("No sandbox configured")).toBeInTheDocument();
      // A deployment with no sandbox still has skill paths worth changing.
      fireEvent.click(applyButton());
      expect(onUpdateConfig).toHaveBeenCalledWith({ userSkillPaths: ["/mnt/skills"] });
    });

    it("starts from the current configuration", () => {
      setup({ sandbox: sandbox({ root: "/work", writableRoot: "src", allowWrite: true, allowBash: true }) });
      openMenu();
      expect(field(/^Root/)).toHaveValue("/work");
      expect(field(/Writable root/)).toHaveValue("src");
      expect(check(/Allow write/)).toBeChecked();
      expect(check(/Allow bash/)).toBeChecked();
    });

    it("takes a fresh configuration when the server acknowledges one", () => {
      const { rerenderWith } = setup();
      openMenu();
      rerenderWith({ sandbox: sandbox({ root: "/elsewhere", allowBash: true }) });
      expect(field(/^Root/)).toHaveValue("/elsewhere");
      expect(check(/Allow bash/)).toBeChecked();
    });

    it("sends every field, since the server validates the whole payload", () => {
      const { onUpdateConfig } = setup();
      openMenu();
      fireEvent.change(field(/^Root/), { target: { value: "/new-root" } });
      fireEvent.click(check(/Allow bash/));
      fireEvent.click(applyButton());
      expect(onUpdateConfig).toHaveBeenCalledWith({
        sandbox: { root: "/new-root", allowWrite: true, allowBash: true, writableRoot: undefined },
        userSkillPaths: [],
      });
    });

    it("treats a blank writable root as absent rather than empty", () => {
      const { onUpdateConfig } = setup({ sandbox: sandbox({ writableRoot: "src" }) });
      openMenu();
      fireEvent.change(field(/Writable root/), { target: { value: "   " } });
      fireEvent.click(applyButton());
      expect(onUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({ sandbox: expect.objectContaining({ writableRoot: undefined }) }));
    });

    it("passes a writable root through when one is given", () => {
      const { onUpdateConfig } = setup();
      openMenu();
      fireEvent.change(field(/Writable root/), { target: { value: "src/app" } });
      fireEvent.click(applyButton());
      expect(onUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({ sandbox: expect.objectContaining({ writableRoot: "src/app" }) }));
    });

    it("stays open while the apply is in flight, and closes once it is acknowledged", () => {
      const { rerenderWith } = setup();
      openMenu();
      fireEvent.click(applyButton());
      rerenderWith({ applyState: { status: "applying" } });
      expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
      expect(applyButton()).toBeDisabled();

      // The acknowledgement only arrives once the server has persisted the change.
      rerenderWith({ applyState: null });
      expect(screen.queryByRole("heading", { name: "Settings" })).not.toBeInTheDocument();
    });

    it("refuses to apply without a root", () => {
      const { onUpdateConfig } = setup();
      openMenu();
      fireEvent.change(field(/^Root/), { target: { value: "  " } });
      expect(applyButton()).toBeDisabled();
      fireEvent.click(applyButton());
      expect(onUpdateConfig).not.toHaveBeenCalled();
    });
  });

  describe("locked fields", () => {
    it("disables what the server has locked, and says so", () => {
      setup({ sandbox: sandbox({ locks: { root: true, allowBash: true } }) });
      openMenu();
      expect(field(/^Root/)).toBeDisabled();
      expect(check(/Allow bash/)).toBeDisabled();
      // The others stay editable
      expect(field(/Writable root/)).toBeEnabled();
      expect(check(/Allow write/)).toBeEnabled();
    });

    it("still sends the locked values, which the server re-checks", () => {
      // Omitting them would fail the server's typeof validation on a missing boolean
      const { onUpdateConfig } = setup({ sandbox: sandbox({ locks: { root: true, allowBash: true }, allowBash: true }) });
      openMenu();
      fireEvent.click(applyButton());
      expect(onUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({ sandbox: expect.objectContaining({ root: "/work", allowBash: true }) }));
    });
  });

  describe("skill paths", () => {
    it("separates configured paths from the built-in inventory", () => {
      setup({
        userSkillPaths: ["/mnt/team-skills"],
        commands: [
          { name: "skill:structured-exchange", source: "skill" },
          { name: "skill:team", source: "skill" },
        ],
      });
      openMenu();
      // Built-ins are inventory: listed, never removable.
      fireEvent.click(screen.getByText("2 skills loaded"));
      expect(screen.getByText("skill:structured-exchange")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Remove skill:structured-exchange" })).not.toBeInTheDocument();
      // The configured path is the editable half.
      expect(screen.getByText("/mnt/team-skills")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Remove /mnt/team-skills" })).toBeInTheDocument();
    });

    it("shows only the user's own paths — the configuration file's are not its business", () => {
      setup({ userSkillPaths: ["/mnt/mine"], commands: [{ name: "skill:from-config", source: "skill" }] });
      openMenu();
      expect(screen.getByText("User skill paths")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Remove /mnt/mine" })).toBeInTheDocument();
      // Skills the configuration file brings in are inventory, not a path list.
      fireEvent.click(screen.getByText("1 skills loaded"));
      expect(screen.getByText("skill:from-config")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Remove skill:from-config/ })).not.toBeInTheDocument();
    });

    it("says when nothing extra is configured", () => {
      setup();
      openMenu();
      expect(screen.getByText("No skill directories added")).toBeInTheDocument();
    });

    it("adds a directory chosen from the server and reports it on apply", () => {
      const { onUpdateConfig, onBrowseServerPath, rerenderWith } = setup();
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Add directory…" }));
      expect(onBrowseServerPath).toHaveBeenCalledWith("/");

      rerenderWith({ serverBrowse: browse({ entries: [{ name: "mnt", path: "/mnt" }] }) });
      fireEvent.click(screen.getByRole("button", { name: "mnt/" }));
      expect(onBrowseServerPath).toHaveBeenLastCalledWith("/mnt");

      rerenderWith({
        serverBrowse: browse({ path: "/mnt", parent: "/", entries: [{ name: "skills", path: "/mnt/skills" }] }),
      });
      fireEvent.click(screen.getByRole("button", { name: "skills/" }));
      rerenderWith({ serverBrowse: browse({ path: "/mnt/skills", parent: "/mnt", entries: [] }) });
      fireEvent.click(screen.getByRole("button", { name: "Use this directory" }));

      expect(screen.getByText("/mnt/skills")).toBeInTheDocument();
      fireEvent.click(applyButton());
      expect(onUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({ userSkillPaths: ["/mnt/skills"] }));
    });

    it("removes a configured path", () => {
      const { onUpdateConfig } = setup({ userSkillPaths: ["/mnt/a", "/mnt/b"] });
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Remove /mnt/a" }));
      expect(screen.queryByText("/mnt/a")).not.toBeInTheDocument();
      fireEvent.click(applyButton());
      expect(onUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({ userSkillPaths: ["/mnt/b"] }));
    });

    it("does not add the same directory twice", () => {
      const { onUpdateConfig, rerenderWith } = setup({ userSkillPaths: ["/mnt/skills"] });
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Add directory…" }));
      rerenderWith({ serverBrowse: browse({ path: "/mnt/skills", parent: "/mnt" }) });
      fireEvent.click(screen.getByRole("button", { name: "Use this directory" }));
      fireEvent.click(applyButton());
      expect(onUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({ userSkillPaths: ["/mnt/skills"] }));
    });
  });

  describe("the server path picker", () => {
    it("browses from whatever the sandbox root already points at", () => {
      const { onBrowseServerPath } = setup({ sandbox: sandbox({ root: "/work" }) });
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Browse for sandbox root" }));
      expect(onBrowseServerPath).toHaveBeenCalledWith("/work");
    });

    it("puts the chosen directory in the field it was opened for", () => {
      const { rerenderWith } = setup();
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Browse for writable root" }));
      rerenderWith({ serverBrowse: browse({ path: "/work/scratch", parent: "/work" }) });
      fireEvent.click(screen.getByRole("button", { name: "Use this directory" }));
      expect(field(/Writable root/)).toHaveValue("/work/scratch");
      expect(screen.queryByTestId("server-path-picker")).not.toBeInTheDocument();
    });

    it("spells a Windows drive the way Windows does", () => {
      const { onBrowseServerPath, rerenderWith } = setup();
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Browse for sandbox root" }));
      // The server's virtual root on Windows: its entries are the drives.
      rerenderWith({ serverBrowse: browse({ path: "/", parent: null, entries: [{ name: "C:", path: "C:\\" }] }) });
      fireEvent.click(screen.getByRole("button", { name: "C:\\" }));
      expect(onBrowseServerPath).toHaveBeenLastCalledWith("C:\\");
    });

    it("walks back up through the parent", () => {
      const { onBrowseServerPath, rerenderWith } = setup();
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Browse for sandbox root" }));
      rerenderWith({ serverBrowse: browse({ path: "/mnt/skills", parent: "/mnt" }) });
      fireEvent.click(screen.getByRole("button", { name: "Up" }));
      expect(onBrowseServerPath).toHaveBeenLastCalledWith("/mnt");
    });

    it("shows a path it could not read, and changes no field", () => {
      const { onUpdateConfig, rerenderWith } = setup({ sandbox: sandbox({ root: "/work" }) });
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Browse for sandbox root" }));
      // The refused path is named in the error; the picker still stands on the
      // directory that did list, which is the only one selectable.
      rerenderWith({
        serverBrowse: browse({ status: "error", path: "/mnt", parent: "/", error: 'Cannot list "/private": permission denied' }),
      });
      expect(screen.getByRole("alert")).toHaveTextContent('Cannot list "/private": permission denied');
      expect(field(/^Root/)).toHaveValue("/work");
      // The current directory is a field now, not a caption: it says where "Up"
      // goes from, and a path can be typed straight into it.
      expect(screen.getByTestId("picker-path")).toHaveValue("/mnt");

      fireEvent.click(screen.getByRole("button", { name: "Use this directory" }));
      fireEvent.click(applyButton());
      expect(onUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({ sandbox: expect.objectContaining({ root: "/mnt" }) }));
    });

    it("gives up the listing when the picker is cancelled", () => {
      const { onCloseServerBrowser, rerenderWith } = setup();
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Browse for sandbox root" }));
      rerenderWith({ serverBrowse: browse() });
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByTestId("server-path-picker")).not.toBeInTheDocument();
      expect(onCloseServerBrowser).toHaveBeenCalled();
    });
  });

    it("browses to a path typed into the current-directory field", () => {
      const { onBrowseServerPath, rerenderWith } = setup({ sandbox: sandbox({ root: "/work" }) });
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Browse for sandbox root" }));
      rerenderWith({ serverBrowse: browse({ path: "/mnt", parent: "/" }) });

      // Typing the destination beats descending to it by mouse, and is the whole
      // reason the caption became a field.
      fireEvent.change(screen.getByTestId("picker-path"), { target: { value: "/srv/projects" } });
      fireEvent.click(screen.getByRole("button", { name: "Go" }));
      expect(onBrowseServerPath).toHaveBeenLastCalledWith("/srv/projects");
    });

  describe("a refused apply", () => {
    it("stays open, says why, and leaves the settings as the server still has them", () => {
      const { rerenderWith } = setup({ sandbox: sandbox({ root: "/work" }), userSkillPaths: ["/mnt/a"] });
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Remove /mnt/a" }));
      fireEvent.change(field(/^Root/), { target: { value: "/nowhere" } });
      fireEvent.click(applyButton());
      rerenderWith({ applyState: { status: "applying" } });
      rerenderWith({ applyState: { status: "error", message: "cannot save /etc/pi.json: does not exist" } });

      expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("cannot save /etc/pi.json: does not exist");
      expect(applyButton()).toBeEnabled();

      // The server kept its configuration, so the menu goes back to showing it.
      rerenderWith({ applyState: { status: "error", message: "cannot save" }, sandbox: sandbox({ root: "/work" }), userSkillPaths: ["/mnt/a"] });
      expect(field(/^Root/)).toHaveValue("/work");
      expect(screen.getByText("/mnt/a")).toBeInTheDocument();
    });
  });

  describe("versions", () => {
    it("shows them when the server reported them", () => {
      setup({ versions: { piOutpost: "0.6.7", piSdk: "1.2.3" } });
      openMenu();
      expect(screen.getByText("0.6.7")).toBeInTheDocument();
      expect(screen.getByText("1.2.3")).toBeInTheDocument();
    });

    /**
     * Under the RPC runtime the SDK version pi-outpost ships is not what answers
     * prompts — a fork at its own version is. Reading "pi SDK: 0.84.1" while
     * little-coder 0.83.0 does the work is a wrong answer, not a missing one.
     */
    it("names the harness, and not the SDK, when a child answers the prompts", () => {
      setup({ versions: { piOutpost: "0.6.7", agent: "little-coder 0.83.0" } });
      openMenu();
      expect(screen.getByText("little-coder 0.83.0")).toBeInTheDocument();
      // The bundled SDK still reads the session store under RPC, but a version a
      // reader takes for the agent's — and that is not — is worse than no line.
      expect(screen.queryByText(/pi SDK/)).not.toBeInTheDocument();
    });

    it("says nothing about a harness on the embedded runtime", () => {
      setup({ versions: { piOutpost: "0.6.7", piSdk: "1.2.3" } });
      openMenu();
      expect(screen.queryByText(/agent:/)).not.toBeInTheDocument();
    });

    it("omits the section when it has nothing to report", () => {
      setup({ versions: null });
      openMenu();
      expect(screen.queryByRole("heading", { name: /Versions/i })).not.toBeInTheDocument();
    });
  });
});
