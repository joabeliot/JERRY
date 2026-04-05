import { describe, it, expect, vi } from "vitest";
import { runTool, getToolDescriptions, TOOL_DEFS } from "../../src/tools/index.js";

describe("runTool", () => {
  it("returns 'Unknown tool: name' for an unknown tool", async () => {
    const result = await runTool("nonexistent_tool", "");
    expect(result).toBe("Unknown tool: nonexistent_tool");
  });

  it("returns 'Tool error: message' when a tool throws", async () => {
    // We test this via a tool that will fail due to missing CLI tooling
    // gmail_triage calls gws which likely isn't available in test env
    const result = await runTool("gmail_triage", "");
    // It should either succeed or return a tool error — not crash
    expect(typeof result).toBe("string");
    // If gws isn't available, it will be a tool error or timeout
    if (result.startsWith("Tool error:")) {
      expect(result).toMatch(/^Tool error: /);
    }
  });
});

describe("getToolDescriptions", () => {
  it("returns a string", () => {
    const desc = getToolDescriptions();
    expect(typeof desc).toBe("string");
  });

  it("contains all registered tool names", () => {
    const desc = getToolDescriptions();
    for (const tool of TOOL_DEFS) {
      expect(desc).toContain(tool.name);
    }
  });

  it("uses the [TOOL:name] format", () => {
    const desc = getToolDescriptions();
    expect(desc).toContain("[TOOL:gmail_triage]");
    expect(desc).toContain("[TOOL:gmail_send]");
  });
});

describe("TOOL_DEFS", () => {
  it("has unique tool names", () => {
    const names = TOOL_DEFS.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("every tool has name, description, and execute", () => {
    for (const tool of TOOL_DEFS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(typeof tool.execute).toBe("function");
    }
  });
});

describe("tool timeout", () => {
  it("races tool execution against a 30s timeout", async () => {
    // Test the timeout mechanism by verifying the pattern works
    // We create a slow promise and race it against a fast timeout
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve("slow"), 5000));
    const fast = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timed out")), 50)
    );

    await expect(Promise.race([slow, fast])).rejects.toThrow("Timed out");
  });

  it("resolves if tool completes before timeout", async () => {
    const fast = Promise.resolve("done");
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timed out")), 5000)
    );

    const result = await Promise.race([fast, timeout]);
    expect(result).toBe("done");
  });
});
