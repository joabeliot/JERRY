import { config } from "dotenv";
import { z } from "zod";
import { resolve } from "path";

config({ path: resolve(import.meta.dirname, "../../.env") });

const schema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1),
  OWNER_DISCORD_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().default(""),
  // Crew bot tokens (optional — bots only start if token is set)
  ACE_BOT_TOKEN: z.string().default(""),
  SCOTT_BOT_TOKEN: z.string().default(""),
  SAGE_BOT_TOKEN: z.string().default(""),
  ATLAS_BOT_TOKEN: z.string().default(""),
  NIX_BOT_TOKEN: z.string().default(""),
  LINEAR_API_KEY: z.string().default(""),
  GITHUB_REPO: z.string().default(""),
  TZ: z.string().default("America/New_York"),
  // Root directory for agent file access (defaults to home dir)
  AGENT_ROOT_DIR: z.string().default("/Users/joabeliot"),
});

export const env = schema.parse(process.env);
