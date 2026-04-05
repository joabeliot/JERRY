# ARCHITECTURE

## Overview

JERRY is a multi-agent AI system that runs on a single machine. Jerry is the CEO — he talks to JB via Discord, manages Project COOs, orchestrates a shared Core Team, and doubles as a personal assistant. All agent communication happens in Discord channels.

## Agent Hierarchy

```
JB (Human — Discord)
└── Jerry (CEO + Personal Assistant)
    │
    ├── Project COO ("Cal", "Nex", etc — named per project by Jerry)
    │   ├── owns the project's .lore context
    │   ├── lives in the project's Discord channel
    │   ├── breaks work into tasks
    │   └── pulls in Core Team members as needed
    │
    └── Core Team (shared across all projects, one task at a time)
        ├── Ace — Senior Developer
        ├── Scott — QA Engineer
        ├── Sage — Code Reviewer
        ├── Atlas — DevOps Engineer
        └── Nix — Security Auditor
```

## System Flow

```
JB sends message in Discord
        │
        ▼
    Jerry (always listening)
        │
        ├── Personal request? → Handle directly (reminders, calendar, etc.)
        │
        └── Project work? → Route to Project COO
                │
                ▼
        Project COO (in #project-channel)
                │
                ├── Break into tasks
                ├── Pull in Core Team: "@Ace here's your task..."
                ├── Core Team executes in the channel
                ├── COO coordinates handoffs (Ace → Scout → Sage)
                └── Report back to Jerry when done
                        │
                        ▼
                Jerry reports to JB
```

## Priority & Scheduling

- JB sets priority → Jerry holds the queue
- One agent works on one thing at a time — no multitasking
- If two COOs need the same Core Team member, Jerry decides who gets them
- Jerry can run multiple projects in parallel as long as agents aren't double-booked

## Discord Structure

```
Discord Server
├── #jerry          — JB ↔ Jerry direct conversation
├── #webcal         — Project channel (COO: Cal, + Core Team as needed)
├── #next-project   — Project channel (COO: Nex, + Core Team as needed)
└── ...             — Jerry creates channels per project
```

- Jerry creates project channels when a new project is assigned
- COOs are tagged into their project channel
- Core Team members are called in by the COO when needed
- JB can jump into any channel to observe or redirect

## Agent Runtime

**Decided:** Claude CLI subprocesses (`claude --print`). See ADR.md.

Each agent call is a stateless subprocess — context is rebuilt per invocation from `.lore` files, conversation history, and task state. Jerry uses the full system prompt (persona + memories + tools). Crew members use their soul.md + identity.md as system prompt.

## Discord Multi-Bot Architecture

Each agent has its own Discord bot application and token. All 6 clients (Jerry + 5 crew) run in a single Node.js process. Crew bots only start if their token is set in `.env`.

**Routing rules:**
- Jerry: responds to DMs, #jerry channel, or @Jerry mentions
- Crew: only responds when @mentioned by the owner
- All bots ignore `message.author.bot === true` (loop prevention)
- Only the owner (OWNER_DISCORD_ID) can trigger any bot

## Inherited from Otto (to be adapted)

Some subsystems from the original otto-mate codebase are still useful and will be adapted:

### Tool System
- Tool registry with typed definitions (`src/tools/index.ts`)
- Tool loop (max 8 iterations per message, 30s timeout per tool)
- Policy layer: read=allow, write=confirm, unknown=deny
- Tools: Gmail, Calendar, Linear, GitHub, Slack, Google Chat, Google Docs, Sheets, Web, Files, iMessage

### Memory System (3-Tier)
- **Durable** — permanent facts (cap: 20), no expiry
- **Episodic** — conversation context (cap: 10), expires in 7 days
- **Operational** — working state (cap: 5), expires in 24 hours
- Stored as JSON files, write-through cache with file watcher invalidation

### Cron / Proactive System
- Heartbeat rules (configurable via `jerry/heartbeat.json`)
- Scheduler tick for one-shot tasks
- Memory cleanup (expired episodic/operational)

### Knowledge Base
- Markdown files loaded into system prompt: persona.md, company.md, team.md, goals.md, playbook.md
- Updated via commands or AI-generated tags

## External Dependencies

| Dependency | Interface | Purpose |
|---|---|---|
| Claude (CLI/API/SDK — TBD) | TBD | AI reasoning for all agents |
| Discord.js / discord.py | Bot API | All agent communication + JB interface |
| GitHub CLI (`gh`) | Child process | PRs, commits, CI status, issues |
| Docker | CLI | Container management (Atlas) |
| Cloudflare (`cloudflared`) | CLI | Tunnel management for preview deploys (Atlas) |
| GWS CLI (`gws`) | Child process | Gmail, Calendar, Google Chat, Docs, Sheets |
| Linear API | HTTPS (GraphQL) | Sprint issues, projects |
