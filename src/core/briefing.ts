import { log } from "./logger.js";
import { askJerry } from "./claude.js";
import { runTool } from "../tools/index.js";

type BriefingSection = "emails" | "calendar" | "sprint" | "prs" | "commits" | "gchat" | "slack" | "texts" | "pipeline";

const SECTION_TOOLS: Record<BriefingSection, string> = {
  emails: "gmail_triage",
  calendar: "calendar_agenda",
  sprint: "linear_issues",
  prs: "github_prs",
  commits: "github_commits",
  gchat: "gchat_recent",
  slack: "slack_recent",
  texts: "imessage_unreplied",
  pipeline: "sheets_read",
};

const SECTION_ARGS: Partial<Record<BriefingSection, string>> = {
  pipeline: `spreadsheetId="1umtOd4eufLvvTiVTUcvccXBk7-gMV_NToEMStCXiPKo" range="Sheet1"`,
};

const DEFAULT_SECTIONS: BriefingSection[] = ["emails", "calendar", "sprint", "prs", "commits", "slack", "texts", "pipeline"];

/**
 * Generate a COO briefing by fetching data from tools in parallel and synthesizing with Claude.
 */
export async function generateBriefing(
  sections: BriefingSection[] = DEFAULT_SECTIONS,
  prompt?: string
): Promise<string> {
  log.info({ sections }, "Generating briefing");

  const results = await Promise.allSettled(
    sections.map(async (section) => {
      const toolName = SECTION_TOOLS[section];
      if (!toolName) return { section, data: "unknown section" };
      const args = SECTION_ARGS[section] ?? "";
      const data = await runTool(toolName, args);
      return { section, data };
    })
  );

  const context = results
    .map((r, i) => {
      const section = sections[i].toUpperCase();
      if (r.status === "fulfilled") return `=== ${section} ===\n${r.value.data}`;
      return `=== ${section} ===\nunavailable`;
    })
    .join("\n\n");

  return askJerry(
    prompt ??
      `Generate the 7am standup briefing. JB has standup at 7:30am — he needs to walk in sharp, knowing exactly what's happening. Be concise and direct. No fluff.

*🔴 Urgent* — anything on fire right now (emails, blocked PRs, overdue deals)

*📬 Emails* — only ones needing action today. Skip newsletters and noise.

*📅 Today* — what's on the calendar. Flag anything that conflicts or needs prep.

*💻 Overnight Dev* — what commits merged, what PRs are open, who's blocked, any failed CI. Give JB the dev pulse so he can lead standup.

*📊 Sprint* — what's on track, what's slipping, who needs a nudge.

*💬 Slack* — always include this. Summarize what the engineering team discussed overnight or this morning. Flag any blockers, decisions needed, or things JB should weigh in on. This is where the engineers talk — JB needs to know what's happening.

*🏦 Pipeline* — any deals moving, stalling, or going cold. Deadlines approaching this week?

*✅ Top 3 for today* — the 3 most important things JB must do today to move the business toward $30K MRR. Ranked by revenue impact.

Always think: "Does this get us closer to $30K MRR?"\n\n${context}`
  );
}
