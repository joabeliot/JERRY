import { describe, it, expect } from "vitest";

/**
 * Gateway parser functions are private to gateway.ts.
 * We replicate the exact regex patterns here and test them directly.
 * If a regex changes in the source, these tests should be updated to match.
 */

// --- parseToolCalls replica (matches updated source in gateway.ts) ---
type ToolCall = { tool: string; args: string };
function parseToolCalls(response: string): ToolCall[] {
  const calls: ToolCall[] = [];

  // Block format: [TOOL:name key="val"]\n```\ncontent\n```\n[/TOOL]
  const blockRegex = /\[TOOL:(\w+)(.*?)\]\s*\n```\n([\s\S]*?)\n```\s*\n?\[\/TOOL\]/g;
  let match;
  while ((match = blockRegex.exec(response)) !== null) {
    const inlineArgs = match[2].trim();
    const blockContent = match[3];
    const args = inlineArgs
      ? `${inlineArgs} content="""${blockContent}"""`
      : `content="""${blockContent}"""`;
    calls.push({ tool: match[1], args });
  }

  // Inline format: [TOOL:name args]
  const inlineRegex = /\[TOOL:(\w+)(.*?)\]/g;
  while ((match = inlineRegex.exec(response)) !== null) {
    const alreadyCaptured = calls.some(
      (c) => response.indexOf(`[TOOL:${c.tool}`) === match.index
    );
    if (alreadyCaptured) continue;
    calls.push({ tool: match[1], args: match[2].trim() });
  }

  return calls;
}

// --- parseMemorySaves replica ---
type MemorySave = { content: string; category: string; tier: string };
function parseMemorySaves(response: string): MemorySave[] {
  const saves: MemorySave[] = [];
  const regex = /\[SAVE_(DURABLE|EPISODIC|OPERATIONAL)(?:\s+category="([^"]*)")?\]\s*(.+)/gi;
  let match;
  while ((match = regex.exec(response)) !== null) {
    saves.push({
      tier: match[1].toLowerCase(),
      category: match[2] || "general",
      content: match[3].trim(),
    });
  }
  return saves;
}

// --- parseSchedules replica ---
type Schedule = { action: string; payload: string; at: string; description: string };
function parseSchedules(response: string): Schedule[] {
  const schedules: Schedule[] = [];
  const regex = /\[SCHEDULE\s+action="([^"]*)"\s+payload="([^"]*)"\s+at="([^"]*)"\]\s*(.+)/gi;
  let match;
  while ((match = regex.exec(response)) !== null) {
    schedules.push({ action: match[1], payload: match[2], at: match[3], description: match[4].trim() });
  }
  return schedules;
}

// --- cleanMetaTags replica (matches updated source) ---
function cleanMetaTags(response: string): string {
  return response
    .replace(/\[SAVE_(DURABLE|EPISODIC|OPERATIONAL)(?:\s+category="[^"]*")?\]\s*.+/gi, "")
    .replace(/\[SCHEDULE\s+action="[^"]*"\s+payload="[^"]*"\s+at="[^"]*"\]\s*.+/gi, "")
    .replace(/\[UPDATE_KB\s+file="[^"]*"\]\s*.+/gi, "")
    .replace(/\[TOOL:\w+[^\]]*\]\s*\n```\n[\s\S]*?\n```\s*\n?\[\/TOOL\]/g, "")
    .replace(/\[TOOL:\w+[^\]]*\]/g, "")
    .replace(/\[\/TOOL\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// =============================================================================

describe("parseToolCalls", () => {
  it("returns empty array when no tool calls present", () => {
    expect(parseToolCalls("Just a normal response")).toEqual([]);
  });

  it("parses a single tool call with no args", () => {
    expect(parseToolCalls("[TOOL:gmail_triage]")).toEqual([
      { tool: "gmail_triage", args: "" },
    ]);
  });

  it("parses a tool call with args", () => {
    const result = parseToolCalls('[TOOL:gmail_send to="x@y.com" subject="hello"]');
    expect(result).toEqual([
      { tool: "gmail_send", args: 'to="x@y.com" subject="hello"' },
    ]);
  });

  it("parses multiple tool calls in the same response", () => {
    const response = `Let me check your email and calendar.
[TOOL:gmail_triage]
[TOOL:calendar_agenda]`;
    const result = parseToolCalls(response);
    expect(result).toHaveLength(2);
    expect(result[0].tool).toBe("gmail_triage");
    expect(result[1].tool).toBe("calendar_agenda");
  });

  it("does not match malformed tags (missing closing bracket)", () => {
    expect(parseToolCalls("[TOOL:gmail_triage")).toEqual([]);
  });

  it("does not match tags without a tool name", () => {
    expect(parseToolCalls("[TOOL:]")).toEqual([]);
  });

  it("handles tool call embedded in text", () => {
    const result = parseToolCalls("I will check [TOOL:linear_issues] now");
    expect(result).toEqual([{ tool: "linear_issues", args: "" }]);
  });

  it("parses block-format tool call with HTML content", () => {
    const response = [
      "Here's the page:",
      '[TOOL:save_document filename="test.html"]',
      "```",
      '<html><body><div class="header">Hello</div></body></html>',
      "```",
      "[/TOOL]",
    ].join("\n");
    const result = parseToolCalls(response);
    expect(result).toHaveLength(1);
    expect(result[0].tool).toBe("save_document");
    expect(result[0].args).toContain('filename="test.html"');
    expect(result[0].args).toContain('<div class="header">Hello</div>');
  });

  it("parses block-format with no inline args", () => {
    const response = [
      "[TOOL:save_document]",
      "```",
      "some content",
      "```",
      "[/TOOL]",
    ].join("\n");
    const result = parseToolCalls(response);
    expect(result).toHaveLength(1);
    expect(result[0].args).toContain("some content");
  });

  it("parses mix of block and inline tool calls", () => {
    const response = [
      "[TOOL:gmail_triage]",
      '[TOOL:save_document filename="out.html"]',
      "```",
      "<h1>Hi</h1>",
      "```",
      "[/TOOL]",
    ].join("\n");
    const result = parseToolCalls(response);
    expect(result).toHaveLength(2);
    expect(result.find((c) => c.tool === "save_document")).toBeDefined();
    expect(result.find((c) => c.tool === "gmail_triage")).toBeDefined();
  });
});

describe("parseMemorySaves", () => {
  it("parses a SAVE_DURABLE tag with default category", () => {
    const result = parseMemorySaves("[SAVE_DURABLE] Jared prefers async communication");
    expect(result).toEqual([
      { tier: "durable", category: "general", content: "Jared prefers async communication" },
    ]);
  });

  it("parses a SAVE_EPISODIC tag with explicit category", () => {
    const result = parseMemorySaves('[SAVE_EPISODIC category="team"] Pablo is on vacation');
    expect(result).toEqual([
      { tier: "episodic", category: "team", content: "Pablo is on vacation" },
    ]);
  });

  it("parses SAVE_OPERATIONAL", () => {
    const result = parseMemorySaves("[SAVE_OPERATIONAL] Deploying v2.3 in progress");
    expect(result).toEqual([
      { tier: "operational", category: "general", content: "Deploying v2.3 in progress" },
    ]);
  });

  it("is case-insensitive for tier name", () => {
    const result = parseMemorySaves("[save_durable] lower case works too");
    expect(result).toHaveLength(1);
    expect(result[0].tier).toBe("durable");
  });

  it("parses multiple saves in one response", () => {
    const response = `[SAVE_DURABLE] Fact one
Some other text
[SAVE_EPISODIC category="ops"] Fact two`;
    const result = parseMemorySaves(response);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("Fact one");
    expect(result[1].category).toBe("ops");
  });
});

describe("parseSchedules", () => {
  it("parses a valid schedule tag", () => {
    const tag = '[SCHEDULE action="gmail_send" payload="to=x@y.com subject=hi" at="2026-03-22T09:00:00Z"] Send morning email';
    const result = parseSchedules(tag);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe("gmail_send");
    expect(result[0].payload).toBe("to=x@y.com subject=hi");
    expect(result[0].at).toBe("2026-03-22T09:00:00Z");
    expect(result[0].description).toBe("Send morning email");
  });

  it("returns empty for missing fields", () => {
    expect(parseSchedules('[SCHEDULE action="gmail_send"] incomplete')).toEqual([]);
  });

  it("returns empty for plain text", () => {
    expect(parseSchedules("No schedule here")).toEqual([]);
  });
});

describe("cleanMetaTags", () => {
  it("removes SAVE tags", () => {
    const input = "Hello\n[SAVE_DURABLE] some fact\nGoodbye";
    expect(cleanMetaTags(input)).toBe("Hello\n\nGoodbye");
  });

  it("removes TOOL tags", () => {
    const input = "Checking now\n[TOOL:gmail_triage]\nDone";
    expect(cleanMetaTags(input)).toBe("Checking now\n\nDone");
  });

  it("removes SCHEDULE tags", () => {
    const input = 'OK\n[SCHEDULE action="gmail_send" payload="test" at="2026-01-01T00:00:00Z"] desc\nDone';
    expect(cleanMetaTags(input)).toBe("OK\n\nDone");
  });

  it("removes UPDATE_KB tags", () => {
    const input = 'Here\n[UPDATE_KB file="team"] new info\nDone';
    expect(cleanMetaTags(input)).toBe("Here\n\nDone");
  });

  it("collapses triple+ newlines to double", () => {
    const input = "A\n\n\n\nB";
    expect(cleanMetaTags(input)).toBe("A\n\nB");
  });

  it("returns clean text unchanged (after trim)", () => {
    expect(cleanMetaTags("  Hello world  ")).toBe("Hello world");
  });

  it("removes block-format tool calls", () => {
    const input = [
      "Here's the file:",
      '[TOOL:save_document filename="x.html"]',
      "```",
      "<html>content</html>",
      "```",
      "[/TOOL]",
      "Done!",
    ].join("\n");
    const result = cleanMetaTags(input);
    expect(result).not.toContain("[TOOL:");
    expect(result).not.toContain("<html>");
    expect(result).not.toContain("[/TOOL]");
    expect(result).toContain("Done!");
  });

  it("handles response with multiple tag types", () => {
    const input = `Here is your update.
[TOOL:gmail_triage]
[SAVE_DURABLE] User prefers summaries
[SAVE_EPISODIC category="work"] Sprint ends Friday
Let me know if you need more.`;
    const result = cleanMetaTags(input);
    expect(result).not.toContain("[TOOL:");
    expect(result).not.toContain("[SAVE_");
    expect(result).toContain("Here is your update.");
    expect(result).toContain("Let me know if you need more.");
  });
});
