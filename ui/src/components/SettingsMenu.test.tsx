import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsMenu } from "./SettingsMenu";

type Props = React.ComponentProps<typeof SettingsMenu>;
type Sandbox = NonNullable<Props["sandbox"]>;

function sandbox(overrides: Partial<Sandbox> = {}): Sandbox {
  return { root: "/work", allowWrite: true, allowBash: false, ...overrides };
}

function setup(overrides: Partial<Props> = {}) {
  const onUpdateConfig = vi.fn();
  const props: Props = { extensionPaths: [], tools: [], commands: [], sandbox: sandbox(), onUpdateConfig, ...overrides };
  const view = render(<SettingsMenu {...props} />);
  const rerenderWith = (next: Partial<Props>) => view.rerender(<SettingsMenu {...props} {...next} />);
  return { onUpdateConfig, ...view, rerenderWith };
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
    it("says when there is no sandbox to configure", () => {
      setup({ sandbox: null });
      openMenu();
      expect(screen.getByText("No sandbox configured")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Apply/ })).not.toBeInTheDocument();
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
        root: "/new-root",
        allowWrite: true,
        allowBash: true,
        writableRoot: undefined,
      });
    });

    it("treats a blank writable root as absent rather than empty", () => {
      const { onUpdateConfig } = setup({ sandbox: sandbox({ writableRoot: "src" }) });
      openMenu();
      fireEvent.change(field(/Writable root/), { target: { value: "   " } });
      fireEvent.click(applyButton());
      expect(onUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({ writableRoot: undefined }));
    });

    it("passes a writable root through when one is given", () => {
      const { onUpdateConfig } = setup();
      openMenu();
      fireEvent.change(field(/Writable root/), { target: { value: "src/app" } });
      fireEvent.click(applyButton());
      expect(onUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({ writableRoot: "src/app" }));
    });

    it("closes after applying", () => {
      setup();
      openMenu();
      fireEvent.click(applyButton());
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
      expect(onUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({ root: "/work", allowBash: true }));
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
