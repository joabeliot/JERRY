import { describe, it, expect, afterEach } from "vitest";
import { scheduleOneShot, listScheduled, cancelScheduled } from "../../src/core/scheduler.js";
import { unlinkSync, existsSync } from "fs";
import { resolve, join } from "path";

const SCHEDULE_DIR = resolve(import.meta.dirname, "../../jerry/scheduled");

const createdIds: string[] = [];

function trackId(id: string): void {
  createdIds.push(id);
}

afterEach(() => {
  for (const id of createdIds) {
    const path = join(SCHEDULE_DIR, `${id}.json`);
    if (existsSync(path)) {
      unlinkSync(path);
    }
  }
  createdIds.length = 0;
});

describe("scheduleOneShot", () => {
  it("creates a scheduled task and returns it", () => {
    const runAt = new Date(Date.now() + 60_000);
    const task = scheduleOneShot("gmail_send", 'to="x" subject="y"', runAt, "Send test email");
    trackId(task.id);

    expect(task.id).toBeTruthy();
    expect(task.action).toBe("gmail_send");
    expect(task.payload).toBe('to="x" subject="y"');
    expect(task.description).toBe("Send test email");
    expect(task.status).toBe("pending");
    expect(task.runAt).toBe(runAt.toISOString());
    expect(task.createdAt).toBeTruthy();
  });

  it("persists the task to disk", () => {
    const runAt = new Date(Date.now() + 60_000);
    const task = scheduleOneShot("calendar_create", "args", runAt, "Create event");
    trackId(task.id);

    const path = join(SCHEDULE_DIR, `${task.id}.json`);
    expect(existsSync(path)).toBe(true);
  });
});

describe("listScheduled", () => {
  it("returns pending tasks", () => {
    const runAt = new Date(Date.now() + 60_000);
    const task = scheduleOneShot("gmail_triage", "", runAt, "Check emails");
    trackId(task.id);

    const list = listScheduled();
    const found = list.find((t) => t.id === task.id);
    expect(found).toBeDefined();
    expect(found!.status).toBe("pending");
  });

  it("sorts tasks by runAt ascending", async () => {
    const sooner = new Date(Date.now() + 60_000);
    const later = new Date(Date.now() + 300_000);

    const t1 = scheduleOneShot("gmail_triage", "", later, "Later task");
    trackId(t1.id);

    // Small delay to ensure unique Date.now()-based IDs
    await new Promise((r) => setTimeout(r, 5));

    const t2 = scheduleOneShot("gmail_triage", "", sooner, "Sooner task");
    trackId(t2.id);

    // Ensure they got different IDs
    expect(t1.id).not.toBe(t2.id);

    const list = listScheduled();
    const idx1 = list.findIndex((t) => t.id === t1.id);
    const idx2 = list.findIndex((t) => t.id === t2.id);

    expect(idx1).not.toBe(-1);
    expect(idx2).not.toBe(-1);
    // Sooner task (t2) should appear before later task (t1)
    expect(idx2).toBeLessThan(idx1);
  });

  it("excludes cancelled tasks by default", () => {
    const runAt = new Date(Date.now() + 60_000);
    const task = scheduleOneShot("gmail_triage", "", runAt, "To cancel");
    trackId(task.id);

    cancelScheduled(task.id);

    const list = listScheduled();
    const found = list.find((t) => t.id === task.id);
    expect(found).toBeUndefined();
  });

  it("includes executed tasks when includeExecuted is true", () => {
    const runAt = new Date(Date.now() + 60_000);
    const task = scheduleOneShot("gmail_triage", "", runAt, "Include me");
    trackId(task.id);

    // Cancel it (changes status from pending)
    cancelScheduled(task.id);

    // includeExecuted=true includes all statuses
    const list = listScheduled(true);
    const found = list.find((t) => t.id === task.id);
    expect(found).toBeDefined();
  });
});

describe("cancelScheduled", () => {
  it("sets the task status to cancelled", () => {
    const runAt = new Date(Date.now() + 60_000);
    const task = scheduleOneShot("gmail_triage", "", runAt, "Cancel me");
    trackId(task.id);

    const result = cancelScheduled(task.id);
    expect(result).toBe(true);

    // Verify it's cancelled on disk
    const list = listScheduled(true);
    const found = list.find((t) => t.id === task.id);
    expect(found?.status).toBe("cancelled");
  });

  it("returns false for nonexistent task", () => {
    expect(cancelScheduled("nonexistent_zzz")).toBe(false);
  });
});
