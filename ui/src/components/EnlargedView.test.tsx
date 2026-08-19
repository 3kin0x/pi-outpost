import { describe, expect, it } from "vitest";
import { overlayHost } from "./EnlargedView";

/**
 * Where the overlay is portalled, which decides what it inherits.
 *
 * jsdom has no cascade, so these tests pin the target rather than the colour;
 * the colour itself is asserted in the browser, against a host page that paints
 * everything red. Both matter: the rule here is what the code decides, and the
 * browser test is whether that decision was the right one.
 */
describe("overlayHost", () => {
  it("stays inside the app's own root when the app lives in a shadow tree", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const shadow = container.attachShadow({ mode: "open" });
    const appRoot = document.createElement("div");
    const transcript = document.createElement("div");
    const diagram = document.createElement("svg");
    transcript.appendChild(diagram);
    appRoot.appendChild(transcript);
    shadow.appendChild(appRoot);

    // Not the shadow root: that is a sibling position, outside everything the
    // app declares for itself, so the overlay would inherit from the host page.
    expect(overlayHost(diagram)).toBe(appRoot);
    expect(overlayHost(diagram)).not.toBe(shadow);
    container.remove();
  });

  it("takes the root element even when the anchor is that element", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const shadow = container.attachShadow({ mode: "open" });
    const appRoot = document.createElement("div");
    shadow.appendChild(appRoot);

    expect(overlayHost(appRoot)).toBe(appRoot);
    container.remove();
  });

  it("uses the document body in the standalone app", () => {
    const anchor = document.createElement("div");
    document.body.appendChild(anchor);

    expect(overlayHost(anchor)).toBe(document.body);
    anchor.remove();
  });

  it("answers undefined for an anchor that is not mounted, rather than guessing", () => {
    // The caller keeps its last real answer. Falling back to the document here
    // is how the overlay silently left the shadow tree between renders.
    expect(overlayHost(null)).toBeUndefined();
    expect(overlayHost(undefined)).toBeUndefined();
  });
});
