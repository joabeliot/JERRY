# Data Models

All models are stored as individual JSON files on disk — no database.

## Memory (`src/core/memory.ts`)

```typescript
interface Memory {
  id: string;          // base36 timestamp
  content: string;
  category: string;    // e.g. "general", "pipeline", "team", "product"
  tier: "durable" | "episodic" | "operational";
  expiresAt?: string;  // ISO date — auto-set for episodic (7d) and operational (24h)
  createdAt: string;
  updatedAt: string;
}
```

Stored in: `otto/memory/{id}.json`

## Task (`src/core/tasks.ts`)

```typescript
interface Task {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  priority: "high" | "medium" | "low";
  assignee?: string;
  dueDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
```

Stored in: `otto/tasks/{id}.json`

## PendingApproval (`src/core/policy.ts`)

```typescript
interface PendingApproval {
  id: string;
  tool: string;
  args: string;
  description: string;
  createdAt: string;
  context?: {
    originalPrompt: string;
    historyContext: string;
    priorToolResults: { tool: string; result: string }[];
    sessionId: string;
  };
}
```

Stored in: `otto/approvals/{id}.json`

## ChatMessage / Session (`src/core/history.ts`)

```typescript
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolResults?: { tool: string; result: string }[];
  timestamp: string;
}

interface Session {
  id: string;
  messages: ChatMessage[];
}
```

Stored in: `otto/history/{channel}_{userId}.json`

## ScheduledTask (`src/core/scheduler.ts`)

```typescript
interface ScheduledTask {
  id: string;
  action: string;
  payload: string;
  runAt: string;       // ISO date
  description: string;
  status: "pending" | "done";
  createdAt: string;
}
```

Stored in: `otto/scheduled/{id}.json`

## HeartbeatRule (`otto/heartbeat.json`)

```typescript
interface HeartbeatRule {
  id: string;
  name: string;
  cron: string;        // cron expression
  type: string;        // maps to JOB_HANDLERS
  enabled: boolean;
  config: Record<string, unknown>;
}
```
