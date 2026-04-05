# TODOS

## P2 — Structured Error Types

**What:** Create typed error classes instead of generic `Error` throws.
**Why:** Tool failures, Claude CLI failures, and API errors all throw generic `Error` with string messages. Can't distinguish timeout from auth failure for retry logic.
**Context:** Would create `ToolTimeoutError`, `ToolAuthError`, `ClaudeError`, `PolicyDeniedError`. Gateway could handle each differently (retry on timeout, abort on auth). Currently all errors are caught generically in `runTool()` and `handleMessage()`.
**Effort:** M (human: ~1 day / CC: ~15 min)
**Depends on:** Nothing.

## P2 — Rate Limiting

**What:** Add concurrency limits to message handling and tool execution.
**Why:** Rapid messages spawn multiple concurrent Claude CLI processes and tool executions with no throttle. Each Claude call costs API credits and spawns a process.
**Context:** `p-queue` is already in dependencies. Use concurrency=1 for message handling (serialize conversations) and concurrency=3 for tools (allow parallel reads). Prevents accidental credit burn and runaway loops. Single-user system makes this less urgent but important for production reliability.
**Effort:** S (human: ~2h / CC: ~10 min)
**Depends on:** Nothing.
