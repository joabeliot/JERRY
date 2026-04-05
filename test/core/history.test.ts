import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getSession, addMessage, buildHistoryContext, clearHistory } from "../../src/core/history.js";
import { unlinkSync, existsSync } from "fs";
import { resolve, join } from "path";

const HISTORY_DIR = resolve(import.meta.dirname, "../../jerry/history");

// Use a unique channel/user combo per test run to avoid collisions
const testChannel = "vitest";
const testUser = `testuser_${Date.now().toString(36)}`;
const expectedSessionId = `${testChannel}_${testUser}`;

function cleanupSession(): void {
  const path = join(HISTORY_DIR, `${expectedSessionId}.json`);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

afterEach(() => {
  cleanupSession();
});

describe("getSession", () => {
  it("creates a new session for an unknown channel+user", () => {
    const session = getSession(testChannel, testUser);
    expect(session.id).toBe(expectedSessionId);
    expect(session.channel).toBe(testChannel);
    expect(session.messages).toEqual([]);
    expect(session.createdAt).toBeTruthy();
  });

  it("returns the same session on subsequent calls", () => {
    const s1 = getSession(testChannel, testUser);
    addMessage(s1, "user", "hello");

    const s2 = getSession(testChannel, testUser);
    expect(s2.id).toBe(s1.id);
    expect(s2.messages.length).toBe(1);
  });
});

describe("addMessage", () => {
  it("appends a message to the session", () => {
    const session = getSession(testChannel, testUser);
    addMessage(session, "user", "Hello Jerry");

    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].role).toBe("user");
    expect(session.messages[0].content).toBe("Hello Jerry");
    expect(session.messages[0].timestamp).toBeTruthy();
  });

  it("persists messages to disk", () => {
    const session = getSession(testChannel, testUser);
    addMessage(session, "user", "Persisted message");

    // Re-load from disk
    const reloaded = getSession(testChannel, testUser);
    expect(reloaded.messages).toHaveLength(1);
    expect(reloaded.messages[0].content).toBe("Persisted message");
  });

  it("stores tool calls with the message", () => {
    const session = getSession(testChannel, testUser);
    addMessage(session, "assistant", "Here are your emails", [
      { tool: "gmail_triage", result: "3 unread" },
    ]);

    expect(session.messages[0].toolCalls).toHaveLength(1);
    expect(session.messages[0].toolCalls![0].tool).toBe("gmail_triage");
  });

  it("trims messages at MAX_MESSAGES (50)", () => {
    const session = getSession(testChannel, testUser);
    for (let i = 0; i < 55; i++) {
      addMessage(session, "user", `Message ${i}`);
    }

    // After trimming, should have exactly 50
    const reloaded = getSession(testChannel, testUser);
    expect(reloaded.messages.length).toBeLessThanOrEqual(50);
    // The oldest messages should have been trimmed
    expect(reloaded.messages[0].content).toBe("Message 5");
  });
});

describe("buildHistoryContext", () => {
  it("returns empty string for session with no messages", () => {
    const session = getSession(testChannel, testUser);
    expect(buildHistoryContext(session)).toBe("");
  });

  it("formats user messages with JB prefix", () => {
    const session = getSession(testChannel, testUser);
    addMessage(session, "user", "What is on my calendar?");

    const context = buildHistoryContext(session);
    expect(context).toContain("[JB]: What is on my calendar?");
  });

  it("formats assistant messages with Jerry prefix", () => {
    const session = getSession(testChannel, testUser);
    addMessage(session, "assistant", "You have 3 meetings today.");

    const context = buildHistoryContext(session);
    expect(context).toContain("[Jerry]: You have 3 meetings today.");
  });

  it("includes RECENT CONVERSATION header", () => {
    const session = getSession(testChannel, testUser);
    addMessage(session, "user", "hi");

    const context = buildHistoryContext(session);
    expect(context).toContain("RECENT CONVERSATION");
  });

  it("includes truncated tool call results", () => {
    const session = getSession(testChannel, testUser);
    addMessage(session, "assistant", "Checked emails", [
      { tool: "gmail_triage", result: "Email summary here" },
    ]);

    const context = buildHistoryContext(session);
    expect(context).toContain("[tool:gmail_triage]:");
    expect(context).toContain("Email summary here");
  });
});

describe("clearHistory", () => {
  it("empties the session messages", () => {
    const session = getSession(testChannel, testUser);
    addMessage(session, "user", "Message to clear");
    addMessage(session, "assistant", "Reply to clear");

    clearHistory(session);
    expect(session.messages).toEqual([]);
  });

  it("persists the cleared state", () => {
    const session = getSession(testChannel, testUser);
    addMessage(session, "user", "Temporary");
    clearHistory(session);

    const reloaded = getSession(testChannel, testUser);
    expect(reloaded.messages).toEqual([]);
  });
});
