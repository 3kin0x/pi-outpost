import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

async function prompt(page: import("@playwright/test").Page, text: string) {
  const composer = page.getByRole("textbox", { name: /message pi/i });
  await expect(composer).toBeEnabled();
  await composer.fill(text);
  await composer.press("Enter");
}

test("agent-owned Work Plan survives reload, switches with sessions, and isolates a fork", async ({ page }) => {
  await page.goto(process.env.PI_E2E_PLANS_URL!);
  await expect(page.getByTitle("connected")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Work Plan" })).toHaveCount(0);

  // The scripted offline agent executes the real work_plan wire contract and
  // persists the same sidecar the extension writes in production.
  await prompt(page, "Create a plan for this release");
  const panel = page.getByRole("complementary", { name: "Work Plan" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Release plan" })).toBeVisible();
  await expect(panel.getByLabel("In progress")).toBeVisible();

  await panel.getByRole("button", { name: "Close Work Plan" }).click();
  const collapsedPlan = page.getByRole("button", { name: "Open Work Plan" });
  await collapsedPlan.hover();
  const preview = page.getByRole("tooltip");
  await expect(preview).toBeVisible();
  await expect(preview.getByText("Publish release")).toBeVisible();
  await preview.hover();
  await expect(preview).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();
  await collapsedPlan.hover();
  await expect(preview).toBeVisible();
  await collapsedPlan.click();
  await expect(panel).toBeVisible();

  await panel.getByRole("treeitem", { name: /Publish release/ }).click();
  await panel.getByRole("button", { name: "Release notes" }).click();
  await expect(page.getByRole("button", { name: "Close file viewer" })).toBeVisible();
  await page.getByRole("button", { name: "Close file viewer" }).click();

  await prompt(page, "Mark the release task done");
  await expect(panel.getByLabel("Done")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("complementary", { name: "Work Plan" }).getByLabel("Done")).toBeVisible();

  await page.getByRole("button", { name: "sessions" }).click();
  await page.getByRole("button", { name: /Other work/ }).click();
  await expect(page.getByRole("heading", { name: "Other plan" })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "Wait" })).toBeVisible();

  await page.getByRole("button", { name: "sessions" }).click();
  await page.getByRole("button", { name: /Release source/ }).click();
  await expect(page.getByRole("heading", { name: "Release plan" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Work Plan" }).getByLabel("Done")).toBeVisible();

  await page.getByRole("button", { name: "tree" }).click();
  await page.getByRole("button", { name: /fork/i }).last().click();
  await expect(page.getByRole("heading", { name: "Release plan" })).toBeVisible();

  await prompt(page, "Reopen the task only in this fork");
  await expect(page.getByRole("complementary", { name: "Work Plan" }).getByLabel("In progress")).toBeVisible();

  const source = JSON.parse(await readFile(`${process.env.PI_E2E_PLAN_SOURCE}.work-plan.json`, "utf8"));
  const fork = JSON.parse(await readFile(`${process.env.PI_E2E_PLAN_FORK}.work-plan.json`, "utf8"));
  expect(source.tasks[0].status).toBe("done");
  expect(fork.tasks[0].status).toBe("in_progress");
});
