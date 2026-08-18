import { describe, expect, it } from "vitest";
import { eventHitsNode } from "./clickOutside";

/**
 * The widget lives in a shadow root, so a `document`-level listener never sees
 * the element that was pressed — only the host. Every menu here dismisses on an
 * outside click, and mousedown runs before click: read the retargeted target and
 * the menu closes under the very click meant to pick something from it.
 */
describe("eventHitsNode", () => {
  it("reads a press on a menu item as inside, even across a shadow boundary", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const menu = document.createElement("div");
    const item = document.createElement("button");
    menu.appendChild(item);
    shadow.appendChild(menu);

    let seenByDocument: Node | null = null;
    let hit: boolean | null = null;
    document.addEventListener("mousedown", (event) => {
      seenByDocument = event.target as Node;
      hit = eventHitsNode(event, menu);
    });
    item.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true }));

    expect(seenByDocument).toBe(host); // retargeted: this is what broke the menus
    expect(hit).toBe(true);
    host.remove();
  });

  it("still reads a press elsewhere in the host page as outside", () => {
    const host = document.createElement("div");
    const menu = document.createElement("div");
    host.attachShadow({ mode: "open" }).appendChild(menu);
    const elsewhere = document.createElement("button");
    document.body.append(host, elsewhere);

    let hit: boolean | null = null;
    document.addEventListener("mousedown", (event) => {
      hit = eventHitsNode(event, menu);
    });
    elsewhere.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true }));

    expect(hit).toBe(false);
    host.remove();
    elsewhere.remove();
  });

  it("answers the plain question in a plain tree", () => {
    const menu = document.createElement("div");
    const item = document.createElement("button");
    menu.appendChild(item);
    document.body.appendChild(menu);

    let inside: boolean | null = null;
    let outside: boolean | null = null;
    document.addEventListener("mousedown", (event) => {
      if (event.target === item) inside = eventHitsNode(event, menu);
      else outside = eventHitsNode(event, menu);
    });
    item.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(inside).toBe(true);
    expect(outside).toBe(false);
    menu.remove();
  });

  it("hits nothing when the menu is not mounted", () => {
    let hit: boolean | null = null;
    document.addEventListener("mousedown", (event) => {
      hit = eventHitsNode(event, null);
    });
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(hit).toBe(false);
  });
});
