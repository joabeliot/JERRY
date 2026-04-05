# Architecture Decision Records

---

## Core Team Roster — 2026-04-05
**Decided:** Six permanent agents — Jerry (CEO/PA), Ace (Dev), Scott (QA), Sage (Reviewer), Atlas (DevOps), Nix (Security).
**Why:** Covers the full dev lifecycle end to end. Lean enough to run on one machine, complete enough to ship a project without human hands on keyboard. Each role maps to a distinct phase: build → test → review → deploy → secure.
**Rejected:** Separate frontend specialist (Pixel) — Ace handles frontend. Separate docs agent (Scribe) — not core, can add later.

---

## Three-Tier Agent Hierarchy — 2026-04-05
**Decided:** JB → Jerry → Project COO → Core Team. Every project gets a dedicated COO (named by Jerry). The COO owns that project's context and coordinates with the shared Core Team.
**Why:** Without the COO layer, Jerry would manage N agents × M projects directly — doesn't scale. The COO holds project-specific context (.lore), breaks work into tasks, and pulls in the right Core Team member. Jerry stays strategic, COOs stay tactical, Core Team stays execution.
**Rejected:** Spinning up a full team per project (5 agents per project = too many processes, too much resource usage). Single-layer (Jerry → Core Team directly) — doesn't scale past 2 projects.

---

## One Task Per Agent, Priority From JB — 2026-04-05
**Decided:** No agent works on two things at once. Jerry holds the priority queue from JB. If two Project COOs need the same Core Team member, Jerry decides who gets them based on JB's priorities.
**Why:** Context switching kills quality for humans and agents alike. Single-tasking means each agent can go deep on their current work. Jerry as the priority arbiter keeps JB in control without JB having to micromanage scheduling.
**Rejected:** Queue-based (FIFO) — doesn't respect priority. Cloning agents per project — burns resources, can revisit later if parallel throughput becomes a bottleneck.

---

## Discord as Primary Channel — 2026-04-05
**Decided:** Jerry and all agents communicate via Discord. Jerry has a direct channel with JB. Each project gets its own text channel. Agents are called into project channels by the COO.
**Why:** Discord supports multiple channels (one per project), threading, mentions (@Ace), and JB can jump into any channel to observe or redirect. Telegram is single-threaded — can't separate project conversations. Discord also gives visibility: JB can watch agents work in real time without being in the loop.
**Rejected:** Telegram (original otto-mate channel) — single conversation, no project separation. Slack — heavier, no real advantage over Discord for this use case.

---

## Agent Runtime: Claude CLI — 2026-04-05
**Decided:** All agents run as Claude CLI subprocesses (`claude --print` with role-specific system prompts). Each agent call is a stateless subprocess — context is rebuilt per invocation from `.lore` files, conversation history, and task state.
**Why:** Uses JB's existing Anthropic billing via the CLI. Zero additional API setup. The CLI is already proven in the otto-mate codebase. Simplicity and billing convenience outweigh the control benefits of the raw API.
**Rejected:** Claude API direct (more control but requires separate API key management and more code). Claude Agent SDK (purpose-built for multi-agent but newer, and doesn't leverage existing CLI billing).
**Trade-offs accepted:** Stateless per call — each agent invocation must rebuild full context from disk (`.lore`, history, task state). No streaming. Tag-based tool parsing (`[TOOL:name]`) instead of native tool_use format. Can migrate to API/SDK later if CLI becomes a bottleneck.

---

## Multi-Brain Sequential with Cost Gate — 2026-04-05
**Decided:** Each crew member gets their own Claude CLI subprocess (separate brain, separate system prompt, separate tool permissions). Agents run sequentially — one at a time. Jerry controls who gets to spin up based on JB's priority and cost awareness.
**Why:** A single brain (Jerry wearing masks) can't do parallel work and defeats the purpose of a team. Multiple brains give each agent real independence — their own personality, skills, and context. Sequential execution keeps costs predictable during development. Jerry as cost gatekeeper means JB stays in control of billing without micromanaging every call.
**Rejected:** Single brain / webhook-only (no real parallelism, agents can't have distinct skills). Full parallel from day one (burns budget during development). No cost tracking (JB loses visibility into spend).
**Future:** Can upgrade to parallel execution when budget allows — the architecture supports it since each agent is already an independent subprocess.

---

## Agent Discord Identity via Separate Bots — 2026-04-05
**Decided:** Each crew member has their own Discord bot application (own token, own identity). All 6 clients run in a single Node.js process. Crew bots only respond when @mentioned by the owner. All bots ignore bot messages to prevent loops.
**Why:** Separate bots can receive messages and have real conversations — webhooks can only send, not listen. Each agent needs to be @mentionable and able to reply in character. One process keeps resource usage sane.
**Rejected:** Webhooks (can't listen to messages, only post). Single bot identity for all agents (can't tell who's talking, can't have real conversations with individual agents).
