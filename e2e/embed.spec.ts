/**
 * The widget, mounted into a page that is not ours.
 *
 * Everything here is invisible to the unit suites by construction: jsdom has no
 * Shadow DOM worth the name, no cascade to isolate, and no separate origin. The
 * host page fights the widget on purpose — `* { color: red }`, `all: unset` on
 * every control, a `box-sizing` the reset disagrees with — because that is what
 * a design system does to anything it embeds.
 */
import { expect, test, type Page } from "@playwright/test";

/** The host page with the backend it should talk to. */
async function openHost(page: Page, options: { server?: string; theme?: string } = {}): Promise<void> {
  const url = new URL(process.env.PI_E2E_HOST_URL!);
  url.searchParams.set("server", options.server ?? process.env.PI_E2E_SERVER_URL!);
  if (options.theme !== undefined) url.searchParams.set("theme", options.theme);
  await page.goto(url.toString());
}

/** The backend whose session already holds a Mermaid diagram and a structured exchange. */
function withDiagrams(): { server: string } {
  return { server: process.env.PI_E2E_DIAGRAMS_URL! };
}

test.beforeEach(async ({ page }) => {
  // A named theme, so these tests do not read differently on a runner whose OS
  // prefers dark. The tests that are *about* where the theme comes from say so.
  await openHost(page, { theme: "light" });
});

test("mounts inside a shadow root and connects across origins", async ({ page }) => {
  // Playwright pierces shadow roots, so the widget's own controls are reachable
  await expect(page.getByRole("textbox", { name: /message pi/i })).toBeVisible();
  await expect(page.getByTitle("connected")).toBeVisible();

  const shape = await page.evaluate(() => {
    const shadow = document.querySelector("#widget")!.shadowRoot;
    return {
      open: shadow !== null,
      // The app is mounted under #root inside the shadow tree, not in the document
      rootInside: shadow?.querySelector("#root") !== null,
      rootInDocument: document.querySelector("#widget > #root") !== null,
    };
  });
  expect(shape).toEqual({ open: true, rootInside: true, rootInDocument: false });
});

test("carries its stylesheet as an adopted sheet, not a <style> element", async ({ page }) => {
  // Chrome drops <style> over ~512 KB inside a shadow root and Tailwind v4 is
  // ~1.5 MB, so the widget uses constructable sheets. Falling back silently
  // would leave it unstyled in exactly the browsers it targets.
  const sheets = await page.evaluate(() => {
    const shadow = document.querySelector("#widget")!.shadowRoot!;
    return {
      adopted: shadow.adoptedStyleSheets.length,
      rules: shadow.adoptedStyleSheets[0]?.cssRules.length ?? 0,
    };
  });
  expect(sheets.adopted).toBe(1);
  expect(sheets.rules).toBeGreaterThan(100);
});

test("the host page's styles do not reach into the widget", async ({ page }) => {
  const composer = page.getByRole("textbox", { name: /message pi/i });
  await expect(composer).toBeVisible();

  const colour = await composer.evaluate((element) => getComputedStyle(element).color);
  // The host paints every element red; the widget's text must not be
  expect(colour).not.toBe("rgb(255, 0, 0)");

  // `all: unset` on the host's controls would flatten the widget's buttons too
  const button = page.getByTitle("Show files");
  const background = await button.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(background).not.toBe("rgb(255, 0, 255)");
});

test("the widget's reset does not reach out into the host page", async ({ page }) => {
  // Tailwind's preflight sets margin: 0 on every element. Leaking out of the
  // shadow tree would silently restyle the page that embedded us.
  const host = await page.locator("#host-text").evaluate((element) => ({
    margin: getComputedStyle(element).marginTop,
    family: getComputedStyle(element).fontFamily,
  }));
  expect(host.margin).not.toBe("0px");
  expect(host.family).toContain("Comic Sans MS");
});

test("setTheme switches the widget without touching the host", async ({ page }) => {
  // The theme lands as data-theme on the container the host handed us — the
  // widget needs a cascade root, and it takes the one it was given rather than
  // document.documentElement, which would be the host page's.
  const readTheme = () =>
    page.evaluate(() => ({
      widget: (document.querySelector("#widget") as HTMLElement).dataset.theme ?? "",
      hostBackground: getComputedStyle(document.body).backgroundColor,
    }));

  const light = await readTheme();
  expect(light.widget).toBe("light");

  await page.evaluate(() => window.__embed.setTheme("dark"));
  await expect.poll(async () => (await readTheme()).widget).toBe("dark");

  // The host's own background is the host's business
  expect((await readTheme()).hostBackground).toBe(light.hostBackground);
});

test("unmount empties the shadow root and leaves the container", async ({ page }) => {
  await expect(page.getByRole("textbox", { name: /message pi/i })).toBeVisible();

  const after = await page.evaluate(() => {
    window.__embed.unmount();
    const container = document.querySelector("#widget");
    return {
      containerStillThere: container !== null,
      shadowChildren: container?.shadowRoot?.querySelector("#root")?.childElementCount ?? -1,
    };
  });
  expect(after.containerStillThere).toBe(true);
  expect(after.shadowChildren).toBe(0);
});

// openlore: {"domain":"embed","requirement":"ReachTheBackendFromAnotherOrigin","scenario":"NoConsoleErrorFromMounting","specFile":"openspec/changes/add-cors-for-allowed-origins/specs/embed/spec.md"}
test("mounting reports no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await openHost(page, { theme: "light" });
  await expect(page.getByTitle("connected")).toBeVisible();

  expect(errors).toEqual([]);
});

test("the branding request survives the origin the widget was mounted from", async ({ page }) => {
  // This was a recorded gap until the server learned to answer allowed origins
  // with CORS headers. It matters more than a header: the HTTP branding request
  // exists to arrive before the agent runtime has finished starting, and a widget
  // that gets branding only from the WebSocket's "hello" visibly restyles itself
  // in front of the user seconds after it appears.
  const response = await page.request.get(`${process.env.PI_E2E_SERVER_URL}/branding`, {
    headers: { Origin: process.env.PI_E2E_HOST_URL! },
  });
  expect(response.headers()["access-control-allow-origin"]).toBe(process.env.PI_E2E_HOST_URL);
});

// openlore: {"domain":"embed","requirement":"ReachTheBackendFromAnotherOrigin","scenario":"BrandingArrivesBeforeTheSession","specFile":"openspec/changes/add-cors-for-allowed-origins/specs/embed/spec.md"}
test.describe("BrandingArrivesBeforeTheSession", () => {
  test("paints HTTP branding before any session message, without painting the default first", async ({ context }) => {
    // The suite's shared page has already navigated in beforeEach. Use a fresh
    // page so interception and frame sampling precede this widget's first mount.
    const page = await context.newPage();
    // A mocked socket opens but never sends `hello`, so the only possible source
    // of branding is the cross-origin HTTP request.
    await page.routeWebSocket(/\/ws(?:\?|$)/, () => {});
    await page.addInitScript(() => {
      const tracked = window as Window & { __brandingFrames?: string[] };
      tracked.__brandingFrames = [];
      let previous = "";
      const sample = () => {
        const title = document.querySelector("#widget")?.shadowRoot?.querySelector("header span.text-lg")?.textContent?.trim();
        if (title && title !== previous) {
          tracked.__brandingFrames?.push(title);
          previous = title;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    await openHost(page, { theme: "light" });
    await expect(page.getByRole("banner").getByText("embed smoke")).toBeVisible();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

    const frames = await page.evaluate(
      () => (window as Window & { __brandingFrames?: string[] }).__brandingFrames ?? [],
    );
    expect(frames).toEqual(["embed smoke"]);
  });
});

test("a token-protected backend works across origins, preflight and all", async ({ page }) => {
  // The path no curl-shaped test reaches: `Authorization` is not safelisted, so
  // the browser sends a preflight of its own accord and refuses to send the real
  // request until it is answered. A server that handled only the simple case
  // would fail exactly the deployments that bothered to set a token.
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  const url = new URL(process.env.PI_E2E_HOST_URL!);
  url.searchParams.set("server", process.env.PI_E2E_GUARDED_URL!);
  url.searchParams.set("token", process.env.PI_E2E_TOKEN!);
  await page.goto(url.toString());

  await expect(page.getByTitle("connected")).toBeVisible();
  // Its own branding, so this is that server answering and not the other one
  await expect(page.getByRole("banner").getByText("guarded smoke")).toBeVisible();
  // No token screen: the host supplied it
  await expect(page.getByRole("textbox", { name: /message pi/i })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a workspace file is readable from the host page's origin", async ({ page }) => {
  // /files/raw is what an inline image in a message resolves to, and it is the
  // route the "every route" decision is really about — the one place workspace
  // content leaves the server. Fetched from the page so the browser applies its
  // own rules, which is the whole question; a request from the test runner would
  // answer a different one.
  const status = await page.evaluate(
    async ([base, token]) => {
      const res = await fetch(`${base}/files/raw?path=readme.md&token=${encodeURIComponent(token!)}`);
      return { ok: res.ok, text: (await res.text()).slice(0, 20) };
    },
    [process.env.PI_E2E_GUARDED_URL!, process.env.PI_E2E_TOKEN!],
  );

  expect(status.ok).toBe(true);
  expect(status.text).toContain("guarded workspace");
});

/**
 * Diagrams inside the widget.
 *
 * The suite could only ever assert the empty state before this: no transcript,
 * so no diagram, so no overlay, so nothing ever opened one inside a Shadow DOM.
 * The enlarge overlay portalled itself to `document.body`, which is the wrong
 * side of the shadow boundary — the widget's stylesheet is adopted by the shadow
 * root, and a node outside it is styled by nothing at all. Measured in the
 * browser, that overlay came out `position: static`, `z-index: auto`,
 * transparent, and stacked below the widget with half of it off-screen.
 */
test.describe("diagrams in the widget", () => {
  /** Reads the overlay wherever it ended up, and says which tree that was. */
  const readOverlay = (page: Page, testId: string) =>
    page.evaluate((id) => {
      const shadow = document.querySelector("#widget")!.shadowRoot!;
      const inShadow = shadow.querySelector(`[data-testid="${id}"]`);
      const overlay = inShadow ?? document.querySelector(`[data-testid="${id}"]`);
      if (!overlay) return null;
      const style = getComputedStyle(overlay);
      const box = overlay.getBoundingClientRect();
      const widget = document.querySelector("#widget")!.getBoundingClientRect();
      return {
        tree: inShadow ? "shadow" : "document",
        position: style.position,
        zIndex: style.zIndex,
        transparent: style.backgroundColor === "rgba(0, 0, 0, 0)",
        // Covering the viewport is the whole job; below the widget is the bug.
        coversViewport: box.top <= widget.top && box.height >= innerHeight - 1,
      };
    }, testId);

  test("the structured exchange enlarges over the widget, not under it", async ({ page }) => {
    await openHost(page, { ...withDiagrams(), theme: "light" });
    await expect(page.getByTitle("connected")).toBeVisible();

    // The card opens expanded, so the enlarge control is already there. Named by
    // its aria-label: the Mermaid diagram above it is captioned "⤢ enlarge" too.
    await page.getByRole("button", { name: /Show graph view at full size/ }).first().click();

    const overlay = await readOverlay(page, "structured-enlarged");
    expect(overlay).toEqual({
      // Portalled into the shadow root: the outermost point that is still styled
      tree: "shadow",
      position: "fixed",
      zIndex: "100",
      transparent: false,
      coversViewport: true,
    });
  });

  test("a Mermaid diagram can be enlarged too", async ({ page }) => {
    await openHost(page, { ...withDiagrams(), theme: "light" });
    await expect(page.getByTitle("connected")).toBeVisible();

    // Rendering is debounced, and the control only exists once there is an SVG
    const diagram = page.locator("#widget").locator("svg[id^='mermaid-']").first();
    await expect(diagram).toBeVisible();

    const inlineWidth = (await diagram.boundingBox())!.width;

    await page.getByRole("button", { name: /Show diagram at full size/ }).click();

    await expect(page.getByRole("dialog", { name: /diagram, full size/i })).toBeVisible();
    expect(await readOverlay(page, "mermaid-enlarged")).toEqual({
      tree: "shadow",
      position: "fixed",
      zIndex: "100",
      transparent: false,
      coversViewport: true,
    });

    // Bigger, which is the entire point. Mermaid writes width="100%" and no
    // intrinsic size, so an overlay that shrink-wraps its content renders the
    // diagram *smaller* than the chat column it was supposed to escape.
    const enlargedWidth = await page.evaluate(() => {
      const shadow = document.querySelector("#widget")!.shadowRoot!;
      const overlay = shadow.querySelector('[data-testid="mermaid-enlarged"]')!;
      return overlay.querySelector("svg")!.getBoundingClientRect().width;
    });
    expect(enlargedWidth).toBeGreaterThanOrEqual(inlineWidth);
  });

  test("Escape closes an overlay opened inside the widget", async ({ page }) => {
    await openHost(page, { ...withDiagrams(), theme: "light" });
    await expect(page.getByTitle("connected")).toBeVisible();

    await page.getByRole("button", { name: /Show graph view at full size/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

/**
 * Where the theme comes from when the host does not set it on every mount.
 *
 * Both cases below were unreachable while the host page named a theme in its
 * own source: `branding.defaultTheme` was never consulted, and a stored pick
 * could quietly outrank the host's option with nothing to catch it.
 */
test.describe("the theme a deployment configured", () => {
  test("a host that names no theme gets the server's branding.defaultTheme", async ({ page }) => {
    await openHost(page, withDiagrams());
    await expect(page.getByTitle("connected")).toBeVisible();

    await expect
      .poll(() => page.evaluate(() => (document.querySelector("#widget") as HTMLElement).dataset.theme))
      .toBe("light");
  });

  test("the theme the host asked for at mount beats one this browser remembered", async ({ page }) => {
    // A visitor who once clicked ☾ on this origin. Before, that single click
    // outranked `mount(el, { theme: "light" })` for good: the host could not
    // give its widget the theme its own page was designed around.
    await openHost(page, withDiagrams());
    await page.evaluate(() => localStorage.setItem("pi-outpost:theme", "dark"));

    await openHost(page, { ...withDiagrams(), theme: "light" });
    await expect(page.getByTitle("connected")).toBeVisible();

    await expect
      .poll(() => page.evaluate(() => (document.querySelector("#widget") as HTMLElement).dataset.theme))
      .toBe("light");
    // Still remembered, so the reader's own pick survives a host that says nothing
    expect(await page.evaluate(() => localStorage.getItem("pi-outpost:theme"))).toBe("dark");
  });

  test("a stored pick still wins over branding when the host names nothing", async ({ page }) => {
    await openHost(page, withDiagrams());
    await page.evaluate(() => localStorage.setItem("pi-outpost:theme", "dark"));

    await openHost(page, withDiagrams());
    await expect(page.getByTitle("connected")).toBeVisible();

    await expect
      .poll(() => page.evaluate(() => (document.querySelector("#widget") as HTMLElement).dataset.theme))
      .toBe("dark");
  });
});

/**
 * Containers, in the widget rather than in jsdom.
 *
 * The unit suites can assert the geometry; only the browser can say that the
 * boxes are actually drawn behind a real layout, at a real size, inside the
 * shadow root — and that a container's header spans the columns it should after
 * the view has reordered them.
 */
test.describe("containers in a structured exchange", () => {
  const openTranscript = async (page: Page) => {
    await openHost(page, { ...withDiagrams(), theme: "light" });
    await expect(page.getByTitle("connected")).toBeVisible();
  };

  test("draws every declared container, including the one nothing joins", async ({ page }) => {
    await openTranscript(page);

    const drawn = await page.evaluate(() => {
      const shadow = document.querySelector("#widget")!.shadowRoot!;
      return [...shadow.querySelectorAll("[data-container]")].map((g) => g.getAttribute("data-container"));
    });

    // Graph: three, one of them empty. Sequence: two, after reordering.
    expect(drawn).toEqual(["electrical", "control", "hydraulic", "electrical", "control"]);
    await expect(page.getByText("Hydraulic system").first()).toBeVisible();
  });

  test("lays a graph's members inside their own enclosure", async ({ page }) => {
    await openTranscript(page);

    const placement = await page.evaluate(() => {
      const shadow = document.querySelector("#widget")!.shadowRoot!;
      const svg = [...shadow.querySelectorAll('svg[aria-label^="Graph"]')].find(
        (candidate) => candidate.querySelector("[data-container]") !== null,
      )!;
      const boxOf = (selector: string) => {
        const rect = svg.querySelector(selector)!.querySelector("rect")!;
        const read = (name: string) => Number(rect.getAttribute(name));
        return { x: read("x"), y: read("y"), width: read("width"), height: read("height") };
      };
      const within = (inner: ReturnType<typeof boxOf>, outer: ReturnType<typeof boxOf>) =>
        inner.x >= outer.x &&
        inner.y >= outer.y &&
        inner.x + inner.width <= outer.x + outer.width &&
        inner.y + inner.height <= outer.y + outer.height;
      const electrical = boxOf('[data-container="electrical"]');
      return {
        battery: within(boxOf('[data-element-id="battery"]'), electrical),
        alternator: within(boxOf('[data-element-id="alternator"]'), electrical),
        driverIsOutside: !within(boxOf('[data-element-id="driver"]'), electrical),
      };
    });

    expect(placement).toEqual({ battery: true, alternator: true, driverIsOutside: true });
  });

  test("orders sequence columns so each container gets one header", async ({ page }) => {
    await openTranscript(page);

    const sequence = await page.evaluate(() => {
      const shadow = document.querySelector("#widget")!.shadowRoot!;
      const svg = shadow.querySelector('svg[aria-label^="Sequence"]')!;
      const columns = [...svg.querySelectorAll("[data-element-id]")]
        .map((g) => ({ id: g.getAttribute("data-element-id"), x: Number(g.querySelector("rect")!.getAttribute("x")) }))
        .sort((a, b) => a.x - b.x)
        .map((column) => column.id);
      const headers = [...svg.querySelectorAll("[data-container]")].map((g) => {
        const rect = g.querySelector("rect")!;
        return {
          id: g.getAttribute("data-container"),
          x: Number(rect.getAttribute("x")),
          right: Number(rect.getAttribute("x")) + Number(rect.getAttribute("width")),
        };
      });
      return { columns, headers };
    });

    // Declared battery(E), ecu(C), alternator(E), dash(C) — drawn regrouped
    expect(sequence.columns).toEqual(["battery", "alternator", "ecu", "dash"]);
    expect(sequence.headers.map((header) => header.id)).toEqual(["electrical", "control"]);
    // The electrical header sits entirely left of the control one: they span
    // adjacent, non-overlapping runs of columns.
    expect(sequence.headers[0]!.right).toBeLessThanOrEqual(sequence.headers[1]!.x);
  });

  test("a diagram with containers still enlarges into the shadow root", async ({ page }) => {
    await openTranscript(page);

    await page
      .locator("#widget")
      .getByRole("button", { name: /Show graph view at full size/ })
      .nth(1)
      .click();

    const overlay = await page.evaluate(() => {
      const shadow = document.querySelector("#widget")!.shadowRoot!;
      const dialog = shadow.querySelector('[data-testid="structured-enlarged"]');
      if (!dialog) return null;
      return {
        position: getComputedStyle(dialog).position,
        containers: dialog.querySelectorAll("[data-container]").length,
      };
    });

    expect(overlay).toEqual({ position: "fixed", containers: 3 });
  });
});
