import { execFile } from "child_process";
import { log } from "../core/logger.js";

const GWS_BIN = "gws";
const TIMEOUT_MS = 15_000;

// Cache of email → space ID (populated on first use)
const spaceCache = new Map<string, string>();

function exec(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(GWS_BIN, args, { timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        log.error({ err, stderr, args }, "gws chat command failed");
        reject(new Error(`gws chat error: ${stderr || err.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/** Find or create a DM space with a user by email */
async function getOrCreateDMSpace(email: string): Promise<string> {
  // Check cache first
  const cached = spaceCache.get(email);
  if (cached) return cached;

  // Use spaces.setup to find/create the DM
  const result = await exec([
    "chat", "spaces", "setup",
    "--json", JSON.stringify({
      space: { spaceType: "DIRECT_MESSAGE" },
      memberships: [{
        member: { name: `users/${email}`, type: "HUMAN" }
      }]
    })
  ]);

  const parsed = JSON.parse(result);
  const spaceId = parsed.name;
  if (spaceId) {
    spaceCache.set(email, spaceId);
    log.info({ email, spaceId }, "DM space resolved");
  }
  return spaceId;
}

/** Send a Google Chat DM to a team member by email */
export async function sendMessage(email: string, text: string): Promise<string> {
  const spaceId = await getOrCreateDMSpace(email);
  if (!spaceId) return `Could not find/create DM space for ${email}`;

  const cleanText = text.replace(/\\n/g, "\n");
  const result = await exec([
    "chat", "+send",
    "--space", spaceId,
    "--text", cleanText,
  ]);

  return `Message sent to ${email} via Google Chat`;
}

/** List available Chat spaces */
export async function listSpaces(): Promise<string> {
  return exec(["chat", "spaces", "list"]);
}

/** Search messages across all DM spaces by keyword or sender */
export async function searchMessages(query: string, maxPerSpace = 10): Promise<string> {
  const spacesRaw = await exec(["chat", "spaces", "list"]);
  const spacesData = JSON.parse(spacesRaw);
  const dmSpaces = (spacesData.spaces ?? []).filter(
    (s: any) => s.spaceType === "DIRECT_MESSAGE"
  );

  const lowerQuery = query.toLowerCase();
  const results: string[] = [];

  for (const space of dmSpaces.slice(0, 20)) {
    try {
      const msgsRaw = await exec([
        "chat", "spaces", "messages", "list",
        "--params", JSON.stringify({
          parent: space.name,
          pageSize: maxPerSpace,
          orderBy: "createTime desc",
        }),
      ]);
      const msgsData = JSON.parse(msgsRaw);
      const matches = (msgsData.messages ?? []).filter(
        (m: any) => (m.text ?? "").toLowerCase().includes(lowerQuery)
      );
      for (const msg of matches) {
        const sender = msg.sender?.displayName ?? msg.sender?.name ?? "unknown";
        results.push(`[${space.displayName ?? space.name}] ${sender}: ${msg.text} (${msg.createTime})`);
      }
    } catch {
      continue;
    }
  }

  return results.length > 0
    ? results.join("\n")
    : `No Google Chat messages found matching "${query}".`;
}

/** Get recent unread/recent messages across all DMs */
export async function getRecentMessages(): Promise<string> {
  // Get all DM spaces
  const spacesRaw = await exec(["chat", "spaces", "list"]);
  const spacesData = JSON.parse(spacesRaw);
  const dmSpaces = (spacesData.spaces ?? []).filter(
    (s: any) => s.spaceType === "DIRECT_MESSAGE"
  );

  const results: string[] = [];
  const oneDayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();

  for (const space of dmSpaces.slice(0, 15)) {
    try {
      const msgsRaw = await exec([
        "chat", "spaces", "messages", "list",
        "--params", JSON.stringify({
          parent: space.name,
          pageSize: 5,
          orderBy: "createTime desc",
        }),
      ]);
      const msgsData = JSON.parse(msgsRaw);
      const recent = (msgsData.messages ?? []).filter(
        (m: any) => m.createTime > oneDayAgo
      );

      if (recent.length > 0) {
        for (const msg of recent) {
          const senderType = msg.sender?.type === "HUMAN" ? "user" : "bot";
          results.push(
            `[${space.name}] ${senderType}: ${msg.text ?? "(no text)"} (${msg.createTime})`
          );
        }
      }
    } catch {
      continue;
    }
  }

  return results.length > 0
    ? results.join("\n")
    : "No new Google Chat messages in the last 24 hours.";
}
