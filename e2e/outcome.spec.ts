/**
 * The Outcome view in the real application, against a workspace holding two git
 * repositories and a Work Plan whose evidence covers every result the panel can
 * draw. Unit tests can prove the composer; only this can prove that what a
 * reviewer sees is the recorded state, and that it never quietly claims success.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const WORKSPACE = () => process.env.PI_E2E_OUTCOME_WORKSPACE!;

async function openOutcome(page: import("@playwright/test").Page, { navigate = true } = {}) {
  if (navigate) {
    await page.goto(process.env.PI_E2E_OUTCOME_URL!);
    await expect(page.getByTitle("connected")).toBeVisible();
  }
  await page.getByRole("button", { name: /^Outcome/ }).click();
  const panel = page.getByRole("complementary", { name: "Workspace Outcome" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("status")).toHaveCount(0);
  return panel;
}

test("Outcome reports recorded plan, verification and changed files without claiming success", async ({ page }) => {
  const panel = await openOutcome(page);

  // Plan progress comes from statuses alone, and every one of them survives.
  const plan = panel.locator("section", { has: page.getByRole("heading", { name: "Work Plan" }) });
  await expect(plan).toContainText("1 done");
  await expect(plan).toContainText("1 needs review");
  await expect(plan).toContainText("1 in progress");
  await expect(plan).toContainText("1 blocked");
  await expect(plan.getByText("Ship the release")).toBeVisible();
  await expect(plan.getByText("Await signing key")).toBeVisible();
  // A blocked task keeps its reason where a reviewer reads it, not in a tooltip.
  await expect(plan.getByText("The signing key has not been issued")).toBeVisible();

  // One failed record outranks a passing one: the aggregate is failed, and the
  // informational note stays visible without contributing to it.
  const verification = panel.locator("section", { has: page.getByRole("heading", { name: "Verification" }) });
  await expect(verification).toContainText("Verification failed");
  await expect(verification.getByText("Staging probe returned 503")).toBeVisible();
  await expect(verification.getByText("Full suite green")).toBeVisible();
  await expect(verification.getByText("Provider status page mentions maintenance")).toBeVisible();
  await expect(panel).not.toContainText(/all checks passed|everything passed|completed successfully/i);

  // Both repositories are represented, each file under its own, with its state.
  const files = panel.locator("section", { has: page.getByRole("heading", { name: "Changed files" }) });
  await expect(files.getByText("alpha/committed.md")).toBeVisible();
  await expect(files.getByText("beta/untracked.md")).toBeVisible();
  // Exact: the status badge, not the path that happens to contain the same word.
  await expect(files.getByText("Modified", { exact: true })).toBeVisible();
  await expect(files.getByText("Untracked", { exact: true })).toBeVisible();

  // An evidence reference nothing can resolve stays readable and inert: no button,
  // no link, nothing that looks like it would open something and does not.
  const unresolvable = panel.getByText("Mail the release desk");
  await expect(unresolvable).toBeVisible();
  await expect(panel.getByRole("link", { name: /Mail the release desk/ })).toHaveCount(0);
});

test("Outcome entries open the source they name", async ({ page }) => {
  const panel = await openOutcome(page);

  // A task entry hands the reviewer to the Work Plan, on that task.
  await panel.getByRole("button", { name: /Await signing key/ }).click();
  const workPlan = page.getByRole("complementary", { name: "Work Plan" });
  await expect(workPlan).toBeVisible();
  await expect(workPlan.getByText("The signing key has not been issued")).toBeVisible();

  // The drawers are mutually exclusive: opening the plan closed the Outcome.
  await expect(page.getByRole("complementary", { name: "Workspace Outcome" })).toHaveCount(0);

  const reopened = await openOutcome(page);
  await reopened.getByRole("button", { name: /alpha\/committed\.md/ }).click();
  // The existing confined viewer opens the path — the Outcome does not render
  // file content of its own.
  await expect(page.getByText("# alpha, edited")).toBeVisible();
});

test("Outcome survives bursts, deletions and drawer thrashing without going stale", async ({ page }) => {
  const panel = await openOutcome(page);
  await expect(panel.getByText("beta/untracked.md")).toBeVisible();

  // The server watches the directories the file browser has listed — that is the
  // documented contract, and it is what the Outcome's refresh rides on. So list
  // the directory the way a user would before expecting events from it.
  await page.getByTitle("Show files").click();
  await page.getByTitle("beta", { exact: true }).click();
  await expect(page.getByTitle("untracked.md", { exact: true })).toBeVisible();

  // A burst of filesystem events: the view must settle on one truthful result,
  // not queue a refresh per event and render an older one last.
  const beta = path.join(WORKSPACE(), "beta");
  for (let index = 0; index < 8; index += 1) {
    await writeFile(path.join(beta, `burst-${index}.md`), `# burst ${index}\n`);
  }
  await expect(panel.getByText("beta/burst-7.md")).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByRole("status")).toHaveCount(0);

  // Remove what the view is showing, underneath it. The entry has to go, and
  // nothing may be left claiming a file that is not there.
  for (let index = 0; index < 8; index += 1) {
    await rm(path.join(beta, `burst-${index}.md`), { force: true });
  }
  await rm(path.join(beta, "untracked.md"), { force: true });
  await expect(panel.getByText("beta/untracked.md")).toHaveCount(0, { timeout: 15_000 });
  await expect(panel.getByText("alpha/committed.md")).toBeVisible();

  // Thrash the drawers. Each toggle closes the others; none may leave a panel
  // stuck on its loading state or two drawers open at once.
  for (let index = 0; index < 5; index += 1) {
    await page.getByRole("button", { name: /^Outcome/ }).click();
    await page.getByRole("button", { name: /^Outcome/ }).click();
  }
  const settled = page.getByRole("complementary", { name: "Workspace Outcome" });
  await expect(settled).toBeVisible();
  await expect(settled.getByRole("status")).toHaveCount(0, { timeout: 15_000 });
  await expect(settled.getByText("alpha/committed.md")).toBeVisible();

  // And put the workspace back for whichever spec runs next on this server.
  await mkdir(beta, { recursive: true });
  await writeFile(path.join(beta, "untracked.md"), "# beta addition\n");
});

test("switching project drops the previous Outcome rather than carrying it over", async ({ page }) => {
  const panel = await openOutcome(page);
  // Scoped: the task title also appears as the group label on its evidence.
  const planSection = panel.locator("section", { has: page.getByRole("heading", { name: "Work Plan" }) });
  await expect(planSection.getByText("Ship the release")).toBeVisible();

  // Switch underneath the open drawer. The other project has no plan and no
  // repository, so the first workspace's tasks and files would be unmistakable
  // if any of them survived.
  await page.getByTitle(/^Project:/).click();
  await page.getByRole("menuitem").filter({ hasText: process.env.PI_E2E_OUTCOME_SECOND! }).click();

  // A view is not carried across a switch — the drawer closes with the project
  // it described instead of hanging over a workspace it no longer describes.
  await expect(page.getByRole("complementary", { name: "Workspace Outcome" })).toHaveCount(0, { timeout: 15_000 });

  // Reopening asks the workspace now bound. What comes back is that workspace's
  // state, and the previous one is gone from the panel rather than sitting under
  // it as the last thing rendered.
  const reopened = await openOutcome(page, { navigate: false });
  await expect(reopened).toContainText("No Work Plan is recorded", { timeout: 15_000 });
  await expect(reopened.getByText("Ship the release")).toHaveCount(0);
  await expect(reopened.getByText("Probe the staging host")).toHaveCount(0);
  await expect(reopened.getByText("alpha/committed.md")).toHaveCount(0);
  await expect(reopened.getByRole("status")).toHaveCount(0);
});

test("an Outcome left open across a dropped connection is asked for again", async ({ page }) => {
  // Offline emulation does not reliably tear down a loopback socket, so hold on
  // to the real one and close it the way a dropped connection would.
  await page.addInitScript(() => {
    const Native = window.WebSocket;
    const sockets: WebSocket[] = [];
    (window as unknown as { __sockets: WebSocket[] }).__sockets = sockets;
    class Tracked extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        sockets.push(this);
      }
    }
    window.WebSocket = Tracked as unknown as typeof WebSocket;
  });

  const panel = await openOutcome(page);
  await expect(panel.getByText("alpha/committed.md")).toBeVisible();

  // Kill the socket that owed this panel its next answer.
  await page.evaluate(() => (window as unknown as { __sockets: WebSocket[] }).__sockets.at(-1)!.close());
  await expect(page.getByTitle("disconnected")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTitle("connected")).toBeVisible({ timeout: 20_000 });

  // The reconnect snapshot clears the result it carried, so something has to ask
  // again — otherwise the panel sits on its loading state for as long as it is open.
  const reconnected = page.getByRole("complementary", { name: "Workspace Outcome" });
  await expect(reconnected.getByText("alpha/committed.md")).toBeVisible({ timeout: 20_000 });
  await expect(reconnected.getByRole("status")).toHaveCount(0);
});
