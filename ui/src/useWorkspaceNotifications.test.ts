/**
 * The three levels of raising attention from a background project — and the
 * third one is a prohibition. See the hook's own header, and the spec's
 * RaiseAttentionFromABackgroundWorkspace.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { WorkspaceInfo } from "@pi-outpost/shared";
import { useWorkspaceNotifications } from "./useWorkspaceNotifications";

const raised: { title: string; options?: NotificationOptions }[] = [];

class FakeNotification {
  static permission: NotificationPermission = "granted";
  constructor(title: string, options?: NotificationOptions) {
    raised.push({ title, options });
  }
}

function workspace(overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
  return { root: "/srv/alpha", name: "alpha", activity: "idle", needsAttention: false, ...overrides };
}

/** The document's attention, which is what separates a badge from a notification. */
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

beforeEach(() => {
  raised.length = 0;
  FakeNotification.permission = "granted";
  vi.stubGlobal("Notification", FakeNotification);
  setVisibility("hidden");
});

afterEach(() => {
  vi.unstubAllGlobals();
  setVisibility("visible");
});

describe("raising attention from a workspace nobody is watching", () => {
  it("stays silent while the document is in the foreground", () => {
    setVisibility("visible");
    renderHook(() =>
      useWorkspaceNotifications([workspace({ root: "/srv/beta", name: "beta", activity: "waiting", needsAttention: true })], "/srv/alpha"),
    );

    // The selector's badge is the whole of it: interrupting someone who is
    // looking at the app is the level this design refuses.
    expect(raised).toHaveLength(0);
  });

  it("names each waiting project when two ask at once", () => {
    renderHook(() =>
      useWorkspaceNotifications(
        [
          workspace({ root: "/srv/beta", name: "beta", activity: "waiting", needsAttention: true }),
          workspace({ root: "/srv/gamma", name: "gamma", activity: "waiting", needsAttention: true }),
        ],
        "/srv/alpha",
      ),
    );

    // A coalesced "2 projects need you" cannot be acted on — it does not say
    // where to click.
    expect(raised.map((n) => n.title)).toEqual(["beta needs you", "gamma needs you"]);
    expect(raised.map((n) => n.options?.tag)).toEqual(["pi-outpost:/srv/beta", "pi-outpost:/srv/gamma"]);
  });

  it("says nothing about the project the user is already looking at", () => {
    renderHook(() =>
      useWorkspaceNotifications([workspace({ activity: "waiting", needsAttention: true })], "/srv/alpha"),
    );

    expect(raised).toHaveLength(0);
  });

  it("raises one notification per blocked turn, not one per render", () => {
    const waiting = [workspace({ root: "/srv/beta", name: "beta", activity: "waiting", needsAttention: true })];
    const { rerender } = renderHook(({ list }) => useWorkspaceNotifications(list, "/srv/alpha"), {
      initialProps: { list: waiting },
    });

    rerender({ list: [...waiting] });
    expect(raised).toHaveLength(1);

    // Answered, then asked again: the second question is not swallowed as a
    // duplicate of the first.
    rerender({ list: [workspace({ root: "/srv/beta", name: "beta", activity: "working" })] });
    rerender({ list: [...waiting] });
    expect(raised).toHaveLength(2);
  });

  it("never asks for permission on its own", () => {
    FakeNotification.permission = "default";
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", Object.assign(FakeNotification, { requestPermission }));

    renderHook(() =>
      useWorkspaceNotifications([workspace({ root: "/srv/beta", name: "beta", activity: "waiting", needsAttention: true })], "/srv/alpha"),
    );

    expect(requestPermission).not.toHaveBeenCalled();
    expect(raised).toHaveLength(0);
  });
});
