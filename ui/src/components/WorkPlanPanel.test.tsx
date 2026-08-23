import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkPlan } from "@pi-outpost/shared";
import { WorkPlanPanel } from "./WorkPlanPanel";

const plan: WorkPlan = {
  version: 1,
  id: "release",
  title: "Ship the feature",
  updatedAt: "2026-08-23T00:00:00.000Z",
  tasks: [
    { id: "analyse", title: "Analyse impact", status: "done", dependsOn: [], resources: [] },
    { id: "build", title: "Build UI", description: "Keep the plan readable.", status: "in_progress", dependsOn: ["analyse"], resources: [{ uri: "workspace:ui/src/App.tsx", label: "App" }] },
    { id: "review", title: "Review output", status: "needs_review", parentId: "build", dependsOn: ["build"], resources: [{ uri: "model:SYS-421", label: "SYS-421" }], statusReason: "Needs human acceptance" },
    { id: "blocked", title: "Publish", status: "blocked", dependsOn: ["review"], resources: [], statusReason: "Credentials unavailable" },
  ],
};

describe("WorkPlanPanel", () => {
  it("shows hierarchy, distinct states, focus, and aggregate progress", () => {
    render(<WorkPlanPanel plan={plan} open onToggle={() => {}} onOpenWorkspace={() => {}} />);
    expect(screen.getByText("Progress: 1 / 4")).toBeTruthy();
    expect(screen.getByLabelText("In progress").closest("button")?.getAttribute("aria-current")).toBe("step");
    expect(screen.getByLabelText("Done")).toBeTruthy();
    expect(screen.getByLabelText("Needs review")).toBeTruthy();
    expect(screen.getByLabelText("Blocked")).toBeTruthy();
  });

  it("inspects details and navigates known workspace resources", () => {
    const onOpenWorkspace = vi.fn();
    render(<WorkPlanPanel plan={plan} open onToggle={() => {}} onOpenWorkspace={onOpenWorkspace} />);
    fireEvent.click(screen.getByRole("button", { name: /Build UI/ }));
    expect(screen.getByText("Keep the plan readable.")).toBeTruthy();
    expect(screen.getByLabelText("Task details").textContent).toContain("Depends on: Analyse impact");
    fireEvent.click(screen.getByRole("button", { name: "App" }));
    expect(onOpenWorkspace).toHaveBeenCalledWith("ui/src/App.tsx");
  });

  it("keeps an unresolved generic resource visible but not clickable", () => {
    render(<WorkPlanPanel plan={plan} open onToggle={() => {}} onOpenWorkspace={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Review output/ }));
    expect(screen.getByText("Needs human acceptance")).toBeTruthy();
    expect(screen.getByText("SYS-421").tagName).toBe("SPAN");
    fireEvent.click(screen.getByRole("button", { name: /Publish/ }));
    expect(screen.getByText("Credentials unavailable")).toBeTruthy();
  });

  it("collapses to a readily accessible progress control", () => {
    const onToggle = vi.fn();
    render(<WorkPlanPanel plan={plan} open={false} onToggle={onToggle} onOpenWorkspace={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Work Plan" }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
