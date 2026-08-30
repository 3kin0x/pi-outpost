import { expect, test } from "@playwright/test";

test("the thinking slider offers only the levels the model accepts, in order, with no gap stop", async ({ page }) => {
  await page.goto(process.env.PI_E2E_THINKING_URL!);
  await expect(page.getByTitle("connected")).toBeVisible();

  // The scripted model accepts low, medium and xhigh — no `high`.
  const button = page.getByTitle("thinking level");
  await button.click();

  const slider = page.getByLabel("Thinking level");
  await expect(slider).toBeVisible();

  // Four stops: off, low, medium, xhigh — not the global six, and no `high`.
  await expect(slider).toHaveAttribute("max", "3");

  // Each stop maps to the level it should, and the last one — xhigh — is reached
  // without ever landing on `high`, and it sticks (no snap-back).
  for (const [pos, level] of [["0", "off"], ["1", "low"], ["2", "medium"], ["3", "xhigh"]] as const) {
    await slider.fill(pos);
    await expect(button).toHaveText(new RegExp(`\\b${level}\\b`));
  }
});

test("a model that accepts every level still shows all six stops", async ({ page }) => {
  await page.goto(process.env.PI_E2E_SERVER_URL!);
  await expect(page.getByTitle("connected")).toBeVisible();
  const button = page.getByTitle("thinking level");
  if ((await button.count()) === 0) {
    test.skip(true, "the primary e2e model does not reason");
    return;
  }
  await button.click();
  await expect(page.getByLabel("Thinking level")).toHaveAttribute("max", "5");
});
