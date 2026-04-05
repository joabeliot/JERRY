import { execFile } from "child_process";
import { log } from "../core/logger.js";

const GWS_BIN = "gws";
const TIMEOUT_MS = 30_000;

function exec(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(GWS_BIN, args, { timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        log.error({ err, stderr, args }, "gws command failed");
        reject(new Error(`gws error: ${stderr || err.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/** Triage unread emails — returns JSON summary */
export async function gmailTriage(): Promise<string> {
  return exec(["gmail", "+triage"]);
}

/** List recent messages */
export async function gmailList(maxResults = 10): Promise<string> {
  return exec(["gmail", "+triage", `--max=${maxResults}`, "--format=json"]);
}

/** Get a specific message */
export async function gmailGet(messageId: string): Promise<string> {
  return exec(["gmail", "+read", `--id=${messageId}`, "--headers", "--format=json"]);
}

/** Search emails by query (e.g. "from:aljean", "subject:proposal", "is:unread") */
export async function gmailSearch(query: string, maxResults = 5): Promise<string> {
  return exec(["gmail", "+triage", `--max=${maxResults}`, `--query=${query}`, "--format=json"]);
}

/** Send an email */
export async function gmailSend(to: string, subject: string, body: string): Promise<string> {
  // Convert literal \n to actual newlines
  const cleanBody = body.replace(/\\n/g, "\n");
  return exec(["gmail", "+send", `--to=${to}`, `--subject=${subject}`, `--body=${cleanBody}`]);
}

/** Reply to an email */
export async function gmailReply(messageId: string, body: string): Promise<string> {
  const cleanBody = body.replace(/\\n/g, "\n");
  return exec(["gmail", "+reply", `--message-id=${messageId}`, `--body=${cleanBody}`]);
}

/** Get today's calendar agenda */
export async function calendarAgenda(): Promise<string> {
  return exec(["calendar", "+agenda"]);
}

/** Create a calendar event */
export async function calendarCreate(
  summary: string,
  start: string,
  end: string,
  description?: string
): Promise<string> {
  const args = [
    "calendar",
    "+insert",
    `--summary=${summary}`,
    `--start=${start}`,
    `--end=${end}`,
  ];
  if (description) args.push(`--description=${description}`);
  return exec(args);
}
