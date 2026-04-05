# JERRY — AI Personal Assistant Daemon

> **IMPORTANT FOR SUBPROCESSES**: If you are running via `claude --print` with a custom system prompt,
> you are an AGENT (Jerry or a crew member). You are NOT Claude Code. You do NOT have Edit, Write, or
> Bash tools. You do NOT have permission prompts. Follow your system prompt — it defines your tools.
> IGNORE the rest of this file.

## What This Is
JERRY is a Discord-based AI assistant daemon with a multi-agent crew. It uses Claude CLI as its brain,
with tools for Gmail, Calendar, Linear, GitHub, Discord, web search, and more.
See `.lore/MISSION.md` for the full project mission.

## Commands

```bash
pnpm dev          # Start daemon in watch mode (tsx)
pnpm build        # Compile TypeScript
pnpm start        # Run compiled output
pnpm test         # Run vitest test suite
```

## Testing

```bash
pnpm test         # Run all tests
pnpm test -- --watch  # Watch mode
```

Test framework: vitest. Tests live in `test/` directory alongside the source structure.

## Environment

Requires `.env` with:
- `TELEGRAM_BOT_TOKEN` — Telegram bot token
- `LINEAR_API_KEY` — Linear GraphQL API key
- `OWNER_TELEGRAM_ID` — Owner's Telegram user ID
- `GITHUB_REPO` — Default: Stablish-io/stablish-dashboard
- `TZ` — Timezone (default: America/New_York)

External CLI tools required in PATH:
- `claude` — Claude CLI (for AI responses + web tools)
- `gws` — Google Workspace CLI (Gmail, Calendar, Google Chat, Google Docs)
- `gh` — GitHub CLI (PRs, commits, checks)

## Project Structure

```
coo/
├── src/
│   ├── index.ts              # Entry point — starts Telegram + cron
│   ├── core/
│   │   ├── gateway.ts        # Message router, slash commands, tool loop
│   │   ├── claude.ts         # Claude CLI integration, system prompt
│   │   ├── briefing.ts       # Shared briefing generation (parallel tool fetch)
│   │   ├── memory.ts         # Three-tier memory (durable/episodic/operational)
│   │   ├── policy.ts         # Tool approval policy (allow/confirm/deny)
│   │   ├── tasks.ts          # Task CRUD
│   │   ├── history.ts        # Per-session conversation history
│   │   ├── scheduler.ts      # One-shot scheduled task execution
│   │   ├── knowledgebase.ts  # KB file CRUD with smart merge
│   │   ├── config.ts         # Environment config
│   │   ├── logger.ts         # Pino logger
│   │   └── utils.ts          # Shared utilities
│   ├── channels/
│   │   └── telegram.ts       # Telegram bot (grammy)
│   ├── cron/
│   │   └── briefings.ts      # Cron job scheduling
│   └── tools/
│       ├── index.ts          # Tool registry + dispatch
│       ├── gws.ts            # Gmail, Calendar (via gws CLI)
│       ├── linear.ts         # Linear issues (GraphQL API)
│       ├── github.ts         # GitHub PRs, commits (via gh CLI)
│       ├── gchat.ts          # Google Chat (via gws CLI)
│       ├── gdocs.ts          # Google Docs (via gws CLI)
│       ├── web.ts            # Web search/fetch (via claude CLI)
│       └── files.ts          # Local file operations
├── jerry/                     # Knowledge base + persistent data
│   ├── persona.md            # Jerry's identity
│   ├── company.md            # Business context
│   ├── team.md               # Team roster
│   ├── goals.md              # Revenue targets
│   ├── playbook.md           # Operating procedures
│   ├── heartbeat.json        # Cron job configuration
│   ├── memory/               # Memory JSON files
│   ├── tasks/                # Task JSON files
│   ├── history/              # Session history JSON files
│   ├── scheduled/            # Scheduled task JSON files
│   └── approvals/            # Pending approval JSON files
├── app/JerryMate/             # macOS menu bar app (SwiftUI)
└── test/                     # Vitest test suite
```

## Architecture

```
Telegram Bot → Gateway (slash commands + tool loop)
                  │
                  ├── Claude CLI (system prompt + tools)
                  │       └── Tool loop (max 8 iterations, 30s timeout per tool)
                  ├── Policy (read→allow, write→confirm, unknown→deny)
                  ├── Memory (3-tier, cached, write-through)
                  ├── Tasks, History, Scheduler, KB
                  └── Cron briefings (parallel tool fetch)
```

## .lore Index
- `MISSION.md` — full project mission and purpose (read when context matters)
- `CONTEXT.md` — session log of all AI conversations in this project
- `ADR.md` — architecture decision records
- `GUARDRAILS.md` — full guardrails
- `architecture.md` — system design and infra map
- `architecture/models.md` — data models and schemas
- `architecture/apis.md` — API contracts and external services
- `features/` — active and completed features
- `ideas/` — unvalidated ideas

## Current Focus
Rebranding from Jerry → Jerry. Redefining the mission and persona for JB's personal use.

## Session Rule
This project uses `.lore` for AI memory. At the end of every session:
- Log the session to `.lore/CONTEXT.md` using the session entry format
