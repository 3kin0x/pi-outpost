/**
 * Adding an extension from the interface, in a real browser against a real server.
 *
 * The component tests drive `SettingsMenu` in jsdom with the callbacks mocked, so they
 * prove the menu reports what the user asked for. They cannot see whether the server
 * then loads anything: that needs the socket, the persistence, the session rebuild and
 * the extension actually running. What is asserted here is the end of that chain — a
 * command the extension registers, appearing in the composer where the user would find
 * it — because a control that looks right and loads nothing is the failure this whole
 * change would otherwise ship.
 */
import { expect, test } from "@playwright/test";

const EXTENSIONS_DIR = process.env.PI_E2E_EXTENSIONS_DIR!;

const settingsButton = "Settings";

test("an extension directory added through Settings is loaded, then can be taken back", async ({ page }) => {
  await page.goto(process.env.PI_E2E_SERVER_URL!);
  await expect(page.getByTitle("connected")).toBeVisible();

  await page.getByRole("button", { name: settingsButton }).click();
  await expect(page.getByText("No extension directories added")).toBeVisible();

  await page.getByRole("button", { name: "Add extensions directory…" }).click();
  // The warning is part of the act, not a caption: it is on screen before the path is.
  await expect(page.getByTestId("extension-warning")).toContainText(/agent's privileges/i);

  // Typed rather than walked: the picker browses the server's filesystem, and the
  // fixture sits in a temporary directory nobody wants to descend into by hand.
  await page.getByTestId("picker-path").fill(EXTENSIONS_DIR);
  await page.getByRole("button", { name: "Go" }).click();
  await page.getByRole("button", { name: "Use this directory" }).click();
  await expect(page.getByTitle(EXTENSIONS_DIR)).toBeVisible();

  await page.getByRole("button", { name: /Apply/ }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeHidden();

  // The inventory now reports it, from the server rather than from the draft list:
  // one counted summary, closed, holding the file the SDK discovered in the directory.
  await page.getByRole("button", { name: settingsButton }).click();
  const loaded = page.getByTestId("extensions-loaded");
  await expect(loaded).toBeVisible();
  await expect(page.getByText("1 extension loaded")).toBeVisible();
  await loaded.getByText("1 extension loaded").click();
  // The directory as configured, which is what the runtime reports loading — the
  // file inside it is the SDK's business, and naming it here would tie this test to
  // discovery rules it does not own.
  await expect(loaded.getByText(EXTENSIONS_DIR, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  // The end of the chain: the extension ran and registered its command, so the
  // composer offers it. Nothing short of a real session rebuild produces this.
  const composer = page.getByRole("textbox", { name: /message pi/i });
  await composer.click();
  await composer.fill("/e2e-added");
  await expect(page.getByText("Added through Settings")).toBeVisible();
  await composer.fill("");
  await page.keyboard.press("Escape");

  // And taking it back rebuilds a session without it. The menu closes itself on a
  // successful apply, so wait for that before reopening: clicking Settings while the
  // acknowledgement is still in flight opens a menu the ack then closes again.
  await page.getByRole("button", { name: settingsButton }).click();
  await page.getByRole("button", { name: `Remove ${EXTENSIONS_DIR}` }).click();
  await page.getByRole("button", { name: /Apply/ }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeHidden();

  await page.getByRole("button", { name: settingsButton }).click();
  await expect(page.getByText("No extension directories added")).toBeVisible();
});

test("a deployment that locks extension paths offers no way to change them", async ({ page }) => {
  await page.goto(process.env.PI_E2E_EXTENSIONS_LOCKED_URL!);
  await expect(page.getByTitle("connected")).toBeVisible();

  await page.getByRole("button", { name: settingsButton }).click();
  await expect(page.getByTestId("extensions-locked")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add extensions directory…" })).toHaveCount(0);
  // Still says what is loaded: the lock is about changing them, not about hiding them.
  await expect(page.getByTestId("extensions-loaded")).toBeVisible();
  await expect(page.getByText(/extension loaded/)).toBeVisible();
});
