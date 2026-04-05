import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { log } from "./logger.js";

const QUEUE_FILE = resolve(import.meta.dirname, "../../jerry/queue.json");
const QUEUE_DIR = resolve(import.meta.dirname, "../../jerry");

if (!existsSync(QUEUE_DIR)) mkdirSync(QUEUE_DIR, { recursive: true });

// ── Types ──────────────────────────────────────────────────────────────────

export interface QueueItem {
  id: string;
  /** What needs to be done */
  task: string;
  /** Who should do it (jerry, ace, scott, sage, atlas, nix) */
  assignee: string;
  /** Who created the item */
  createdBy: string;
  /** Current status */
  status: "pending" | "in_progress" | "done" | "failed";
  /** Result or report from the assignee */
  result?: string;
  /** Channel to report back to */
  channel?: string;
  /** Priority */
  priority: "high" | "medium" | "low";
  /** Context that was available when the task was created (survives resets) */
  context?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Queue CRUD ─────────────────────────────────────────────────────────────

function loadQueue(): QueueItem[] {
  if (!existsSync(QUEUE_FILE)) return [];
  try {
    return JSON.parse(readFileSync(QUEUE_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveQueue(items: QueueItem[]): void {
  writeFileSync(QUEUE_FILE, JSON.stringify(items, null, 2));
}

/** Add a new item to the queue */
export function enqueue(opts: {
  task: string;
  assignee: string;
  createdBy: string;
  channel?: string;
  priority?: QueueItem["priority"];
  context?: string;
}): QueueItem {
  const queue = loadQueue();
  const item: QueueItem = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    task: opts.task,
    assignee: opts.assignee.toLowerCase(),
    createdBy: opts.createdBy,
    status: "pending",
    channel: opts.channel,
    priority: opts.priority ?? "medium",
    context: opts.context,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  queue.push(item);
  saveQueue(queue);
  log.info({ id: item.id, task: item.task, assignee: item.assignee }, "Queue item added");
  return item;
}

/** Get the next pending item for an assignee */
export function dequeue(assignee: string): QueueItem | null {
  const queue = loadQueue();
  const item = queue.find(
    (i) => i.assignee === assignee.toLowerCase() && i.status === "pending"
  );
  if (!item) return null;

  item.status = "in_progress";
  item.updatedAt = new Date().toISOString();
  saveQueue(queue);
  log.info({ id: item.id, assignee }, "Queue item dequeued");
  return item;
}

/** Mark an item as done with a result */
export function complete(id: string, result?: string): QueueItem | null {
  const queue = loadQueue();
  const item = queue.find((i) => i.id === id);
  if (!item) return null;

  item.status = "done";
  item.result = result;
  item.updatedAt = new Date().toISOString();
  saveQueue(queue);
  log.info({ id, assignee: item.assignee }, "Queue item completed");
  return item;
}

/** Mark an item as failed */
export function fail(id: string, reason?: string): QueueItem | null {
  const queue = loadQueue();
  const item = queue.find((i) => i.id === id);
  if (!item) return null;

  item.status = "failed";
  item.result = reason;
  item.updatedAt = new Date().toISOString();
  saveQueue(queue);
  log.info({ id, assignee: item.assignee, reason }, "Queue item failed");
  return item;
}

/** Get all items, optionally filtered */
export function getQueue(filter?: {
  assignee?: string;
  status?: QueueItem["status"];
}): QueueItem[] {
  let queue = loadQueue();
  if (filter?.assignee) queue = queue.filter((i) => i.assignee === filter.assignee!.toLowerCase());
  if (filter?.status) queue = queue.filter((i) => i.status === filter.status);
  return queue;
}

/** Get pending items that need to be picked up */
export function getPendingItems(): QueueItem[] {
  return loadQueue().filter((i) => i.status === "pending");
}

/** Get completed items that haven't been reported yet */
export function getCompletedItems(): QueueItem[] {
  return loadQueue().filter((i) => i.status === "done" || i.status === "failed");
}

/** Remove completed/failed items older than maxAge (default 1 hour) */
export function cleanupQueue(maxAgeMs: number = 3600_000): number {
  const queue = loadQueue();
  const cutoff = Date.now() - maxAgeMs;
  const kept = queue.filter((i) => {
    if (i.status === "pending" || i.status === "in_progress") return true;
    return new Date(i.updatedAt).getTime() > cutoff;
  });
  const removed = queue.length - kept.length;
  if (removed > 0) {
    saveQueue(kept);
    log.info({ removed }, "Cleaned up old queue items");
  }
  return removed;
}

/** Reset in_progress items that have been stuck longer than maxAge back to pending */
export function recoverStuckItems(maxAgeMs: number = 300_000): number {
  const queue = loadQueue();
  const cutoff = Date.now() - maxAgeMs;
  let recovered = 0;

  for (const item of queue) {
    if (item.status === "in_progress" && new Date(item.updatedAt).getTime() < cutoff) {
      item.status = "pending";
      item.updatedAt = new Date().toISOString();
      recovered++;
      log.info({ id: item.id, assignee: item.assignee, task: item.task }, "Queue: recovered stuck task → pending");
    }
  }

  if (recovered > 0) saveQueue(queue);
  return recovered;
}

/** Build queue context for injection into agent prompts */
export function buildQueueContext(assignee?: string): string {
  const pending = getQueue({ status: "pending", assignee });
  const inProgress = getQueue({ status: "in_progress", assignee });

  if (pending.length === 0 && inProgress.length === 0) return "";

  let ctx = "\n=== WORK QUEUE ===\n";
  for (const item of inProgress) {
    ctx += `• [IN PROGRESS] ${item.task} (id: ${item.id}, from: ${item.createdBy})\n`;
  }
  for (const item of pending) {
    ctx += `• [PENDING] ${item.task} (id: ${item.id}, from: ${item.createdBy}, priority: ${item.priority})\n`;
  }
  return ctx;
}
