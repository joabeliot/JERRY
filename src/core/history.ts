import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { log } from "./logger.js";

const HISTORY_DIR = resolve(import.meta.dirname, "../../jerry/history");
const MAX_MESSAGES_PER_SESSION = 50;
const MAX_CONTEXT_MESSAGES = 20; // injected into prompt

if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true });

export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: string;
  toolCalls?: { tool: string; result: string }[];
}

interface Session {
  id: string;
  channel: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

function sessionPath(id: string): string {
  return join(HISTORY_DIR, `${id}.json`);
}

function loadSession(id: string): Session | null {
  const path = sessionPath(id);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Session;
  } catch {
    return null;
  }
}

function saveSession(session: Session): void {
  // Trim to max messages
  if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
    session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
  }
  session.updatedAt = new Date().toISOString();
  writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2));
}

/** Get or create a session for a channel+user combo */
export function getSession(channel: string, userId: string): Session {
  // Use channel:userId as session ID for continuity
  const id = `${channel}_${userId.replace(/[^a-zA-Z0-9]/g, "_")}`;
  const existing = loadSession(id);
  if (existing) return existing;

  const session: Session = {
    id,
    channel,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveSession(session);
  return session;
}

/** Add a message to the session */
export function addMessage(
  session: Session,
  role: "user" | "assistant" | "tool",
  content: string,
  toolCalls?: { tool: string; result: string }[]
): void {
  session.messages.push({
    role,
    content,
    timestamp: new Date().toISOString(),
    toolCalls,
  });
  saveSession(session);
}

/** Build conversation history string for prompt injection */
export function buildHistoryContext(session: Session): string {
  const recent = session.messages.slice(-MAX_CONTEXT_MESSAGES);
  if (recent.length === 0) return "";

  let context = "\n=== RECENT CONVERSATION ===\n";
  for (const msg of recent) {
    const prefix = msg.role === "user" ? "JB" : "Jerry";
    context += `[${prefix}]: ${msg.content}\n`;
    if (msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        context += `  [tool:${tc.tool}]: ${tc.result.slice(0, 200)}...\n`;
      }
    }
  }
  return context;
}

/** Clear a session's history */
export function clearHistory(session: Session): void {
  session.messages = [];
  saveSession(session);
  log.info({ sessionId: session.id }, "Session history cleared");
}
