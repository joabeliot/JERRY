import { log } from "./logger.js";
import { askJerry } from "./claude.js";
import { runTool, getToolDescriptions } from "../tools/index.js";
import { saveMemory, loadMemories, deleteMemory, searchMemories, type MemoryTier } from "./memory.js";
import { createTask, updateTask, getTasks } from "./tasks.js";
import { setQuietMode, isQuietMode } from "../channels/discord.js";
import { getSession, addMessage, buildHistoryContext, clearHistory } from "./history.js";
import { evaluate, createApproval, approve, deny, getPending, buildConfirmMessage } from "./policy.js";
import { scheduleOneShot, listScheduled, cancelScheduled } from "./scheduler.js";
import { readKB, appendKB, smartUpdateKB, listKB } from "./knowledgebase.js";
import { generateBriefing } from "./briefing.js";

export type Message = {
  channel: "discord" | "whatsapp" | "telegram";
  from: string;
  text: string;
  replyFn: (text: string) => Promise<void>;
};

const MAX_TOOL_LOOPS = 8;
const MAX_CONTINUATIONS = 2;

/**
 * Detect if a response was truncated mid-thought and ask Claude to finish.
 * Heuristics: ends with a colon, a header-like line, a bullet prefix, or mid-sentence.
 */
async function continueIfTruncated(
  response: string,
  originalQuestion: string,
  historyContext?: string
): Promise<string> {
  let result = response;
  for (let i = 0; i < MAX_CONTINUATIONS; i++) {
    if (!looksTruncated(result)) break;
    log.warn("Response appears truncated — requesting continuation");
    const continuation = await askJerry(
      `Your previous response was cut off. Here is what you wrote so far:\n\n${result}\n\nOriginal question: ${originalQuestion}\n\nContinue EXACTLY where you left off. Do not repeat what you already said.`,
      historyContext
    );
    result = result + "\n" + continuation;
  }
  return result;
}

function looksTruncated(text: string): boolean {
  const trimmed = text.trimEnd();
  if (!trimmed) return false;
  // Ends with a section header/label followed by colon or nothing after it
  if (/:\s*$/.test(trimmed)) return true;
  // Ends with a bullet marker with no content
  if (/[•\-\*]\s*$/.test(trimmed)) return true;
  // Ends mid-sentence (letter/comma but no terminal punctuation)
  if (/[a-zA-Z,]\s*$/.test(trimmed) && trimmed.length > 200) return true;
  return false;
}

/**
 * Main message handler — routes commands, runs tool loops, saves history.
 */
export async function handleMessage(msg: Message): Promise<void> {
  log.info({ channel: msg.channel, from: msg.from }, "Inbound message");
  const text = msg.text.trim();

  // Get or create conversation session
  const session = getSession(msg.channel, msg.from);

  try {
    // Handle slash commands directly
    const command = parseCommand(text);
    if (command) {
      const result = await handleCommand(command.cmd, command.args, msg);
      addMessage(session, "user", text);
      addMessage(session, "assistant", result);
      await msg.replyFn(result);
      return;
    }

    // Save user message to history
    addMessage(session, "user", text);

    // Build context
    const historyContext = buildHistoryContext(session);
    const prompt = buildPrompt(text);

    // Multi-step tool loop
    let response = await askJerry(prompt, historyContext);
    response = await continueIfTruncated(response, text, historyContext);
    let loopCount = 0;
    const allToolResults: { tool: string; result: string }[] = [];

    while (loopCount < MAX_TOOL_LOOPS) {
      const toolCalls = parseToolCalls(response);
      const saves = parseMemorySaves(response);
      const schedules = parseSchedules(response);

      // Process memory saves
      for (const save of saves) {
        saveMemory(save.content, save.category, save.tier);
      }

      // Process schedule requests
      for (const sched of schedules) {
        scheduleOneShot(sched.action, sched.payload, new Date(sched.at), sched.description);
      }

      // Process knowledge base updates
      const kbUpdates = parseKBUpdates(response);
      for (const kb of kbUpdates) {
        await smartUpdateKB(kb.file, kb.content);
      }

      // Clean response of meta tags before sending
      response = cleanMetaTags(response);

      if (toolCalls.length === 0) break;

      loopCount++;
      const toolResults: string[] = [];

      for (const call of toolCalls) {
        // Policy check
        const decision = evaluate(call.tool);

        if (decision === "deny") {
          toolResults.push(`[${call.tool}]: DENIED by policy`);
          continue;
        }

        if (decision === "confirm") {
          const approval = createApproval(
            call.tool,
            call.args,
            `${call.tool} with args: ${call.args}`,
            {
              originalPrompt: text,
              historyContext: buildHistoryContext(session),
              priorToolResults: allToolResults,
              sessionId: session.id,
            }
          );
          await msg.replyFn(buildConfirmMessage(approval));
          addMessage(session, "assistant", `Awaiting approval for ${call.tool}`);
          return; // Stop here, wait for /approve
        }

        // Execute
        const result = await runTool(call.tool, call.args);
        toolResults.push(`[${call.tool}]: ${result}`);
        allToolResults.push({ tool: call.tool, result });
      }

      // Feed results back to Claude for next iteration
      response = await askJerry(
        `Tool results from your previous request:\n${toolResults.join("\n")}\n\nOriginal question: ${text}\n\nContinue your response. If you need more data, request another tool. Otherwise give the final answer.`,
        historyContext
      );
      response = await continueIfTruncated(response, text, historyContext);
    }

    // Save assistant response to history
    addMessage(session, "assistant", response, allToolResults.length > 0 ? allToolResults : undefined);
    await msg.replyFn(response);
  } catch (err) {
    log.error({ err }, "Failed to handle message");
    await msg.replyFn("Something went wrong processing that. I'll look into it.");
  }
}

// === Slash Commands ===

type Command = { cmd: string; args: string };

function parseCommand(text: string): Command | null {
  if (!text.startsWith("/")) return null;
  const spaceIdx = text.indexOf(" ");
  if (spaceIdx === -1) return { cmd: text.slice(1).toLowerCase(), args: "" };
  return { cmd: text.slice(1, spaceIdx).toLowerCase(), args: text.slice(spaceIdx + 1).trim() };
}

async function handleCommand(cmd: string, args: string, msg: Message): Promise<string> {
  switch (cmd) {
    // === Memory ===
    case "remember": {
      if (!args) return "Usage: /remember <text>\nOr: /remember [category] <text>";
      let tier: MemoryTier = "durable";
      let category = "general";
      let content = args;

      // Parse tier: /remember ~episodic [team] Pablo is on vacation
      if (args.startsWith("~")) {
        const spaceIdx = args.indexOf(" ");
        tier = args.slice(1, spaceIdx) as MemoryTier;
        content = args.slice(spaceIdx + 1);
      }
      // Parse category: /remember [team] Pablo is strong on React
      if (content.startsWith("[")) {
        const endBracket = content.indexOf("]");
        category = content.slice(1, endBracket);
        content = content.slice(endBracket + 1).trim();
      }

      const mem = saveMemory(content, category, tier);
      return `✅ Remembered (${mem.tier}/${mem.category}): ${mem.content}`;
    }

    case "memories": {
      const memories = args ? searchMemories(args) : loadMemories();
      if (memories.length === 0) return "No memories found.";
      const grouped: Record<string, typeof memories> = {};
      for (const m of memories.slice(0, 20)) {
        const key = `${m.tier}/${m.category}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(m);
      }
      return Object.entries(grouped)
        .map(([key, mems]) => `*${key}*\n${mems.map((m) => `• ${m.content} _(${m.id})_`).join("\n")}`)
        .join("\n\n");
    }

    case "forget": {
      if (!args) return "Usage: /forget <memory-id>";
      return deleteMemory(args) ? `✅ Forgotten.` : `Memory not found.`;
    }

    // === Tasks ===
    case "task": {
      if (!args) return "Usage: /task <title> | priority:high | due:2026-03-25 | assignee:Name";
      const parts = args.split("|").map((s) => s.trim());
      const title = parts[0];
      const opts: Record<string, string> = {};
      for (const p of parts.slice(1)) {
        const [k, v] = p.split(":").map((s) => s.trim());
        if (k && v) opts[k] = v;
      }
      const task = createTask(title, {
        priority: (opts.priority as "high" | "medium" | "low") ?? "medium",
        assignee: opts.assignee,
        dueDate: opts.due,
      });
      return `✅ Task: *${task.title}* (${task.priority}, id: ${task.id})`;
    }

    case "tasks": {
      const filter = args as "todo" | "in_progress" | "done" | "blocked" | undefined;
      const tasks = getTasks(filter || undefined);
      if (tasks.length === 0) return "No tasks.";
      return tasks.map((t) => {
        const icon = { todo: "⬜", in_progress: "🔄", done: "✅", blocked: "🔴" }[t.status];
        const due = t.dueDate ? ` (due: ${t.dueDate})` : "";
        const who = t.assignee ? ` → ${t.assignee}` : "";
        return `${icon} *${t.title}*${who}${due}\n   _${t.id}_`;
      }).join("\n\n");
    }

    case "done": {
      if (!args) return "Usage: /done <task-id>";
      const task = updateTask(args, { status: "done" });
      return task ? `✅ Done: *${task.title}*` : `Not found.`;
    }

    case "status": {
      if (!args) return "Usage: /status <task-id> <status>";
      const [id, status] = args.split(" ");
      const task = updateTask(id, { status: status as any });
      return task ? `✅ *${task.title}* → ${status}` : `Not found.`;
    }

    // === Policy ===
    case "approve": {
      let approvalId = args;
      if (!approvalId) {
        // No ID given — approve the most recent pending
        const pending = getPending();
        if (pending.length === 0) return "No pending approvals.";
        approvalId = pending[pending.length - 1].id;
      }
      const approval = approve(approvalId);
      if (!approval) return "No pending approval with that ID.";

      // Execute the approved tool
      const result = await runTool(approval.tool, approval.args);

      // If we have context, try to resume the tool loop via Claude
      // But if Claude times out, still return the tool result
      if (approval.context) {
        try {
          const toolResultSummary = [
            ...approval.context.priorToolResults.map((r) => `[${r.tool}]: ${r.result}`),
            `[${approval.tool}]: ${result}`,
          ].join("\n");

          const response = await askJerry(
            `Tool results from your previous request:\n${toolResultSummary}\n\nOriginal question: ${approval.context.originalPrompt}\n\nContinue your response. If you need more data, request another tool. Otherwise give the final answer.`,
            approval.context.historyContext
          );
          return cleanMetaTags(response);
        } catch (err) {
          log.warn({ err, tool: approval.tool }, "Follow-up Claude call failed after approval, returning raw result");
          return `✅ Executed: ${approval.tool}\n\n${result}`;
        }
      }

      return `✅ Approved and executed: ${approval.tool}\n\n${result}`;
    }

    case "deny": {
      if (!args) return "Usage: /deny <approval-id>";
      return deny(args) ? "✅ Denied." : "No pending approval with that ID.";
    }

    case "pending": {
      const items = getPending();
      if (items.length === 0) return "No pending approvals.";
      return items.map((p) => `⚠️ *${p.tool}*: ${p.description}\n   /approve ${p.id} or /deny ${p.id}`).join("\n\n");
    }

    // === Scheduled ===
    case "scheduled": {
      const items = listScheduled();
      if (items.length === 0) return "No scheduled tasks.";
      return items.map((s) => `⏰ *${s.description}* at ${new Date(s.runAt).toLocaleString()}\n   _${s.id}_`).join("\n\n");
    }

    case "cancel": {
      if (!args) return "Usage: /cancel <scheduled-id>";
      return cancelScheduled(args) ? "✅ Cancelled." : "Not found.";
    }

    // === Tools ===
    case "briefing": return await generateBriefing();
    case "emails": {
      const emails = await runTool("gmail_triage", "");
      return await askJerry(`Triage these emails. Flag urgent, recommend follow-ups.\n\n${emails}`);
    }
    case "calendar": {
      const agenda = await runTool("calendar_agenda", "");
      return await askJerry(`Summarize the calendar. Flag conflicts or prep needed.\n\n${agenda}`);
    }
    case "sprint": {
      const issues = await runTool("linear_issues", "");
      return await askJerry(`Audit this sprint. Flag risks, stale items, blockers.\n\n${issues}`);
    }
    case "prs": {
      const prs = await runTool("github_prs", "");
      return await askJerry(`Review these open PRs. Flag stale ones, recommend actions.\n\n${prs}`);
    }
    case "deploys": {
      const status = await runTool("github_status", "");
      return await askJerry(`Review CI/deploy status. Flag failures.\n\n${status}`);
    }

    // === Knowledge Base ===
    case "kb": {
      if (!args) return `Knowledge base files: ${listKB().join(", ")}\n\nUsage:\n• /kb company — view file\n• /kb company add <text> — append\n• /kb company update <text> — smart merge`;
      const parts = args.split(" ");
      const name = parts[0];
      const action = parts[1];
      const content = parts.slice(2).join(" ");

      if (!action) {
        const file = readKB(name);
        return file ?? `Unknown file: ${name}. Available: ${listKB().join(", ")}`;
      }
      if (action === "add" && content) {
        return appendKB(name, content) ? `✅ Appended to ${name}.md` : `Unknown file: ${name}`;
      }
      if (action === "update" && content) {
        return await smartUpdateKB(name, content);
      }
      return `Usage: /kb ${name} [add|update] <content>`;
    }

    // === Crew Control ===
    case "quiet": {
      const current = isQuietMode();
      setQuietMode(!current);
      return !current
        ? "🔇 Quiet mode ON — crew bots will not talk to each other until you send /quiet again."
        : "🔊 Quiet mode OFF — crew bots can talk to each other again.";
    }

    // === Session ===
    case "clear": {
      const session = getSession(msg.channel, msg.from);
      clearHistory(session);
      return "✅ Conversation history cleared.";
    }

    case "help": {
      return [
        "*Jerry Commands*",
        "",
        "📝 *Memory*",
        "• /remember <text> — save permanent memory",
        "• /remember ~episodic <text> — save temporary (7d)",
        "• /remember ~operational <text> — save working state (24h)",
        "• /remember [category] <text> — save with category",
        "• /memories — list all",
        "• /memories <search> — search",
        "• /forget <id> — delete",
        "",
        "✅ *Tasks*",
        "• /task <title> | priority:high | due:DATE | assignee:Name",
        "• /tasks — list active",
        "• /done <id> — complete",
        "• /status <id> <status>",
        "",
        "📊 *Briefings*",
        "• /briefing — full COO briefing",
        "• /emails — email triage",
        "• /calendar — today's schedule",
        "• /sprint — Linear audit",
        "• /prs — open PRs review",
        "• /deploys — CI/deploy status",
        "",
        "⚠️ *Approvals*",
        "• /pending — show pending actions",
        "• /approve <id> — approve",
        "• /deny <id> — deny",
        "",
        "⏰ *Scheduled*",
        "• /scheduled — list scheduled tasks",
        "• /cancel <id> — cancel one",
        "",
        "📂 *Knowledge Base*",
        "• /kb — list files",
        "• /kb company — view a file",
        "• /kb team add Pablo is on vacation this week",
        "• /kb goals update We hit 50 churches onboarded",
        "",
        "🤖 *Crew Control*",
        "• /quiet — toggle bot-to-bot conversation on/off",
        "",
        "🔄 *Session*",
        "• /clear — reset conversation history",
        "",
        "_Or just chat — Jerry handles everything else._",
      ].join("\n");
    }

    default:
      return `Unknown command: /${cmd}\nType /help for commands.`;
  }
}

// === Parsing ===

function buildPrompt(userMessage: string): string {
  return `The user just messaged you. Respond helpfully and concisely.

Available tools (request by writing [TOOL:name args] on its own line):
${getToolDescriptions()}

CRITICAL RULES:
1. You CANNOT send emails, create events, or modify anything without using tools. You have NO ability to take actions on your own — you MUST use [TOOL:...] tags.
2. If the user asks you to send an email, you MUST use [TOOL:gmail_send to="..." subject="..." body="..."] — do NOT just say "sent" without the tool tag.
3. If the user asks you to check something, you MUST use the appropriate [TOOL:...] to fetch real data — do NOT make up or assume information.
4. NEVER claim you did something if you didn't use a tool to do it. That is lying.
5. If you need data to answer, request the tool first. Otherwise just respond.
6. You can chain multiple tool calls across turns — request one, get the result, then request another if needed.
7. For LARGE CONTENT (HTML, code, long text, documents), you MUST use the block format instead of inline:
[TOOL:gdoc_create title="My Document"]
\`\`\`
Document content goes here. Quotes, newlines, and special characters are safe.
\`\`\`
[/TOOL]
This is REQUIRED for gdoc_create, save_document, and gmail_send with long bodies. NEVER put long content inline as content="..." — it will break. Always use the block format above.

JB's message: ${userMessage}`;
}

type ToolCall = { tool: string; args: string };

function parseToolCalls(response: string): ToolCall[] {
  const calls: ToolCall[] = [];

  // Block format: [TOOL:name key="val"]\n```\ncontent\n```\n[/TOOL]
  const blockRegex = /\[TOOL:(\w+)(.*?)\]\s*\n```\n([\s\S]*?)\n```\s*\n?\[\/TOOL\]/g;
  let blockMatch;
  while ((blockMatch = blockRegex.exec(response)) !== null) {
    const inlineArgs = blockMatch[2].trim();
    const blockContent = blockMatch[3];
    // Merge block content as content="""...""" so extractQuotedArg can find it
    const args = inlineArgs
      ? `${inlineArgs} content="""${blockContent}"""`
      : `content="""${blockContent}"""`;
    calls.push({ tool: blockMatch[1], args });
  }

  // Inline format: [TOOL:name args] (skip ranges already captured by block format)
  const inlineRegex = /\[TOOL:(\w+)(.*?)\]/g;
  let inlineMatch;
  while ((inlineMatch = inlineRegex.exec(response)) !== null) {
    // Skip if this position was already captured by a block match
    const alreadyCaptured = calls.some(
      (c) => response.indexOf(`[TOOL:${c.tool}`) === inlineMatch!.index
    );
    if (alreadyCaptured) continue;
    calls.push({ tool: inlineMatch[1], args: inlineMatch[2].trim() });
  }

  return calls;
}

function parseMemorySaves(response: string): { content: string; category: string; tier: MemoryTier }[] {
  const saves: { content: string; category: string; tier: MemoryTier }[] = [];
  const regex = /\[SAVE_(DURABLE|EPISODIC|OPERATIONAL)(?:\s+category="([^"]*)")?\]\s*(.+)/gi;
  let match;
  while ((match = regex.exec(response)) !== null) {
    saves.push({
      tier: match[1].toLowerCase() as MemoryTier,
      category: match[2] || "general",
      content: match[3].trim(),
    });
  }
  return saves;
}

function parseSchedules(response: string): { action: string; payload: string; at: string; description: string }[] {
  const schedules: { action: string; payload: string; at: string; description: string }[] = [];
  const regex = /\[SCHEDULE\s+action="([^"]*)"\s+payload="([^"]*)"\s+at="([^"]*)"\]\s*(.+)/gi;
  let match;
  while ((match = regex.exec(response)) !== null) {
    schedules.push({ action: match[1], payload: match[2], at: match[3], description: match[4].trim() });
  }
  return schedules;
}

function parseKBUpdates(response: string): { file: string; content: string }[] {
  const updates: { file: string; content: string }[] = [];
  const regex = /\[UPDATE_KB\s+file="([^"]*)"\]\s*(.+)/gi;
  let match;
  while ((match = regex.exec(response)) !== null) {
    updates.push({ file: match[1], content: match[2].trim() });
  }
  return updates;
}

function cleanMetaTags(response: string): string {
  return response
    .replace(/\[SAVE_(DURABLE|EPISODIC|OPERATIONAL)(?:\s+[^\]]*)?\][\s\S]*?(?=\n\[|\n\n|$)/gi, "")
    .replace(/\[SCHEDULE\s+action="[^"]*"\s+payload="[^"]*"\s+at="[^"]*"\]\s*.+/gi, "")
    .replace(/\[UPDATE_KB\s+file="[^"]*"\]\s*.+/gi, "")
    // Block-format tool calls: [TOOL:name ...]```...```[/TOOL]
    .replace(/\[TOOL:\w+[^\]]*\]\s*\n```\n[\s\S]*?\n```\s*\n?\[\/TOOL\]/g, "")
    // Inline tool calls: [TOOL:name ...]
    .replace(/\[TOOL:\w+[^\]]*\]/g, "")
    // Block closing tags that may remain
    .replace(/\[\/TOOL\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
