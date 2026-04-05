import cron from "node-cron";
import { readFileSync } from "fs";
import { resolve } from "path";
import { log } from "../core/logger.js";
import { askJerry } from "../core/claude.js";
import { runTool } from "../tools/index.js";
import { generateBriefing } from "../core/briefing.js";
import { tick as schedulerTick } from "../core/scheduler.js";
import { cleanExpiredMemories } from "../core/memory.js";
import { sendToOwner } from "../channels/discord.js";

const HEARTBEAT_PATH = resolve(import.meta.dirname, "../../jerry/heartbeat.json");

interface HeartbeatRule {
  id: string;
  name: string;
  cron: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

function loadRules(): HeartbeatRule[] {
  try {
    const data = JSON.parse(readFileSync(HEARTBEAT_PATH, "utf-8"));
    return data.rules.filter((r: HeartbeatRule) => r.enabled);
  } catch (err) {
    log.error({ err }, "Failed to load heartbeat rules");
    return [];
  }
}

// === Job Handlers ===

async function runBriefing(config: Record<string, unknown>): Promise<void> {
  log.info("Running morning briefing");
  try {
    const sections = (config.sections as any[]) ?? undefined;
    const briefing = await generateBriefing(sections);
    await sendToOwner(briefing);
  } catch (err) {
    log.error({ err }, "Briefing failed");
    await sendToOwner("⚠️ Morning briefing failed — check logs.");
  }
}

async function runEmailCheck(): Promise<void> {
  log.info("Running stale email check");
  try {
    const emails = await runTool("gmail_triage", "");
    const analysis = await askJerry(
      `Review these emails. Identify any needing follow-up — sent 48hrs+ ago with no reply, or flagged urgent. Only flag genuinely important ones. If nothing needs attention, respond "All clear."\n\n${emails}`
    );
    if (!analysis.toLowerCase().includes("all clear")) {
      await sendToOwner(`📧 *Follow-up alert*\n\n${analysis}`);
    }
  } catch (err) {
    log.error({ err }, "Email check failed");
  }
}

async function runSprintAudit(): Promise<void> {
  log.info("Running sprint audit");
  try {
    const [sprint, stale, projects, pipeline] = await Promise.allSettled([
      runTool("linear_issues", ""),
      runTool("linear_stale", ""),
      runTool("linear_projects", ""),
      runTool("sheets_read", `spreadsheetId="1umtOd4eufLvvTiVTUcvccXBk7-gMV_NToEMStCXiPKo" range="Sheet1"`),
    ]);

    const context = [
      "=== SPRINT ===", sprint.status === "fulfilled" ? sprint.value : "unavailable",
      "\n=== STALE ===", stale.status === "fulfilled" ? stale.value : "unavailable",
      "\n=== PROJECTS ===", projects.status === "fulfilled" ? projects.value : "unavailable",
      "\n=== PIPELINE (Church deals & must-haves to close) ===", pipeline.status === "fulfilled" ? pipeline.value : "unavailable",
    ].join("\n");

    const analysis = await askJerry(
      `Mid-day sprint audit with PIPELINE ALIGNMENT CHECK.

1. Flag: stalled issues, missed deadlines, unassigned high-priority items.
2. CRITICAL — Cross-reference what the engineering team is building in Linear against the pipeline must-haves to close each church deal. Flag:
   • Must-have features that have NO Linear issue (not being worked on)
   • Sprint work that doesn't map to any pipeline deal (wasted effort?)
   • Deals with urgent deadlines where the required features aren't in progress
3. If there's a misalignment between what we're building and what closes deals, call it out LOUDLY. Tag JB and Jai.

If sprint is healthy AND aligned with pipeline, respond "Sprint on track."\n\n${context}`
    );
    if (!analysis.toLowerCase().includes("on track")) {
      await sendToOwner(`📊 *Sprint audit*\n\n${analysis}`);
    }
  } catch (err) {
    log.error({ err }, "Sprint audit failed");
  }
}

async function runPRReview(): Promise<void> {
  log.info("Running PR review");
  try {
    const prs = await runTool("github_prs", "");
    const analysis = await askJerry(
      `Review open PRs. Flag: stale PRs (3+ days), PRs needing review, failed checks. If all clean, respond "PRs clean."\n\n${prs}`
    );
    if (!analysis.toLowerCase().includes("clean")) {
      await sendToOwner(`🔀 *PR review*\n\n${analysis}`);
    }
  } catch (err) {
    log.error({ err }, "PR review failed");
  }
}

async function runEODSummary(): Promise<void> {
  log.info("Running EOD summary");
  try {
    const [commits, prs, sprint] = await Promise.allSettled([
      runTool("github_commits", ""),
      runTool("github_prs", ""),
      runTool("linear_issues", ""),
    ]);

    const context = [
      "=== TODAY'S COMMITS ===", commits.status === "fulfilled" ? commits.value : "unavailable",
      "\n=== OPEN PRs ===", prs.status === "fulfilled" ? prs.value : "unavailable",
      "\n=== SPRINT ===", sprint.status === "fulfilled" ? sprint.value : "unavailable",
    ].join("\n");

    const summary = await askJerry(
      `End of day summary. What shipped today, what's still open, what needs attention tomorrow morning. Keep it brief.\n\n${context}`
    );
    await sendToOwner(`🌙 *End of Day*\n\n${summary}`);
  } catch (err) {
    log.error({ err }, "EOD summary failed");
  }
}

async function runCommsCheck(): Promise<void> {
  log.info("Running hourly comms check");
  try {
    const [emails, chats, slackMsgs, vipTexts] = await Promise.allSettled([
      runTool("gmail_triage", ""),
      runTool("gchat_recent", ""),
      runTool("slack_recent", ""),
      runTool("imessage_vip", ""),
    ]);

    const context = [
      "=== EMAILS ===",
      emails.status === "fulfilled" ? emails.value : "unavailable",
      "\n=== GOOGLE CHAT ===",
      chats.status === "fulfilled" ? chats.value : "unavailable",
      "\n=== SLACK ===",
      slackMsgs.status === "fulfilled" ? slackMsgs.value : "unavailable",
      "\n=== VIP TEXTS (Jeff + others) ===",
      vipTexts.status === "fulfilled" ? vipTexts.value : "unavailable",
    ].join("\n");

    const analysis = await askJerry(
      `Hourly comms check. Scan emails, chats, and texts for anything that needs JB's attention RIGHT NOW — urgent messages, time-sensitive requests, anything from Jeff or a lead or customer. Skip noise. Only surface what matters. If nothing is urgent, respond exactly "All clear." — nothing else.\n\n${context}`
    );

    if (!analysis.trim().toLowerCase().startsWith("all clear")) {
      await sendToOwner(`📬 *Comms Check*\n\n${analysis}`);
    }
  } catch (err) {
    log.error({ err }, "Comms check failed");
  }
}

async function runPipelineReview(): Promise<void> {
  log.info("Running weekly pipeline review");
  try {
    const [pipeline, sprint, projects] = await Promise.allSettled([
      runTool("sheets_read", `spreadsheetId="1umtOd4eufLvvTiVTUcvccXBk7-gMV_NToEMStCXiPKo" range="Sheet1"`),
      runTool("linear_issues", ""),
      runTool("linear_projects", ""),
    ]);

    const context = [
      "=== PIPELINE (all church deals, stages, must-haves to close) ===",
      pipeline.status === "fulfilled" ? pipeline.value : "unavailable",
      "\n=== CURRENT SPRINT ===",
      sprint.status === "fulfilled" ? sprint.value : "unavailable",
      "\n=== PROJECTS ===",
      projects.status === "fulfilled" ? projects.value : "unavailable",
    ].join("\n");

    const review = await askJerry(
      `Weekly pipeline review. You are a SUPER COO. Analyze every deal and give a brutally honest assessment:

For EACH church deal:
1. *Status* — is this deal progressing, stalling, or dead?
2. *Timeline risk* — are we going to miss the deadline? How many days until it matters?
3. *Build gaps* — what must-have features are NOT being worked on in Linear right now?
4. *Owner accountability* — is the owner (Jeff, Aljean, JB) doing what they need to do? Any follow-ups overdue?
5. *Revenue at stake* — what's the potential MRR if we close?

Then give:
• *Top 3 pipeline risks this week*
• *Top 3 engineering priorities that map to closing deals*
• *Anyone who needs a nudge* (be specific: who, what, by when)

This review goes directly to JB (CEO). Be direct. No sugarcoating.\n\n${context}`
    );
    await sendToOwner(`📋 *Weekly Pipeline Review*\n\n${review}`);
  } catch (err) {
    log.error({ err }, "Pipeline review failed");
    await sendToOwner("⚠️ Weekly pipeline review failed — check logs.");
  }
}

async function runLifeCheck(): Promise<void> {
  log.info("Running life check");
  try {
    const [calendar] = await Promise.allSettled([
      runTool("calendar_agenda", ""),
    ]);

    const calendarData = calendar.status === "fulfilled" ? calendar.value : "unavailable";

    const analysis = await askJerry(
      `Life check for JB. You are his COO but also his accountability partner. Review his calendar and recent patterns, then give him a quick, direct nudge across these areas:

1. **Jackie** — Has he planned anything romantic or intentional for his wife recently? Date night, flowers, a note, surprise, quality time? If not, suggest something specific and easy he can do THIS WEEK. Be creative but realistic for a busy founder/father.

2. **Mountain biking / working out** — Is there time blocked for exercise this week? If not, tell him to block it NOW. Suggest specific days/times based on his calendar gaps. His body is infrastructure. No exercise = declining performance.

3. **Personal time / rest** — Is he overbooked? When was the last time he had margin? If the calendar is packed wall-to-wall, flag it.

4. **Stablish momentum** — Quick pulse: is the company moving forward this week? What's the ONE thing that matters most for Stablish this week?

Keep it short, warm but direct. This isn't a lecture — it's a teammate checking in. End with one specific action for each area.

Calendar:\n${calendarData}`
    );
    await sendToOwner(`🏔️ *Life Check*\n\n${analysis}`);
  } catch (err) {
    log.error({ err }, "Life check failed");
  }
}

async function runBibleStudyPrep(): Promise<void> {
  log.info("Running Bible Study prep reminder");
  try {
    const calendar = await runTool("calendar_agenda", "").catch(() => "unavailable");
    const analysis = await askJerry(
      `It's Wednesday. JB leads Bible Study tomorrow (Thursday) at 7pm at Legacy City Church.

You are his accountability partner. Check in on his prep:

1. **Are you ready to teach?** Ask him directly. Has he studied the passage? Does he have his notes together? Has he done the exegetical work? Don't let him wing it — the people in his study deserve his best.

2. **Have you prayed over it?** Not just "said a prayer" — has he sat with the Lord over this material? Has he asked the Spirit to speak through him? JB's theology (Reformed but Charismatic with a seatbelt) means he believes the Spirit is active in teaching. Act like it.

3. **Spiritual gut check.** This is said with love, brother to brother: Is there anything between you and God right now? Any unconfessed sin? Any area where you're not walking in obedience? A deacon who teaches but isn't living it is building on sand. JB ASKED for this accountability — don't be soft. Be gracious but be honest.

4. **Practical prep.** Suggest he block 1-2 hours today or early tomorrow for final study + prayer time. Based on his calendar below, suggest a specific open slot.

Tone: A brother who loves him and takes his calling seriously. Not a Pharisee — a friend. Gordon Fee would say "the Spirit and the text work together." Michael Heiser would say "do the homework." MacArthur would say "handle the Word accurately." Greg Laurie would say "just be real with people." Channel all four.

Keep it concise. End with a specific ask or action.

Calendar:\n${calendar}`
    );
    await sendToOwner(`📖 *Bible Study Prep*\n\n${analysis}`);
  } catch (err) {
    log.error({ err }, "Bible Study prep reminder failed");
  }
}

async function runDateNightIdeas(): Promise<void> {
  log.info("Running date night ideas");
  try {
    const analysis = await askJerry(
      `Tomorrow is Friday — date night with Jackie. JB wants to keep it interesting, creative, and NOT expensive.

Give him 3 date night ideas for tomorrow. Mix it up every week — don't repeat the same types. Think about:

- **Season/weather** — what works for the time of year right now?
- **Variety** — rotate between: adventure dates, cozy at-home dates, foodie experiences, outdoor activities, creative/artsy dates, surprise/spontaneous dates, nostalgic dates (recreate early relationship moments)
- **Budget** — keep it under $50 ideally. Free is even better. Creativity > money.
- **Zachariah factor** — they have a baby (born 2025). Some ideas should work with baby, some should assume they got a sitter. Note which is which.
- **LA area** — they're in the Studio City / Los Angeles area. Use that.

For each idea:
- What it is (one line)
- Why it's good (one line — what makes it romantic, fun, or meaningful)
- Estimated cost
- Baby-friendly or sitter needed

End with: "Pick one and tell Jackie. She'll love it."

Tone: Hype man energy. Make him excited about dating his wife.`
    );
    await sendToOwner(`💑 *Date Night Ideas for Friday*\n\n${analysis}`);
  } catch (err) {
    log.error({ err }, "Date night ideas failed");
  }
}

const JOB_HANDLERS: Record<string, (config: Record<string, unknown>) => Promise<void>> = {
  briefing: runBriefing,
  email_check: runEmailCheck,
  comms_check: runCommsCheck,
  sprint_audit: runSprintAudit,
  pr_review: runPRReview,
  eod_summary: runEODSummary,
  pipeline_review: runPipelineReview,
  life_check: runLifeCheck,
  bible_study_prep: runBibleStudyPrep,
  date_night_ideas: runDateNightIdeas,
};

// === Startup ===

export function startCronJobs(): void {
  const rules = loadRules();

  for (const rule of rules) {
    const handler = JOB_HANDLERS[rule.type];
    if (!handler) {
      log.warn({ type: rule.type, id: rule.id }, "Unknown heartbeat type");
      continue;
    }
    cron.schedule(rule.cron, () => handler(rule.config));
    log.info({ id: rule.id, name: rule.name, cron: rule.cron }, "Heartbeat rule scheduled");
  }

  // Scheduler tick — every minute, checks for due one-shot tasks
  cron.schedule("* * * * *", async () => {
    const results = await schedulerTick();
    for (const { task, result } of results) {
      await sendToOwner(`⏰ *Scheduled: ${task.description}*\n\n${result}`);
    }
  });
  log.info("Scheduler tick running every minute");

  // Memory cleanup — every 6 hours
  cron.schedule("0 */6 * * *", () => cleanExpiredMemories());
  log.info("Memory cleanup scheduled every 6 hours");
}
