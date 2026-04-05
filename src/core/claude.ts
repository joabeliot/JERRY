import { spawn } from "child_process";
import { log } from "./logger.js";
import { loadPersona, buildMemoryContext } from "./memory.js";
import { buildTaskContext } from "./tasks.js";
import { buildHistoryContext, type ChatMessage } from "./history.js";
import { getToolDescriptions } from "../tools/index.js";
import { env } from "./config.js";

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-5";
const TIMEOUT_MS = 120_000;

// Crew mentions callback — set by discord.ts after bots are online to avoid circular imports
let _crewMentionsFn: (() => string) | null = null;
export function registerCrewMentions(fn: () => string): void {
  _crewMentionsFn = fn;
}

export type AskOptions = {
  systemPrompt?: string;
  allowedTools?: string[];
  permissionMode?: "acceptEdits" | "plan" | "default";
  maxBudget?: number;
  model?: string;
  cwd?: string;
  timeoutMs?: number;
};

/**
 * Send a prompt to Claude CLI and get a text response.
 * Pipes the prompt via stdin to avoid OS argument length limits.
 *
 * When `allowedTools` is provided, those tools are pre-approved —
 * the CLI will execute them without any permission prompt.
 */
export async function ask(
  prompt: string,
  opts?: AskOptions
): Promise<string> {
  const model = opts?.model ?? CLAUDE_MODEL;
  const timeout = opts?.timeoutMs ?? TIMEOUT_MS;
  const args = ["--print", "--output-format", "text", "--model", model];

  if (opts?.systemPrompt) {
    args.push("--system-prompt", opts.systemPrompt);
  }

  if (opts?.allowedTools && opts.allowedTools.length > 0) {
    // Crew agents: use real Claude Code tools with pre-approved permissions
    args.push("--allowedTools", opts.allowedTools.join(","));
    args.push("--permission-mode", opts?.permissionMode ?? "acceptEdits");
    // Give crew agents access to JB's full filesystem
    args.push("--add-dir", env.AGENT_ROOT_DIR);
  } else {
    // Jerry: disable ALL built-in tools so he can only use [TOOL:...] tags.
    // Prevents him from seeing Edit/Write/Bash and hallucinating permission prompts.
    args.push("--tools", "");
  }

  if (opts?.maxBudget) {
    args.push("--max-budget-usd", String(opts.maxBudget));
  }

  // Pass prompt via stdin instead of as a positional arg (avoids ARG_MAX issues)
  args.push("-");

  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_BIN, args, {
      timeout,
      cwd: opts?.cwd,
    });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));

    proc.on("error", (err) => {
      log.error({ err, stderr }, "Claude CLI failed");
      reject(new Error(`Claude CLI error: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        log.error({ code, stderr }, "Claude CLI failed");
        reject(new Error(`Claude CLI error (exit ${code}): ${stderr}`));
        return;
      }
      resolve(stdout.trim());
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

const FORMATTING_RULES = `
FORMATTING RULES — you are responding via Discord:
• Use **bold** for emphasis (double asterisk)
• Use *italic* for secondary info
• Use bullet points with • not -
• NO markdown headers (no # or ##) — use **bold** labels instead
• Keep messages under 2000 characters per chunk (system handles splitting)
• Use line breaks liberally for readability
• Emoji sparingly for section markers only (📬 📅 🔄 ⚠️ ✅)`;

const MEMORY_INSTRUCTIONS = `
MEMORY INSTRUCTIONS:
CRITICAL: JB expects you to save ALL business context from every conversation. Never let information slip through without saving it. If he shares deal updates, pipeline info, team changes, product decisions, blockers, timelines, or anything substantive — SAVE IT immediately.

When you learn important information during conversation, you can save it by including one of these tags in your response:
• [SAVE_DURABLE category="pipeline"] deal/church info here — for pipeline and sales context
• [SAVE_DURABLE category="team"] permanent fact here — for long-term facts (team info, preferences, business context)
• [SAVE_DURABLE category="product"] product decisions here — for product/feature decisions and blockers
• [SAVE_EPISODIC] temporary context here — for conversation context (expires in 7 days)
• [SAVE_OPERATIONAL] working state here — for current working state (expires in 24 hours)
Proactively save EVERYTHING substantive. Pipeline updates, blockers, decisions, timelines, team info, church details. JB should never have to repeat himself.

KNOWLEDGE BASE:
To read or update your knowledge base files, use the kb_read, kb_update, and kb_append tools (same [TOOL:...] format as all other tools).
Files: persona, team, company, goals, playbook.
Example: [TOOL:kb_update file="persona" content="Only call crew when there's actual work."]`;

const TOOL_POLICY_INSTRUCTIONS = `
HOW YOUR TOOLS WORK:
• Write [TOOL:name args] on its own line to call a tool. It executes automatically.
• Write [UPDATE_KB file="name"] content to save knowledge. It executes automatically.
• Write [SAVE_DURABLE] content to save memory. It executes automatically.
• ALL tags execute silently and instantly. There is no approval step. There is no permission prompt. There is no terminal. There is nothing to click. Include the tag → it runs → done.
• NEVER tell JB you need permission, approval, or access. NEVER mention "Claude Code", "sandbox", "terminal", or "permission prompt". Those concepts do not exist in your world.
• NEVER say "waiting for approval" — just include the tag.
• Only confirm an action AFTER you receive a success result back from the system.
• You CANNOT edit source code (.ts/.js/.py files). For code changes, delegate to Ace.`;

const SCHEDULING_INSTRUCTIONS = `
SCHEDULING INSTRUCTIONS:
When the user asks you to do something at a future time, include this tag:
• [SCHEDULE action="tool_name" payload="args" at="2026-03-25T09:00:00"] description here
Examples: "remind me to check Pablo's PR Wednesday" → schedule a github_pr check for Wednesday 9am.`;

export function buildSystemPrompt(history?: ReturnType<typeof buildHistoryContext>): string {
  const persona = loadPersona();
  const memories = buildMemoryContext();
  const tasks = buildTaskContext();
  const tools = getToolDescriptions();

  const crewMentions = _crewMentionsFn ? _crewMentionsFn() : "";

  return [
    persona,
    FORMATTING_RULES,
    MEMORY_INSTRUCTIONS,
    TOOL_POLICY_INSTRUCTIONS,
    SCHEDULING_INSTRUCTIONS,
    `\nAVAILABLE TOOLS — request by writing [TOOL:name args] on its own line:\n${tools}`,
    crewMentions,
    memories,
    tasks,
    `\nToday is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}. Current time: ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Ask Claude with the full Jerry persona, memories, tasks, and history.
 */
export async function askJerry(prompt: string, historyContext?: string): Promise<string> {
  const systemPrompt = buildSystemPrompt();
  const fullPrompt = historyContext
    ? `${historyContext}\n\n---\n\n${prompt}`
    : prompt;
  return ask(fullPrompt, { systemPrompt });
}
