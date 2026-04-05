import { Client, GatewayIntentBits, Events, TextChannel } from "discord.js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { log } from "../core/logger.js";
import { handleMessage } from "../core/gateway.js";
import { registerCrewMentions } from "../core/claude.js";
import { env } from "../core/config.js";

// ── Types ──────────────────────────────────────────────────────────────────

export type CrewMember = {
  name: string;
  token: string;
  client: Client;
  userId?: string; // populated after login
};

// ── State ──────────────────────────────────────────────────────────────────

let jerryClient: Client | null = null;
const crew: Map<string, CrewMember> = new Map();

/** Get Jerry's Discord client (used by tools) */
export function getClient(): Client | null {
  return jerryClient;
}

/** Get a crew member's client by name */
export function getCrewClient(name: string): CrewMember | undefined {
  return crew.get(name.toLowerCase());
}

/** Get all connected crew members */
export function getCrewMembers(): CrewMember[] {
  return Array.from(crew.values());
}

// ── Crew Bot Config ────────────────────────────────────────────────────────

const CREW_TOKENS: { name: string; tokenKey: keyof typeof env }[] = [
  { name: "ace", tokenKey: "ACE_BOT_TOKEN" },
  { name: "scott", tokenKey: "SCOTT_BOT_TOKEN" },
  { name: "sage", tokenKey: "SAGE_BOT_TOKEN" },
  { name: "atlas", tokenKey: "ATLAS_BOT_TOKEN" },
  { name: "nix", tokenKey: "NIX_BOT_TOKEN" },
];

// Set of all bot user IDs (populated after login) — used for loop prevention
const botUserIds = new Set<string>();

// ── Conversation Chain Tracking ────────────────────────────────────────────
// Tracks consecutive bot-to-bot messages per channel to prevent infinite loops.
// A human message resets the counter. Chain stops at MAX_CHAIN_DEPTH.
//
// Important: multiple bot listeners fire for the same message. We dedupe by
// message ID so each bot message only increments the counter once.

const MAX_CHAIN_DEPTH = 8;
const channelChainDepth: Map<string, number> = new Map();
const seenBotMessages = new Set<string>(); // message IDs already counted

function isCrewBot(userId: string): boolean {
  return botUserIds.has(userId);
}

/** Record a human message — resets the chain counter */
function resetChain(channelId: string): void {
  channelChainDepth.set(channelId, 0);
}

/**
 * Check if a bot message is within chain limits.
 * Only increments the counter once per unique message (not per listener).
 * Returns true if the bot should respond, false if chain is too deep.
 */
function checkChain(channelId: string, messageId: string): boolean {
  // Only count this message once across all listeners
  if (!seenBotMessages.has(messageId)) {
    seenBotMessages.add(messageId);
    const current = channelChainDepth.get(channelId) ?? 0;
    channelChainDepth.set(channelId, current + 1);

    // Cleanup old message IDs (keep last 100)
    if (seenBotMessages.size > 100) {
      const arr = Array.from(seenBotMessages);
      for (let i = 0; i < arr.length - 100; i++) seenBotMessages.delete(arr[i]);
    }
  }

  const depth = channelChainDepth.get(channelId) ?? 0;
  if (depth > MAX_CHAIN_DEPTH) {
    log.warn({ channelId, depth }, "Chain depth exceeded — pausing bot-to-bot conversation until JB sends a message");
    return false;
  }
  return true;
}

// ── Quiet Mode ─────────────────────────────────────────────────────────────
// When quiet mode is on, bots ignore all bot messages (no bot-to-bot chat).
// JB can toggle this with /quiet in Discord.

let quietMode = false;

export function setQuietMode(on: boolean): void {
  quietMode = on;
  log.info({ quietMode: on }, on ? "Quiet mode ON — bot-to-bot chat disabled" : "Quiet mode OFF — bot-to-bot chat enabled");
}

export function isQuietMode(): boolean {
  return quietMode;
}

// ── Crew Mention Map ───────────────────────────────────────────────────────

/** Build Discord mention strings for all crew + Jerry, for use in system prompts */
export function getCrewMentions(): string {
  const mentions: string[] = [];
  if (jerryClient?.user) {
    mentions.push(`• Jerry: <@${jerryClient.user.id}>`);
  }
  for (const [name, member] of crew) {
    if (member.userId) {
      mentions.push(`• ${name.charAt(0).toUpperCase() + name.slice(1)}: <@${member.userId}>`);
    }
  }
  return mentions.length > 0
    ? `\nCREW DISCORD MENTIONS (use these to @mention crew in Discord messages):\n${mentions.join("\n")}`
    : "";
}

// ── Soul/Identity Loader ───────────────────────────────────────────────────

type CrewPersona = {
  prompt: string;
  allowedTools: string[];
};

function loadCrewPersona(name: string): CrewPersona {
  const crewDir = resolve(import.meta.dirname, `../../crew/${name}`);
  let prompt = "";
  let identityContent = "";
  try {
    prompt += readFileSync(resolve(crewDir, "soul.md"), "utf-8") + "\n\n";
  } catch { /* no soul file */ }
  try {
    identityContent = readFileSync(resolve(crewDir, "identity.md"), "utf-8");
    prompt += identityContent;
  } catch { /* no identity file */ }

  if (!prompt) prompt = `You are ${name}, a member of Jerry's crew.`;

  // Parse allowedTools from identity.md (## allowedTools section)
  const toolMatch = identityContent.match(/^## allowedTools\s*\n(.+)/m);
  const allowedTools = toolMatch
    ? toolMatch[1].split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  return { prompt, allowedTools };
}

// ── Jerry ──────────────────────────────────────────────────────────────────

export async function startDiscord(): Promise<void> {
  if (!env.DISCORD_BOT_TOKEN) {
    log.info("No DISCORD_BOT_TOKEN set — skipping Discord channel");
    return;
  }

  jerryClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
  });

  jerryClient.once(Events.ClientReady, (c) => {
    log.info({ user: c.user.tag }, "Jerry is online in Discord");
    botUserIds.add(c.user.id);
  });

  // Jerry welcomes new members (including crew bots joining)
  jerryClient.on(Events.GuildMemberAdd, async (member) => {
    // Don't welcome yourself
    if (member.id === jerryClient?.user?.id) return;

    const jerryChannel = member.guild.channels.cache.find(
      (c) => c instanceof TextChannel && c.name === "jerry"
    );
    if (jerryChannel instanceof TextChannel) {
      const name = member.displayName || member.user.username;
      await jerryChannel.send(`${name} just joined the server. Welcome aboard. 🤝`);
    }
  });

  // Jerry message handler
  jerryClient.on(Events.MessageCreate, async (message) => {
    const isFromCrewBot = message.author.bot && isCrewBot(message.author.id);
    const isFromOwner = env.OWNER_DISCORD_ID && message.author.id === env.OWNER_DISCORD_ID;
    const isFromRandomBot = message.author.bot && !isFromCrewBot;

    // Ignore random bots (not crew)
    if (isFromRandomBot) return;

    // Only respond to owner or crew bots
    if (!isFromOwner && !isFromCrewBot) return;

    // Human message resets chain depth
    if (isFromOwner && message.channel instanceof TextChannel) {
      resetChain(message.channel.id);
    }

    // Crew bot message — check quiet mode and chain depth
    if (isFromCrewBot) {
      if (quietMode) return; // quiet mode — no bot-to-bot
      if (message.channel instanceof TextChannel) {
        if (!checkChain(message.channel.id, message.id)) return;
      }
    }

    // Jerry responds to:
    // 1. DMs
    // 2. His private channel (#jerry)
    // 3. Any private 1-on-1 channel (#jerry-*)
    // 4. @mention anywhere else
    const isDM = !message.guild;
    const channelName = message.channel instanceof TextChannel ? message.channel.name : "";
    const isPrivateChannel = channelName === "jerry" || channelName.startsWith("jerry-");
    const isMentioned = jerryClient?.user && message.mentions.has(jerryClient.user.id);

    if (!isDM && !isPrivateChannel && !isMentioned) return;

    // Strip all bot @mentions from the text
    let text = message.content;
    for (const botId of botUserIds) {
      text = text.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim();
    }
    if (!text) text = "hey";

    // Add context about who's talking if it's a crew bot
    if (isFromCrewBot) {
      const crewName = Array.from(crew.values()).find((c) => c.userId === message.author.id)?.name ?? "a crew member";
      text = `[Message from ${crewName}]: ${text}`;
    }

    await handleMessage({
      channel: "discord" as any,
      from: message.author.id,
      text,
      replyFn: async (reply) => {
        const chunks = chunkMessage(reply, 2000);
        for (const chunk of chunks) {
          await message.reply(chunk);
        }
      },
    });
  });

  await jerryClient.login(env.DISCORD_BOT_TOKEN);

  // Start crew bots after Jerry is ready
  await startCrewBots();
}

// ── Crew Bots ──────────────────────────────────────────────────────────────

async function startCrewBots(): Promise<void> {
  const startPromises: Promise<void>[] = [];

  for (const { name, tokenKey } of CREW_TOKENS) {
    const token = env[tokenKey];
    if (!token) {
      log.info({ name }, `No ${tokenKey} set — skipping ${name}`);
      continue;
    }
    startPromises.push(startCrewBot(name, token));
  }

  await Promise.allSettled(startPromises);
  log.info({ crewOnline: crew.size }, "Crew bots started");

  // Register crew mentions so Jerry's system prompt knows how to @mention everyone
  registerCrewMentions(getCrewMentions);
}

async function startCrewBot(name: string, token: string): Promise<void> {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, (c) => {
    log.info({ user: c.user.tag, name }, `${name} is online in Discord`);
    botUserIds.add(c.user.id);
    crew.set(name.toLowerCase(), { name, token, client, userId: c.user.id });
  });

  // Crew message handler — responds to @mentions from owner or other crew bots
  client.on(Events.MessageCreate, async (message) => {
    const isFromCrewBot = message.author.bot && isCrewBot(message.author.id);
    const isFromOwner = env.OWNER_DISCORD_ID && message.author.id === env.OWNER_DISCORD_ID;
    const isFromRandomBot = message.author.bot && !isFromCrewBot;

    // Ignore random bots
    if (isFromRandomBot) return;

    // Don't respond to your own messages
    if (message.author.id === client.user?.id) return;

    // Only respond to owner or crew bots
    if (!isFromOwner && !isFromCrewBot) return;

    // Human message resets chain depth
    if (isFromOwner && message.channel instanceof TextChannel) {
      resetChain(message.channel.id);
    }

    // Crew bot message — check quiet mode and chain depth
    if (isFromCrewBot) {
      if (quietMode) return;
      if (message.channel instanceof TextChannel) {
        if (!checkChain(message.channel.id, message.id)) return;
      }
    }

    // Respond when @mentioned OR in private 1-on-1 channel (jerry-{name})
    const channelName = message.channel instanceof TextChannel ? message.channel.name : "";
    const isPrivateChannel = channelName === `jerry-${name}`;
    const isMentioned = client.user && message.mentions.has(client.user.id);
    if (!isPrivateChannel && !isMentioned) return;

    // Strip all bot @mentions from the text
    let text = message.content;
    for (const botId of botUserIds) {
      text = text.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim();
    }
    if (!text) text = "hey";

    // Add context about who's talking
    if (isFromCrewBot) {
      const senderName = Array.from(crew.values()).find((c) => c.userId === message.author.id)?.name ?? "a crew member";
      text = `[Message from ${senderName}]: ${text}`;
    } else if (isFromOwner) {
      text = `[Message from JB]: ${text}`;
    }

    // Jerry is also a crew bot — identify him
    if (message.author.id === jerryClient?.user?.id) {
      text = `[Message from Jerry]: ${text.replace("[Message from a crew member]: ", "")}`;
    }

    const persona = loadCrewPersona(name);

    await handleCrewMessage(name, persona, text, async (reply) => {
      const chunks = chunkMessage(reply, 2000);
      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    });
  });

  await client.login(token);
}

// ── Crew Message Handling ──────────────────────────────────────────────────

/**
 * Handle a message directed at a crew member.
 * Uses Claude CLI with the crew member's persona as system prompt.
 */
async function handleCrewMessage(
  name: string,
  persona: CrewPersona,
  text: string,
  replyFn: (text: string) => Promise<void>
): Promise<void> {
  try {
    // Import ask directly to avoid circular deps with gateway
    const { ask } = await import("../core/claude.js");

    const systemPrompt = [
      persona.prompt,
      "",
      "RULES:",
      "• You are responding in Discord. Keep messages concise.",
      "• Use **bold** for emphasis, bullet points with •",
      "• You are part of Jerry's crew. Jerry is the boss.",
      "• Only respond to what was asked. Don't volunteer extra work.",
      "• If the task is outside your role, say so and suggest who should handle it.",
      `• Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`,
    ].join("\n");

    const response = await ask(text, {
      systemPrompt,
      allowedTools: persona.allowedTools,
    });
    await replyFn(response);
  } catch (err) {
    log.error({ err, name }, `${name} failed to respond`);
    await replyFn(`Something went wrong on my end. Jerry might need to look at this.`);
  }
}

// ── Outbound Messaging ─────────────────────────────────────────────────────

/** Send a message to a specific channel by ID */
export async function sendToChannel(channelId: string, text: string): Promise<void> {
  if (!jerryClient) {
    log.warn("Cannot send — Discord not running");
    return;
  }
  const channel = await jerryClient.channels.fetch(channelId);
  if (channel instanceof TextChannel) {
    const chunks = chunkMessage(text, 2000);
    for (const chunk of chunks) {
      await channel.send(chunk);
    }
  }
}

/** Send a DM to the owner or post in #jerry */
export async function sendToOwner(text: string): Promise<void> {
  if (!jerryClient || !env.OWNER_DISCORD_ID) {
    log.warn("Cannot send to owner — Discord not running or OWNER_DISCORD_ID not set");
    return;
  }

  // Find the #jerry channel first, fall back to DM
  const guilds = jerryClient.guilds.cache;
  for (const guild of guilds.values()) {
    const jerryChannel = guild.channels.cache.find(
      (c) => c instanceof TextChannel && c.name === "jerry"
    );
    if (jerryChannel instanceof TextChannel) {
      const chunks = chunkMessage(text, 2000);
      for (const chunk of chunks) {
        await jerryChannel.send(chunk);
      }
      return;
    }
  }

  // Fallback: DM the owner
  try {
    const user = await jerryClient.users.fetch(env.OWNER_DISCORD_ID);
    const chunks = chunkMessage(text, 2000);
    for (const chunk of chunks) {
      await user.send(chunk);
    }
  } catch (err) {
    log.error({ err }, "Failed to DM owner");
  }
}

// ── Shutdown ───────────────────────────────────────────────────────────────

export async function stopDiscord(): Promise<void> {
  // Stop crew bots first
  for (const [name, member] of crew) {
    log.info({ name }, `Stopping ${name}...`);
    await member.client.destroy();
  }
  crew.clear();
  botUserIds.clear();

  // Stop Jerry
  if (jerryClient) {
    log.info("Stopping Jerry...");
    await jerryClient.destroy();
    jerryClient = null;
    log.info("All Discord bots stopped");
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────

/** Clean up text before sending to Discord */
function cleanForDiscord(text: string): string {
  // Claude CLI sometimes returns literal \n instead of real newlines
  return text.replace(/\\n/g, "\n").trim();
}

/** Split a message into chunks that fit Discord's char limit */
function chunkMessage(text: string, maxLen: number): string[] {
  const cleaned = cleanForDiscord(text);
  if (!cleaned) return []; // guard against empty messages

  if (cleaned.length <= maxLen) return [cleaned];
  const chunks: string[] = [];
  let remaining = cleaned;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n\n", maxLen);
    if (splitAt < maxLen / 2) splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen / 2) splitAt = remaining.lastIndexOf(" ", maxLen);
    if (splitAt < maxLen / 2) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks;
}
