import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { resolve, join } from "path";
import { log } from "./logger.js";
import { runTool } from "../tools/index.js";

const SCHEDULE_DIR = resolve(import.meta.dirname, "../../jerry/scheduled");

if (!existsSync(SCHEDULE_DIR)) mkdirSync(SCHEDULE_DIR, { recursive: true });

export interface ScheduledTask {
  id: string;
  action: string; // tool name
  payload: string; // tool args
  description: string;
  runAt: string; // ISO date
  status: "pending" | "executed" | "failed" | "cancelled";
  result?: string;
  createdAt: string;
}

function taskPath(id: string): string {
  return join(SCHEDULE_DIR, `${id}.json`);
}

/** Schedule a one-shot task */
export function scheduleOneShot(
  action: string,
  payload: string,
  runAt: Date,
  description: string
): ScheduledTask {
  const id = Date.now().toString(36);
  const task: ScheduledTask = {
    id,
    action,
    payload,
    description,
    runAt: runAt.toISOString(),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  writeFileSync(taskPath(id), JSON.stringify(task, null, 2));
  log.info({ id, action, runAt: task.runAt }, "Scheduled task created");
  return task;
}

/** List scheduled tasks */
export function listScheduled(includeExecuted = false): ScheduledTask[] {
  try {
    const files = readdirSync(SCHEDULE_DIR).filter((f) => f.endsWith(".json"));
    const tasks: ScheduledTask[] = files.map((f) => JSON.parse(readFileSync(join(SCHEDULE_DIR, f), "utf-8")));
    return tasks
      .filter((t) => includeExecuted || t.status === "pending")
      .sort((a, b) => new Date(a.runAt).getTime() - new Date(b.runAt).getTime());
  } catch {
    return [];
  }
}

/** Cancel a scheduled task */
export function cancelScheduled(id: string): boolean {
  const path = taskPath(id);
  if (!existsSync(path)) return false;
  const task: ScheduledTask = JSON.parse(readFileSync(path, "utf-8"));
  task.status = "cancelled";
  writeFileSync(path, JSON.stringify(task, null, 2));
  return true;
}

/**
 * Tick — called every minute by cron.
 * Executes any tasks whose runAt has passed.
 * Returns results for delivery.
 */
export async function tick(): Promise<{ task: ScheduledTask; result: string }[]> {
  const now = new Date();
  const due = listScheduled().filter((t) => new Date(t.runAt) <= now);
  const results: { task: ScheduledTask; result: string }[] = [];

  for (const task of due) {
    try {
      log.info({ id: task.id, action: task.action }, "Executing scheduled task");
      const result = await runTool(task.action, task.payload);
      task.status = "executed";
      task.result = result;
      writeFileSync(taskPath(task.id), JSON.stringify(task, null, 2));
      results.push({ task, result });
    } catch (err) {
      task.status = "failed";
      task.result = (err as Error).message;
      writeFileSync(taskPath(task.id), JSON.stringify(task, null, 2));
      log.error({ err, id: task.id }, "Scheduled task failed");
    }
  }

  return results;
}
