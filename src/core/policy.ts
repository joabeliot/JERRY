import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { resolve, join } from "path";
import { log } from "./logger.js";
import { extractQuotedArg } from "./utils.js";

export type PolicyDecision = "allow" | "confirm" | "deny";

export interface PendingApproval {
  id: string;
  tool: string;
  args: string;
  description: string;
  createdAt: string;
  // Context for resuming the tool loop after approval
  context?: {
    originalPrompt: string;
    historyContext: string;
    priorToolResults: { tool: string; result: string }[];
    sessionId: string;
  };
}

const APPROVAL_DIR = resolve(import.meta.dirname, "../../jerry/approvals");

if (!existsSync(APPROVAL_DIR)) mkdirSync(APPROVAL_DIR, { recursive: true });

function approvalPath(id: string): string {
  return join(APPROVAL_DIR, `${id}.json`);
}

// Read-only tools auto-allow. Write tools need confirmation.
const READ_TOOLS = new Set([
  "imessage_vip",
  "imessage_unreplied",
  "imessage_recent",
  "imessage_search",
  "gmail_triage",
  "gmail_search",
  "gmail_list",
  "gmail_get",
  "calendar_agenda",
  "linear_issues",
  "linear_my_issues",
  "linear_stale",
  "linear_projects",
  "github_prs",
  "github_commits",
  "github_status",
  "gchat_recent",
  "gchat_search",
  "slack_recent",
  "slack_read",
  "slack_search",
  "web_search",
  "web_fetch",
  "read_document",
  "list_documents",
  "gdoc_read",
  "sheets_read",
  "sheets_info",
  "discord_list_channels",
  "discord_create_channel",
  "discord_delete_channel",
  "discord_send",
  "kb_read",
  "kb_update",
  "kb_append",
]);

const WRITE_TOOLS = new Set([
  "gmail_send",
  "gmail_reply",
  "calendar_create",
  "gchat_send",
  "slack_send",
  "save_document",
  "gdoc_create",
  "gdoc_append",
  "gdoc_replace",
  "sheets_append",
  "sheets_update",
  "sheets_create",
  "sheets_clear",
  "sheets_delete_tab",
  "sheets_add_tab",
]);

/** Evaluate whether a tool call should proceed */
export function evaluate(tool: string): PolicyDecision {
  if (READ_TOOLS.has(tool)) return "allow";
  if (WRITE_TOOLS.has(tool)) return "confirm";
  // Unknown tools default to deny — prevent hallucinated tool names from executing
  log.warn({ tool }, "Unknown tool denied by policy");
  return "deny";
}

/** Create a pending approval (persisted to disk) */
export function createApproval(
  tool: string,
  args: string,
  description: string,
  context?: PendingApproval["context"]
): PendingApproval {
  const id = Date.now().toString(36);
  const approval: PendingApproval = {
    id,
    tool,
    args,
    description,
    createdAt: new Date().toISOString(),
    context,
  };
  writeFileSync(approvalPath(id), JSON.stringify(approval, null, 2));
  log.info({ id, tool }, "Approval pending");
  return approval;
}

/** Approve a pending action — returns the approval with context for resumption */
export function approve(id: string): PendingApproval | null {
  const path = approvalPath(id);
  if (!existsSync(path)) return null;
  try {
    const approval = JSON.parse(readFileSync(path, "utf-8")) as PendingApproval;
    unlinkSync(path);
    log.info({ id, tool: approval.tool }, "Approved");
    return approval;
  } catch {
    return null;
  }
}

/** Deny a pending action */
export function deny(id: string): boolean {
  const path = approvalPath(id);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  log.info({ id }, "Denied");
  return true;
}

/** Get all pending approvals */
export function getPending(): PendingApproval[] {
  try {
    const files = readdirSync(APPROVAL_DIR).filter((f) => f.endsWith(".json"));
    return files.map((f) => JSON.parse(readFileSync(join(APPROVAL_DIR, f), "utf-8")) as PendingApproval);
  } catch {
    return [];
  }
}

/** Build a confirmation message for the user */
export function buildConfirmMessage(approval: PendingApproval): string {
  const details = formatApprovalDetails(approval);
  return [
    `⚠️ *Confirm before I execute:*`,
    ``,
    details,
    ``,
    `/approve ${approval.id}`,
    `/deny ${approval.id}`,
  ].join("\n");
}

function formatApprovalDetails(approval: PendingApproval): string {
  if (approval.tool === "gmail_send") {
    const to = extractQuotedArg(approval.args, "to");
    const subject = extractQuotedArg(approval.args, "subject");
    const body = (extractQuotedArg(approval.args, "body") ?? extractQuotedArg(approval.args, "content"))?.replace(/\\n/g, "\n");
    return [
      `*Send email*`,
      `To: ${to}`,
      `Subject: ${subject}`,
      ``,
      body ?? "(no body)",
    ].join("\n");
  }
  if (approval.tool === "gmail_reply") {
    const body = (extractQuotedArg(approval.args, "body") ?? extractQuotedArg(approval.args, "content"))?.replace(/\\n/g, "\n");
    return `*Reply to email*\n\n${body ?? "(no body)"}`;
  }
  if (approval.tool === "calendar_create") {
    const summary = extractQuotedArg(approval.args, "summary");
    const start = extractQuotedArg(approval.args, "start");
    const end = extractQuotedArg(approval.args, "end");
    return `*Create event*\n${summary}\n${start} → ${end}`;
  }
  if (approval.tool === "gchat_send") {
    const to = extractQuotedArg(approval.args, "to");
    const message = extractQuotedArg(approval.args, "message")?.replace(/\\n/g, "\n");
    return `*Send Google Chat DM*\nTo: ${to}\n\n${message ?? "(no message)"}`;
  }
  if (approval.tool === "gdoc_create") {
    const title = extractQuotedArg(approval.args, "title");
    const content = extractQuotedArg(approval.args, "content");
    const preview = content && content.length > 200 ? content.slice(0, 200) + "…" : content;
    return `*Create Google Doc*\nTitle: ${title ?? "(untitled)"}\n\n${preview ?? "(no content)"}`;
  }
  if (approval.tool === "save_document") {
    const filename = extractQuotedArg(approval.args, "filename");
    const content = extractQuotedArg(approval.args, "content");
    const preview = content && content.length > 200 ? content.slice(0, 200) + "…" : content;
    return `*Save document*\nFile: ${filename ?? "(unnamed)"}\n\n${preview ?? "(no content)"}`;
  }
  return `*${approval.tool}*\n${approval.args.length > 300 ? approval.args.slice(0, 300) + "…" : approval.args}`;
}
