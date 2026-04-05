import { ChannelType, TextChannel, PermissionFlagsBits } from "discord.js";
import { log } from "../core/logger.js";
import { getClient } from "../channels/discord.js";

function getGuild() {
  const client = getClient();
  if (!client) throw new Error("Discord not connected");
  const guild = client.guilds.cache.first();
  if (!guild) throw new Error("No Discord server found");
  return guild;
}

/** Create a text channel, optionally under a category */
export async function createChannel(name: string, categoryName?: string): Promise<string> {
  const guild = getGuild();

  let parent;
  if (categoryName) {
    parent = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === categoryName.toLowerCase()
    );
    if (!parent) {
      // Create the category if it doesn't exist
      parent = await guild.channels.create({
        name: categoryName,
        type: ChannelType.GuildCategory,
      });
      log.info({ category: categoryName }, "Created Discord category");
    }
  }

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: parent?.id,
  });

  log.info({ channel: name, id: channel.id }, "Created Discord channel");
  return `Created #${name} (ID: ${channel.id})${parent ? ` under ${categoryName}` : ""}`;
}

/** Delete a text channel by name */
export async function deleteChannel(name: string): Promise<string> {
  const guild = getGuild();
  const channel = guild.channels.cache.find(
    (c) => c instanceof TextChannel && c.name === name.toLowerCase().replace(/\s+/g, "-")
  );
  if (!channel) return `Channel #${name} not found`;
  await channel.delete();
  log.info({ channel: name }, "Deleted Discord channel");
  return `Deleted #${name}`;
}

/** List all text channels */
export async function listChannels(): Promise<string> {
  const guild = getGuild();
  const channels = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildText)
    .map((c) => {
      const parent = c.parent ? ` (${c.parent.name})` : "";
      return `• #${c.name}${parent}`;
    });
  return channels.length > 0 ? channels.join("\n") : "No text channels found.";
}

/** Send a message to a channel by name */
export async function sendToChannel(channelName: string, message: string): Promise<string> {
  const guild = getGuild();
  const channel = guild.channels.cache.find(
    (c) => c instanceof TextChannel && c.name === channelName.toLowerCase().replace(/\s+/g, "-")
  );
  if (!channel || !(channel instanceof TextChannel)) return `Channel #${channelName} not found`;
  // Claude CLI sometimes returns literal \n instead of real newlines
  const cleaned = message.replace(/\\n/g, "\n");
  await channel.send(cleaned);
  return `Message sent to #${channelName}`;
}
