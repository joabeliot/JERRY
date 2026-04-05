import { log } from "../core/logger.js";

const SLACK_API = "https://slack.com/api";

function token(): string {
  const t = process.env.SLACK_BOT_TOKEN;
  if (!t) throw new Error("SLACK_BOT_TOKEN not set");
  return t;
}

async function slackApi(method: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${SLACK_API}/${method}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token()}` },
  });
  const data = await res.json() as any;
  if (!data.ok) throw new Error(`Slack API error: ${data.error}`);
  return data;
}

async function slackPost(method: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json() as any;
  if (!data.ok) throw new Error(`Slack API error: ${data.error}`);
  return data;
}

/** Get recent messages from a channel by name (defaults to #general) */
export async function readChannel(channelName = "general", limit = 20): Promise<string> {
  // Find channel ID
  const list = await slackApi("conversations.list", { types: "public_channel,private_channel", limit: "200" });
  const channel = list.channels.find((c: any) =>
    c.name === channelName.replace(/^#/, "")
  );
  if (!channel) return `Channel #${channelName} not found or bot not invited.`;

  const history = await slackApi("conversations.history", {
    channel: channel.id,
    limit: String(limit),
  });

  if (!history.messages?.length) return `No messages in #${channelName}.`;

  // Resolve user IDs to names
  const userCache = new Map<string, string>();
  async function userName(userId: string): Promise<string> {
    if (userCache.has(userId)) return userCache.get(userId)!;
    try {
      const info = await slackApi("users.info", { user: userId });
      const name = info.user.real_name ?? info.user.name;
      userCache.set(userId, name);
      return name;
    } catch {
      return userId;
    }
  }

  const lines: string[] = [`#${channelName} — last ${history.messages.length} messages:`];
  for (const msg of [...history.messages].reverse()) {
    if (!msg.text) continue;
    const sender = msg.user ? await userName(msg.user) : "bot";
    const time = new Date(Number(msg.ts) * 1000).toLocaleString("en-US", { timeZone: process.env.TZ ?? "America/New_York" });
    lines.push(`[${time}] ${sender}: ${msg.text}`);
  }
  return lines.join("\n");
}

/** Search messages across all channels the bot is in */
export async function searchMessages(query: string): Promise<string> {
  const list = await slackApi("conversations.list", { types: "public_channel,private_channel", limit: "200" });
  const botChannels = (list.channels as any[]).filter((c) => c.is_member);

  if (!botChannels.length) return "Jerry is not in any Slack channels. Invite it with /invite @otto.";

  const lowerQuery = query.toLowerCase();
  const results: string[] = [];

  const userCache = new Map<string, string>();
  async function userName(userId: string): Promise<string> {
    if (userCache.has(userId)) return userCache.get(userId)!;
    try {
      const info = await slackApi("users.info", { user: userId });
      const name = info.user.real_name ?? info.user.name;
      userCache.set(userId, name);
      return name;
    } catch { return userId; }
  }

  for (const channel of botChannels.slice(0, 10)) {
    try {
      const history = await slackApi("conversations.history", { channel: channel.id, limit: "100" });
      for (const msg of history.messages ?? []) {
        if ((msg.text ?? "").toLowerCase().includes(lowerQuery)) {
          const sender = msg.user ? await userName(msg.user) : "bot";
          const time = new Date(Number(msg.ts) * 1000).toLocaleString("en-US", { timeZone: process.env.TZ ?? "America/New_York" });
          results.push(`[#${channel.name} | ${time}] ${sender}: ${msg.text}`);
        }
      }
    } catch { continue; }
  }

  return results.length > 0
    ? results.join("\n")
    : `No Slack messages found matching "${query}".`;
}

/** Send a message to a channel or user */
export async function sendMessage(channelOrUser: string, text: string): Promise<string> {
  // If it looks like an email, find the user first
  let target = channelOrUser;
  if (channelOrUser.includes("@") && !channelOrUser.startsWith("#")) {
    try {
      const res = await slackApi("users.lookupByEmail", { email: channelOrUser });
      target = res.user.id;
    } catch {
      return `Could not find Slack user with email ${channelOrUser}`;
    }
  }

  await slackPost("chat.postMessage", { channel: target, text });
  return `Message sent to ${channelOrUser}`;
}

/** Get a summary of recent activity across all channels the bot is in */
export async function getRecentActivity(hoursBack = 24): Promise<string> {
  const list = await slackApi("conversations.list", { types: "public_channel,private_channel", limit: "200" });
  const botChannels = (list.channels as any[]).filter((c) => c.is_member);

  if (!botChannels.length) return "Jerry is not in any Slack channels. Invite it with /invite @otto.";

  const since = (Date.now() / 1000) - (hoursBack * 3600);
  const userCache = new Map<string, string>();
  async function userName(userId: string): Promise<string> {
    if (userCache.has(userId)) return userCache.get(userId)!;
    try {
      const info = await slackApi("users.info", { user: userId });
      const name = info.user.real_name ?? info.user.name;
      userCache.set(userId, name);
      return name;
    } catch { return userId; }
  }

  const sections: string[] = [];

  for (const channel of botChannels) {
    try {
      const history = await slackApi("conversations.history", {
        channel: channel.id,
        oldest: String(since),
        limit: "50",
      });
      const msgs = (history.messages ?? []).filter((m: any) => m.text);
      if (!msgs.length) continue;

      const lines: string[] = [`#${channel.name}:`];
      for (const msg of [...msgs].reverse()) {
        const sender = msg.user ? await userName(msg.user) : "bot";
        lines.push(`  ${sender}: ${msg.text}`);
      }
      sections.push(lines.join("\n"));
    } catch { continue; }
  }

  return sections.length > 0
    ? sections.join("\n\n")
    : `No Slack activity in the last ${hoursBack} hours.`;
}
