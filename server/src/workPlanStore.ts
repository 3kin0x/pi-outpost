import fs from "node:fs/promises";
import path from "node:path";
import { mutateWorkPlan, validateWorkPlan, type WorkPlan, type WorkPlanMutation } from "@pi-outpost/shared/work-plan";

export const workPlanPath = (sessionFile: string): string => `${sessionFile}.work-plan.json`;

export async function loadWorkPlan(sessionFile: string | undefined): Promise<WorkPlan | null> {
  if (!sessionFile) return null;
  try {
    return validateWorkPlan(JSON.parse(await fs.readFile(workPlanPath(sessionFile), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`Cannot load the Work Plan: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function persist(sessionFile: string, plan: WorkPlan | null): Promise<void> {
  const target = workPlanPath(sessionFile);
  if (plan === null) {
    await fs.unlink(target).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    return;
  }
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
  try {
    await fs.writeFile(temporary, `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.unlink(temporary).catch(() => {});
    throw error;
  }
}

export async function applyWorkPlanMutation(sessionFile: string | undefined, mutation: WorkPlanMutation): Promise<WorkPlan | null> {
  if (!sessionFile) throw new Error("The session has no persistent file yet");
  const current = await loadWorkPlan(sessionFile);
  const next = mutateWorkPlan(current, mutation);
  if (mutation.action !== "get") await persist(sessionFile, next);
  return next;
}

export async function copyWorkPlan(sourceSessionFile: string | undefined, targetSessionFile: string | undefined): Promise<void> {
  if (!sourceSessionFile || !targetSessionFile || sourceSessionFile === targetSessionFile) return;
  await persist(targetSessionFile, await loadWorkPlan(sourceSessionFile));
}

export async function deleteWorkPlan(sessionFile: string): Promise<void> {
  await persist(sessionFile, null);
}
