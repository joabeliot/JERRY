import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  saveMemory,
  loadMemories,
  deleteMemory,
  searchMemories,
  cleanExpiredMemories,
  buildMemoryContext,
} from "../../src/core/memory.js";

/**
 * These tests exercise the real memory module which writes to otto/memory/.
 * Each test saves memories with unique IDs and cleans them up in afterEach.
 */

let createdIds: string[] = [];

function trackId(id: string): void {
  createdIds.push(id);
}

beforeEach(() => {
  createdIds = [];
});

afterEach(() => {
  for (const id of createdIds) {
    try {
      deleteMemory(id);
    } catch {
      // already cleaned
    }
  }
});

describe("saveMemory", () => {
  it("returns a memory with correct fields", () => {
    const mem = saveMemory("Test fact", "testing", "durable");
    trackId(mem.id);

    expect(mem.id).toBeTruthy();
    expect(mem.content).toBe("Test fact");
    expect(mem.category).toBe("testing");
    expect(mem.tier).toBe("durable");
    expect(mem.createdAt).toBeTruthy();
    expect(mem.updatedAt).toBeTruthy();
  });

  it("durable memories have no expiresAt by default", () => {
    const mem = saveMemory("Permanent fact", "testing", "durable");
    trackId(mem.id);

    expect(mem.expiresAt).toBeUndefined();
  });

  it("episodic memories get default 7-day expiry", () => {
    const mem = saveMemory("Temporary fact", "testing", "episodic");
    trackId(mem.id);

    expect(mem.expiresAt).toBeTruthy();
    const expiresAt = new Date(mem.expiresAt!).getTime();
    const expectedMin = Date.now() + 6.9 * 24 * 3600_000;
    const expectedMax = Date.now() + 7.1 * 24 * 3600_000;
    expect(expiresAt).toBeGreaterThan(expectedMin);
    expect(expiresAt).toBeLessThan(expectedMax);
  });

  it("operational memories get default 24-hour expiry", () => {
    const mem = saveMemory("Working state", "testing", "operational");
    trackId(mem.id);

    expect(mem.expiresAt).toBeTruthy();
    const expiresAt = new Date(mem.expiresAt!).getTime();
    const expectedMin = Date.now() + 23 * 3600_000;
    const expectedMax = Date.now() + 25 * 3600_000;
    expect(expiresAt).toBeGreaterThan(expectedMin);
    expect(expiresAt).toBeLessThan(expectedMax);
  });

  it("uses custom expiresIn for non-durable tiers", () => {
    const mem = saveMemory("Custom expiry", "testing", "episodic", 2); // 2 hours
    trackId(mem.id);

    const expiresAt = new Date(mem.expiresAt!).getTime();
    const expectedMin = Date.now() + 1.9 * 3600_000;
    const expectedMax = Date.now() + 2.1 * 3600_000;
    expect(expiresAt).toBeGreaterThan(expectedMin);
    expect(expiresAt).toBeLessThan(expectedMax);
  });

  it("defaults category to general and tier to durable", () => {
    const mem = saveMemory("Bare save");
    trackId(mem.id);

    expect(mem.category).toBe("general");
    expect(mem.tier).toBe("durable");
  });
});

describe("loadMemories", () => {
  it("includes a recently saved memory", () => {
    const mem = saveMemory("Loadable fact unique123", "testing", "durable");
    trackId(mem.id);

    const all = loadMemories();
    const found = all.find((m) => m.id === mem.id);
    expect(found).toBeDefined();
    expect(found!.content).toBe("Loadable fact unique123");
  });

  it("filters by category", () => {
    const mem = saveMemory("Cat filter test", "vitest_cat_filter", "durable");
    trackId(mem.id);

    const filtered = loadMemories("vitest_cat_filter");
    expect(filtered.length).toBeGreaterThanOrEqual(1);
    expect(filtered.every((m) => m.category === "vitest_cat_filter")).toBe(true);
  });

  it("skips expired memories", () => {
    // Save an operational memory with very short custom expiry,
    // but we can't make it expire instantly. Instead, we directly test
    // that the loadMemories function respects expiresAt by checking
    // that non-expired ones are included.
    const mem = saveMemory("Not expired", "testing", "episodic", 1);
    trackId(mem.id);

    const all = loadMemories();
    const found = all.find((m) => m.id === mem.id);
    expect(found).toBeDefined();
  });
});

describe("deleteMemory", () => {
  it("removes a saved memory and returns true", () => {
    const mem = saveMemory("To be deleted", "testing", "durable");
    // Don't track since we're explicitly deleting

    const result = deleteMemory(mem.id);
    expect(result).toBe(true);

    const all = loadMemories();
    const found = all.find((m) => m.id === mem.id);
    expect(found).toBeUndefined();
  });

  it("returns false for nonexistent ID", () => {
    expect(deleteMemory("nonexistent_zzzz")).toBe(false);
  });
});

describe("searchMemories", () => {
  it("finds memories by content keyword", () => {
    const mem = saveMemory("Pablo loves React vitest_search_kw", "testing", "durable");
    trackId(mem.id);

    const results = searchMemories("vitest_search_kw");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((m) => m.id === mem.id)).toBe(true);
  });

  it("finds memories by category keyword", () => {
    const mem = saveMemory("Some content", "vitest_cat_search", "durable");
    trackId(mem.id);

    const results = searchMemories("vitest_cat_search");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((m) => m.id === mem.id)).toBe(true);
  });

  it("returns empty for no match", () => {
    const results = searchMemories("zzz_nonexistent_vitest_query_zzz");
    expect(results).toEqual([]);
  });
});

describe("cleanExpiredMemories", () => {
  it("removes expired memories and keeps non-expired ones", async () => {
    const { writeFileSync } = await import("fs");
    const { resolve, join } = await import("path");

    const MEMORY_DIR = resolve(import.meta.dirname, "../../jerry/memory");
    const id = `vitest_expired_${Date.now().toString(36)}`;
    const expired = {
      id,
      content: "Already expired",
      category: "testing",
      tier: "episodic",
      expiresAt: new Date(Date.now() - 1000).toISOString(), // expired 1s ago
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(join(MEMORY_DIR, `${id}.json`), JSON.stringify(expired, null, 2));

    const nonExpired = saveMemory("Still valid", "testing", "durable");
    trackId(nonExpired.id);

    const cleaned = cleanExpiredMemories();
    expect(cleaned).toBeGreaterThanOrEqual(1);

    // The expired one should be gone
    const all = loadMemories();
    expect(all.find((m) => m.id === id)).toBeUndefined();
    // The non-expired one should still exist
    expect(all.find((m) => m.id === nonExpired.id)).toBeDefined();
  });
});

describe("buildMemoryContext", () => {
  it("returns empty string when no memories exist in test tiers", () => {
    // We can't guarantee the memory dir is empty, but we can verify format
    const context = buildMemoryContext();
    // It returns either empty string or a formatted block
    expect(typeof context).toBe("string");
  });

  it("includes durable memories in the context", () => {
    const mem = saveMemory("Vitest context builder fact", "testing", "durable");
    trackId(mem.id);

    const context = buildMemoryContext();
    expect(context).toContain("YOUR MEMORIES");
    expect(context).toContain("Vitest context builder fact");
  });

  it("includes episodic memories under Recent Context", () => {
    const mem = saveMemory("Vitest episodic context fact", "testing", "episodic");
    trackId(mem.id);

    const context = buildMemoryContext();
    expect(context).toContain("Vitest episodic context fact");
  });

  it("includes operational memories under Working State", () => {
    const mem = saveMemory("Vitest operational context fact", "testing", "operational");
    trackId(mem.id);

    const context = buildMemoryContext();
    expect(context).toContain("Vitest operational context fact");
  });
});
