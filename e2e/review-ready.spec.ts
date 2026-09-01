import { expect, test } from "@playwright/test";

test("review-ready workspaces remain visible and content-isolated across real switches", async ({ page }) => {
  await page.goto(process.env.PI_E2E_REVIEW_READY_URL!);
  await expect(page.getByTitle("connected")).toBeVisible();

  const selector = page.getByTitle(/^Project:/);
  await expect(selector).toHaveAttribute("title", /ready for review/);
  await expect(selector).toContainText("1");

  await selector.click();
  await page.getByRole("menuitem").filter({ hasText: process.env.PI_E2E_REVIEW_READY_SECOND! }).click();
  await expect(selector).toHaveAttribute("title", /ready for review/);
  await expect(selector).toContainText("2");

  await selector.click();
  let menu = page.getByRole("menu");
  await expect(menu.getByText("ready for review")).toHaveCount(2);
  await expect(menu).not.toContainText("Private launch details");
  await expect(menu).not.toContainText("Private customer result");
  await expect(menu).not.toContainText("Private secondary launch details");
  await expect(menu).not.toContainText("Private secondary customer result");

  await menu.getByRole("menuitem").filter({ hasText: process.env.PI_E2E_REVIEW_READY_PRIMARY! }).click();
  await expect(selector).toHaveAttribute("title", /ready for review/);

  await selector.click();
  menu = page.getByRole("menu");
  await expect(menu.getByText("ready for review")).toHaveCount(2);
  await expect(selector).toContainText("2");
});
