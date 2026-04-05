import { log } from "../core/logger.js";
import { extractQuotedArg } from "../core/utils.js";
import * as gws from "./gws.js";
import * as linear from "./linear.js";
import * as github from "./github.js";
import * as gchat from "./gchat.js";
import * as web from "./web.js";
import * as files from "./files.js";
import * as gdocs from "./gdocs.js";
import * as gsheets from "./gsheets.js";
import * as slack from "./slack.js";
import * as imessage from "./imessage.js";
import { IMESSAGE_AVAILABLE } from "./imessage.js";
import * as discord from "./discord.js";
import { readKB, appendKB, listKB } from "../core/knowledgebase.js";
import { smartUpdateKB } from "../core/knowledgebase.js";

export type ToolDef = {
  name: string;
  description: string;
  execute: (args: string) => Promise<string>;
};

export const TOOL_DEFS: ToolDef[] = [
  // Gmail
  { name: "gmail_triage", description: "Get recent unread emails with priority analysis", execute: () => gws.gmailTriage() },
  {
    name: "gmail_search",
    description: "Search emails by sender, subject, or keyword (query required, e.g. from:aljean or subject:proposal). Returns message IDs you can pass to gmail_get.",
    execute: (args) => {
      const query = extractQuotedArg(args, "query") ?? args.trim();
      if (!query) return Promise.resolve("Missing query");
      return gws.gmailSearch(query);
    },
  },
  {
    name: "gmail_send",
    description: "Send an email (to, subject, body required). For long bodies use block format.",
    execute: (args) => {
      const to = extractQuotedArg(args, "to");
      const subject = extractQuotedArg(args, "subject");
      // body can come from body="..." inline or content="""...""" block format
      const body = extractQuotedArg(args, "body") ?? extractQuotedArg(args, "content");
      if (!to || !subject || !body) return Promise.resolve("Missing to, subject, or body");
      return gws.gmailSend(to, subject, body);
    },
  },
  {
    name: "gmail_reply",
    description: "Reply to an email (messageId, body required)",
    execute: (args) => {
      const messageId = extractQuotedArg(args, "messageId");
      const body = extractQuotedArg(args, "body") ?? extractQuotedArg(args, "content");
      if (!messageId || !body) return Promise.resolve("Missing messageId or body");
      return gws.gmailReply(messageId, body);
    },
  },
  // Calendar
  { name: "calendar_agenda", description: "Get today's calendar agenda", execute: () => gws.calendarAgenda() },
  {
    name: "calendar_create",
    description: "Create a calendar event (summary, start, end required)",
    execute: (args) => {
      const summary = extractQuotedArg(args, "summary");
      const start = extractQuotedArg(args, "start");
      const end = extractQuotedArg(args, "end");
      if (!summary || !start || !end) return Promise.resolve("Missing summary, start, or end");
      return gws.calendarCreate(summary, start, end);
    },
  },
  // Linear
  { name: "linear_issues", description: "Get current sprint issues and status", execute: () => linear.getActiveSprintIssues() },
  { name: "linear_my_issues", description: "Get issues assigned to team members", execute: () => linear.getMyIssues() },
  { name: "linear_stale", description: "Get stale/overdue issues (3+ days no update)", execute: () => linear.getStaleIssues() },
  { name: "linear_projects", description: "Get project-level progress", execute: () => linear.getProjects() },
  // GitHub
  { name: "github_prs", description: "List open pull requests", execute: () => github.listPRs() },
  { name: "github_pr", description: "Get details on a specific PR (number required)", execute: (args) => github.getPR(args.trim()) },
  { name: "github_pr_diff", description: "Get the diff of a PR (number required)", execute: (args) => github.getPRDiff(args.trim()) },
  { name: "github_commits", description: "List recent commits", execute: (args) => github.listCommits(args.trim() || undefined) },
  { name: "github_status", description: "Get CI/deploy status", execute: () => github.getDeployStatus() },
  { name: "github_issues", description: "List open GitHub issues", execute: () => github.listIssues() },
  { name: "github_checks", description: "Get CI checks on a PR (number required)", execute: (args) => github.getPRChecks(args.trim()) },
  // iMessage (macOS only — skipped on Linux/Pi)
  ...(IMESSAGE_AVAILABLE ? [
    { name: "imessage_vip", description: "Get recent messages from VIP contacts (Jeff cofounder + others)", execute: () => imessage.getVIPMessages() },
    { name: "imessage_unreplied", description: "Get messages from people waiting on a reply from JB", execute: () => imessage.getUnreplied() },
    { name: "imessage_recent", description: "Get recent iMessage activity across all contacts (last 24h)", execute: () => imessage.getRecentActivity() },
    {
      name: "imessage_search",
      description: "Search iMessages by contact name or keyword (query required)",
      execute: (args: string) => {
        const query = extractQuotedArg(args, "query") ?? args.trim();
        if (!query) return Promise.resolve("Missing query");
        return imessage.searchMessages(query);
      },
    },
  ] as ToolDef[] : []),
  // Slack
  {
    name: "slack_recent",
    description: "Get recent Slack activity across all channels Otto is in (last 24 hours)",
    execute: () => slack.getRecentActivity(),
  },
  {
    name: "slack_read",
    description: "Read recent messages from a specific Slack channel (channel=\"name\" required, e.g. channel=\"general\")",
    execute: (args) => {
      const channelName = extractQuotedArg(args, "channel") ?? extractQuotedArg(args, "channelName") ?? (args.trim() || "general");
      return slack.readChannel(channelName);
    },
  },
  {
    name: "slack_search",
    description: "Search Slack messages by keyword or person name (query required)",
    execute: (args) => {
      const query = extractQuotedArg(args, "query") ?? args.trim();
      if (!query) return Promise.resolve("Missing query");
      return slack.searchMessages(query);
    },
  },
  {
    name: "slack_send",
    description: "Send a Slack message to a channel (#channel-name) or user (email address)",
    execute: (args) => {
      const to = extractQuotedArg(args, "to") ?? extractQuotedArg(args, "channel");
      const message = extractQuotedArg(args, "message");
      if (!to || !message) return Promise.resolve("Missing to or message");
      return slack.sendMessage(to, message.replace(/\\n/g, "\n"));
    },
  },
  // Google Chat
  { name: "gchat_recent", description: "Get recent Google Chat messages from the last 24 hours", execute: () => gchat.getRecentMessages() },
  {
    name: "gchat_search",
    description: "Search Google Chat messages by keyword or person name (query required)",
    execute: (args) => {
      const query = extractQuotedArg(args, "query") ?? args.trim();
      if (!query) return Promise.resolve("Missing query");
      return gchat.searchMessages(query);
    },
  },
  // Web
  { name: "web_search", description: "Search the web for information (query required)", execute: (args) => web.search(args.trim()) },
  { name: "web_fetch", description: "Fetch and summarize a specific URL", execute: (args) => web.fetchUrl(args.trim()) },
  // Files
  { name: "save_document", description: "Save a document to Desktop/Jerry Documents (filename and content required)", execute: (args) => {
    const filename = extractQuotedArg(args, "filename");
    const content = extractQuotedArg(args, "content");
    if (!filename || !content) return Promise.resolve("Missing filename or content");
    return files.saveDocument(filename, content);
  }},
  { name: "read_document", description: "Read a document from Jerry Documents (filename required)", execute: (args) => files.readDocument(args.trim()) },
  { name: "list_documents", description: "List all documents in Jerry Documents folder", execute: () => files.listDocuments() },
  // Google Docs
  { name: "gdoc_create", description: "Create a Google Doc (title and content required)", execute: (args) => {
    const title = extractQuotedArg(args, "title");
    const content = extractQuotedArg(args, "content");
    if (!title || !content) return Promise.resolve("Missing title or content");
    return gdocs.createDoc(title, content);
  }},
  { name: "gdoc_read", description: "Read a Google Doc by ID (docId required — the ID from the URL)", execute: (args) => {
    const docId = extractQuotedArg(args, "docId") ?? args.trim();
    if (!docId) return Promise.resolve("Missing docId");
    return gdocs.readDoc(docId);
  }},
  { name: "gdoc_replace", description: "Find and replace text in a Google Doc (docId, find, and replace required). Read the doc first to get the exact text to match.", execute: (args) => {
    const docId = extractQuotedArg(args, "docId");
    const find = extractQuotedArg(args, "find");
    const replace = extractQuotedArg(args, "replace");
    if (!docId || !find || !replace) return Promise.resolve("Missing docId, find, or replace");
    return gdocs.replaceInDoc(docId, find, replace);
  }},
  { name: "gdoc_append", description: "Append content to an existing Google Doc (docId and content required)", execute: (args) => {
    const docId = extractQuotedArg(args, "docId");
    const content = extractQuotedArg(args, "content");
    if (!docId || !content) return Promise.resolve("Missing docId or content");
    return gdocs.appendToDoc(docId, content);
  }},
  // Google Sheets
  { name: "sheets_read", description: "Read data from a Google Sheet (spreadsheetId and range required, e.g. range=\"Sheet1!A1:D10\")", execute: (args) => {
    const id = extractQuotedArg(args, "spreadsheetId") ?? extractQuotedArg(args, "id");
    const range = extractQuotedArg(args, "range");
    if (!id || !range) return Promise.resolve("Missing spreadsheetId or range");
    return gsheets.readSheet(id, range);
  }},
  { name: "sheets_info", description: "Get spreadsheet metadata — title, sheet names (spreadsheetId required)", execute: (args) => {
    const id = extractQuotedArg(args, "spreadsheetId") ?? extractQuotedArg(args, "id") ?? args.trim();
    if (!id) return Promise.resolve("Missing spreadsheetId");
    return gsheets.getSpreadsheetInfo(id);
  }},
  { name: "sheets_append", description: "Append a row to a Google Sheet (spreadsheetId and values required, comma-separated)", execute: (args) => {
    const id = extractQuotedArg(args, "spreadsheetId") ?? extractQuotedArg(args, "id");
    const values = extractQuotedArg(args, "values");
    if (!id || !values) return Promise.resolve("Missing spreadsheetId or values");
    return gsheets.appendRow(id, values);
  }},
  { name: "sheets_update", description: "Update a specific range in a Google Sheet (spreadsheetId, range, and values as JSON array required)", execute: (args) => {
    const id = extractQuotedArg(args, "spreadsheetId") ?? extractQuotedArg(args, "id");
    const range = extractQuotedArg(args, "range");
    const valuesStr = extractQuotedArg(args, "values");
    if (!id || !range || !valuesStr) return Promise.resolve("Missing spreadsheetId, range, or values");
    try {
      const values = JSON.parse(valuesStr);
      return gsheets.updateRange(id, range, values);
    } catch {
      return Promise.resolve("Invalid values JSON — expected array of arrays, e.g. [[\"a\",\"b\"],[\"c\",\"d\"]]");
    }
  }},
  { name: "sheets_create", description: "Create a new Google Spreadsheet (title required)", execute: (args) => {
    const title = extractQuotedArg(args, "title") ?? args.trim();
    if (!title) return Promise.resolve("Missing title");
    return gsheets.createSpreadsheet(title);
  }},
  { name: "sheets_clear", description: "Clear all values from a range in a Google Sheet (spreadsheetId and range required)", execute: (args) => {
    const id = extractQuotedArg(args, "spreadsheetId") ?? extractQuotedArg(args, "id");
    const range = extractQuotedArg(args, "range");
    if (!id || !range) return Promise.resolve("Missing spreadsheetId or range");
    return gsheets.clearRange(id, range);
  }},
  { name: "sheets_delete_tab", description: "Delete a sheet tab from a spreadsheet (spreadsheetId and sheetName required)", execute: (args) => {
    const id = extractQuotedArg(args, "spreadsheetId") ?? extractQuotedArg(args, "id");
    const name = extractQuotedArg(args, "sheetName") ?? extractQuotedArg(args, "name");
    if (!id || !name) return Promise.resolve("Missing spreadsheetId or sheetName");
    return gsheets.deleteSheet(id, name);
  }},
  { name: "sheets_add_tab", description: "Add a new sheet tab to a spreadsheet (spreadsheetId and sheetName required)", execute: (args) => {
    const id = extractQuotedArg(args, "spreadsheetId") ?? extractQuotedArg(args, "id");
    const name = extractQuotedArg(args, "sheetName") ?? extractQuotedArg(args, "name");
    if (!id || !name) return Promise.resolve("Missing spreadsheetId or sheetName");
    return gsheets.addSheet(id, name);
  }},
  {
    name: "gchat_send",
    description: "Send a Google Chat DM to a team member (to=email, message=text)",
    execute: (args) => {
      const to = extractQuotedArg(args, "to");
      const message = extractQuotedArg(args, "message");
      if (!to || !message) return Promise.resolve("Missing to or message");
      return gchat.sendMessage(to, message);
    },
  },
  // Discord
  { name: "discord_list_channels", description: "List all text channels in the Discord server", execute: () => discord.listChannels() },
  {
    name: "discord_create_channel",
    description: "Create a new Discord text channel (name required, category optional)",
    execute: (args) => {
      const name = extractQuotedArg(args, "name") ?? args.trim();
      const category = extractQuotedArg(args, "category");
      if (!name) return Promise.resolve("Missing channel name");
      return discord.createChannel(name, category ?? undefined);
    },
  },
  {
    name: "discord_delete_channel",
    description: "Delete a Discord text channel (name required)",
    execute: (args) => {
      const name = extractQuotedArg(args, "name") ?? args.trim();
      if (!name) return Promise.resolve("Missing channel name");
      return discord.deleteChannel(name);
    },
  },
  {
    name: "discord_send",
    description: "Send a message to a Discord channel (channel and message required)",
    execute: (args) => {
      const channel = extractQuotedArg(args, "channel");
      const message = extractQuotedArg(args, "message");
      if (!channel || !message) return Promise.resolve("Missing channel or message");
      return discord.sendToChannel(channel, message);
    },
  },
  // Knowledge Base
  {
    name: "kb_read",
    description: "Read a knowledge base file (file required: persona, team, company, goals, playbook)",
    execute: (args) => {
      const file = extractQuotedArg(args, "file") ?? args.trim();
      if (!file) return Promise.resolve("Missing file name");
      const content = readKB(file);
      return Promise.resolve(content ?? `Unknown file: ${file}. Available: ${listKB().join(", ")}`);
    },
  },
  {
    name: "kb_update",
    description: "Update a knowledge base file with new info (file and content required). The system will intelligently merge your content into the existing file.",
    execute: async (args) => {
      const file = extractQuotedArg(args, "file") ?? "";
      const content = extractQuotedArg(args, "content") ?? "";
      if (!file || !content) return "Missing file or content. Usage: [TOOL:kb_update file=\"persona\" content=\"new info here\"]";
      return smartUpdateKB(file, content);
    },
  },
  {
    name: "kb_append",
    description: "Append content to a knowledge base file (file and content required). Adds to the end without modifying existing content.",
    execute: (args) => {
      const file = extractQuotedArg(args, "file") ?? "";
      const content = extractQuotedArg(args, "content") ?? "";
      if (!file || !content) return Promise.resolve("Missing file or content");
      return Promise.resolve(appendKB(file, content) ? `✅ Appended to ${file}.md` : `Unknown file: ${file}`);
    },
  },
];

const toolMap = new Map(TOOL_DEFS.map((t) => [t.name, t]));

const TOOL_TIMEOUT_MS = 30_000;

export async function runTool(name: string, args: string): Promise<string> {
  const tool = toolMap.get(name);
  if (!tool) {
    log.warn({ name }, "Unknown tool requested");
    return `Unknown tool: ${name}`;
  }
  log.info({ tool: name, args }, "Running tool");
  try {
    const result = await Promise.race([
      tool.execute(args),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Tool timed out after ${TOOL_TIMEOUT_MS / 1000}s`)), TOOL_TIMEOUT_MS)
      ),
    ]);
    return result;
  } catch (err) {
    log.error({ err, tool: name }, "Tool execution failed");
    return `Tool error: ${(err as Error).message}`;
  }
}

export function getToolDescriptions(): string {
  return TOOL_DEFS.map((t) => `• [TOOL:${t.name}] — ${t.description}`).join("\n");
}

