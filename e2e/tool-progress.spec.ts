import { expect, test } from "@playwright/test";

async function prompt(page: import("@playwright/test").Page, text: string) {
  const composer = page.getByRole("textbox", { name: /message pi/i });
  await expect(composer).toBeEnabled();
  await composer.fill(text);
  await composer.press("Enter");
}

test("a running tool shows a determinate progress bar that advances and then clears", async ({ page }) => {
  await page.goto(process.env.PI_E2E_PROGRESS_URL!);
  await expect(page.getByTitle("connected")).toBeVisible();

  // The scripted RPC child runs a tool that reports a rising 0..1 fraction —
  // the offline stand-in for an extension tool calling onUpdate().
  await prompt(page, "run the demo");

  const bar = page.getByRole("progressbar");
  await expect(bar).toBeVisible();

  // It appears determinate and partway, not full.
  const first = await bar.evaluate((el) => (el as HTMLProgressElement).value);
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThan(1);

  // It advances to completion.
  await expect
    .poll(async () => bar.evaluate((el) => (el as HTMLProgressElement).value), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1);

  // And the tool ends: the bar is chrome for a running call, so it goes away.
  await expect(page.getByRole("progressbar")).toHaveCount(0);
});
