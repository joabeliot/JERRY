import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { log } from "./logger.js";

const TASKS_DIR = resolve(import.meta.dirname, "../../jerry/tasks");

if (!existsSync(TASKS_DIR)) mkdirSync(TASKS_DIR, { recursive: true });

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  priority: "high" | "medium" | "low";
  assignee?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

function taskPath(id: string): string {
  return join(TASKS_DIR, `${id}.json`);
}

/** Create a new task */
export function createTask(
  title: string,
  opts?: { description?: string; priority?: Task["priority"]; assignee?: string; dueDate?: string }
): Task {
  const id = Date.now().toString(36);
  const task: Task = {
    id,
    title,
    description: opts?.description,
    status: "todo",
    priority: opts?.priority ?? "medium",
    assignee: opts?.assignee,
    dueDate: opts?.dueDate,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(taskPath(id), JSON.stringify(task, null, 2));
  log.info({ id, title }, "Task created");
  return task;
}

/** Update a task */
export function updateTask(id: string, updates: Partial<Omit<Task, "id" | "createdAt">>): Task | null {
  const path = taskPath(id);
  if (!existsSync(path)) return null;
  const task: Task = JSON.parse(readFileSync(path, "utf-8"));
  Object.assign(task, updates, { updatedAt: new Date().toISOString() });
  writeFileSync(path, JSON.stringify(task, null, 2));
  log.info({ id, updates }, "Task updated");
  return task;
}

/** Get all tasks, optionally filtered by status */
export function getTasks(status?: Task["status"]): Task[] {
  try {
    const files = readdirSync(TASKS_DIR).filter((f) => f.endsWith(".json"));
    const tasks: Task[] = files.map((f) => {
      const raw = readFileSync(join(TASKS_DIR, f), "utf-8");
      return JSON.parse(raw) as Task;
    });
    const filtered = status ? tasks.filter((t) => t.status === status) : tasks;
    return filtered.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  } catch {
    return [];
  }
}

/** Build task context string for injection into prompts */
export function buildTaskContext(): string {
  const tasks = getTasks();
  const active = tasks.filter((t) => t.status !== "done");
  if (active.length === 0) return "";

  let context = "\n=== YOUR ACTIVE TASKS ===\n";
  for (const t of active) {
    const due = t.dueDate ? ` (due: ${t.dueDate})` : "";
    const assignee = t.assignee ? ` → ${t.assignee}` : "";
    context += `• [${t.status.toUpperCase()}] ${t.title}${assignee}${due} (id: ${t.id})\n`;
  }
  return context;
}
