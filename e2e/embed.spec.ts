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
async function openHost(page: Page): Promise<void> {
  const url = new URL(process.env.PI_E2E_HOST_URL!);
  url.searchParams.set("server", process.env.PI_E2E_SERVER_URL!);
  await page.goto(url.toString());
}

test.beforeEach(async ({ page }) => {
  await openHost(page);
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

test("mounting reports no console error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await openHost(page);
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

test("the widget shows the server's branding, not the defaults", async ({ page }) => {
  // The outcome the header exists for. Asserted through the interface rather
  // than the response, because that is where the flash would have been visible.
  await expect(page.getByRole("banner").getByText("embed smoke")).toBeVisible();
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
