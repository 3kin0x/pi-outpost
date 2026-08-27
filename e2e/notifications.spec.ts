import { expect, test } from "@playwright/test";

/**
 * An extension toast is an overlay: it sits at the top right, over the Work Plan
 * panel, above everything. That is affordable only because it leaves on its own.
 *
 * It did not. The six-second timer was keyed on the dismiss callback, which the
 * app rebuilds on every render, so each render tore the timer down and started a
 * new one — and a session that renders more often than once every six seconds
 * (any answer, any plan update, any click) kept the toast alive indefinitely,
 * parked on top of the plan it was covering.
 *
 * Timers under render pressure are exactly the class of bug a unit test agrees
 * with and a browser refutes, so this runs against the real app.
 */
test("an extension toast leaves the Work Plan alone again", async ({ page }) => {
  await page.goto(process.env.PI_E2E_NOTIFY_URL!);
  await expect(page.getByTitle("connected")).toBeVisible();

  const composer = page.getByRole("textbox", { name: /message pi/i });
  await expect(composer).toBeEnabled();
  await composer.fill("Format the workspace");
  await composer.press("Enter");

  const panel = page.getByRole("complementary", { name: "Work Plan" });
  await expect(panel).toBeVisible();
  const toast = page.getByRole("status").filter({ hasText: "pi-Lens deferred format applied" });
  await expect(toast).toBeVisible();

  // Why any of this matters: the toast really does land on the panel.
  const overlay = await toast.boundingBox();
  const plan = await panel.boundingBox();
  expect(overlay).not.toBeNull();
  expect(plan).not.toBeNull();
  expect(overlay!.x < plan!.x + plan!.width && plan!.x < overlay!.x + overlay!.width).toBe(true);
  expect(overlay!.y < plan!.y + plan!.height && plan!.y < overlay!.y + overlay!.height).toBe(true);

  // The escape hatch, first: a reader who does not want to wait can close it.
  await toast.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(toast).toHaveCount(0);

  // And now the timer itself, under the render pressure that used to freeze it.
  // The sidebar toggle is app-level state well clear of the toast, so every
  // iteration re-renders the tree the toast hangs from without clicking through
  // the overlay under test.
  await composer.fill("Format the workspace again");
  await composer.press("Enter");
  await expect(toast).toBeVisible();

  const sessions = page.getByRole("button", { name: "sessions" });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && (await toast.count()) > 0) {
    await sessions.click();
    await sessions.click();
    await page.waitForTimeout(150);
  }
  // Read once, with no retry. A polling assertion passes on the broken build
  // too: the loop stops, the app goes quiet, the last timer anyone started runs
  // out six seconds later and the toast finally goes. What is under test is that
  // it left *while* the renders were coming.
  expect(await toast.count(), "the toast was still up after 8s of re-renders").toBe(0);
});
