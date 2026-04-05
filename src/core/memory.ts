import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, unlinkSync, watch } from "fs";
import { resolve, join } from "path";
import { log } from "./logger.js";

const MEMORY_DIR = resolve(import.meta.dirname, "../../jerry/memory");
const OTTO_DIR = resolve(import.meta.dirname, "../../jerry");

const CONTEXT_FILES = [
  "persona.md",
  "company.md",
  "team.md",
  "goals.md",
  "playbook.md",
];

if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });

export type MemoryTier = "durable" | "episodic" | "operational";

// Write-through cache — invalidated on any write operation or file change
let _memoriesCache: Memory[] | null = null;
let _personaCache: string | null = null;

function invalidateMemoryCache(): void {
  _memoriesCache = null;
}

export function invalidatePersonaCache(): void {
  _personaCache = null;
}

// Watch otto/ directory for external file changes — auto-invalidate caches
try {
  watch(OTTO_DIR, { recursive: false }, (_event, filename) => {
    if (filename && CONTEXT_FILES.includes(filename)) {
      log.info({ file: filename }, "KB file changed externally, invalidating persona cache");
      invalidatePersonaCache();
    }
  });
  watch(MEMORY_DIR, { recursive: false }, (_event, filename) => {
    if (filename && filename.endsWith(".json")) {
      log.info({ file: filename }, "Memory file changed externally, invalidating memory cache");
      invalidateMemoryCache();
    }
  });
} catch (err) {
  log.warn({ err }, "Failed to set up file watchers — cache will only invalidate on writes");
}

// Loading caps per tier (like Stash AI)
const TIER_CAPS: Record<MemoryTier, number> = {
  durable: 20,
  episodic: 10,
  operational: 5,
};

export interface Memory {
  id: string;
  content: string;
  category: string;
  tier: MemoryTier;
  expiresAt?: string; // ISO date — episodic/operational can expire
  createdAt: string;
  updatedAt: string;
}

/** Load all business context files (cached — invalidated via invalidatePersonaCache) */
export function loadPersona(): string {
  if (_personaCache !== null) return _personaCache;

  const parts: string[] = [];
  for (const file of CONTEXT_FILES) {
    const path = join(OTTO_DIR, file);
    try {
      if (existsSync(path)) {
        const content = readFileSync(path, "utf-8").trim();
        // Skip files that are just templates (only have HTML comments)
        if (content.replace(/<!--[\s\S]*?-->/g, "").trim().length > 50) {
          parts.push(content);
        }
      }
    } catch {
      continue;
    }
  }
  _personaCache = parts.length > 0 ? parts.join("\n\n---\n\n") : "You are Jerry, JB's AI assistant and agent manager.";
  return _personaCache;
}

/** Save a new memory */
export function saveMemory(
  content: string,
  category: string = "general",
  tier: MemoryTier = "durable",
  expiresIn?: number // hours until expiry for episodic/operational
): Memory {
  const id = Date.now().toString(36);
  const memory: Memory = {
    id,
    content,
    category,
    tier,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (expiresIn && tier !== "durable") {
    memory.expiresAt = new Date(Date.now() + expiresIn * 3600_000).toISOString();
  }
  // Default expiry: episodic = 7 days, operational = 24 hours
  if (!memory.expiresAt && tier === "episodic") {
    memory.expiresAt = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();
  }
  if (!memory.expiresAt && tier === "operational") {
    memory.expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
  }
  writeFileSync(join(MEMORY_DIR, `${id}.json`), JSON.stringify(memory, null, 2));
  invalidateMemoryCache();
  log.info({ id, category, tier }, "Memory saved");
  return memory;
}

/** Load all memories, respecting tier caps and expiry (cached) */
export function loadMemories(category?: string): Memory[] {
  try {
    let all: Memory[];
    if (_memoriesCache !== null) {
      all = _memoriesCache;
    } else {
      const files = readdirSync(MEMORY_DIR).filter((f) => f.endsWith(".json"));
      const now = new Date();
      all = [];

      for (const f of files) {
        try {
          const raw = readFileSync(join(MEMORY_DIR, f), "utf-8");
          const mem = JSON.parse(raw) as Memory;
          // Skip expired memories
          if (mem.expiresAt && new Date(mem.expiresAt) < now) continue;
          // Backfill tier for old memories
          if (!mem.tier) mem.tier = "durable";
          all.push(mem);
        } catch {
          continue;
        }
      }
      all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      _memoriesCache = all;
    }

    return category ? all.filter((m) => m.category === category) : all;
  } catch {
    return [];
  }
}

/** Load memories with tier caps applied */
function loadCappedMemories(): { durable: Memory[]; episodic: Memory[]; operational: Memory[] } {
  const all = loadMemories();
  const result = { durable: [] as Memory[], episodic: [] as Memory[], operational: [] as Memory[] };

  for (const m of all) {
    const tier = m.tier || "durable";
    if (result[tier].length < TIER_CAPS[tier]) {
      result[tier].push(m);
    }
  }
  return result;
}

/** Delete a memory by ID */
export function deleteMemory(id: string): boolean {
  const path = join(MEMORY_DIR, `${id}.json`);
  if (existsSync(path)) {
    unlinkSync(path);
    invalidateMemoryCache();
    log.info({ id }, "Memory deleted");
    return true;
  }
  return false;
}

/** Search memories by keyword */
export function searchMemories(query: string): Memory[] {
  const all = loadMemories();
  const lower = query.toLowerCase();
  return all.filter(
    (m) =>
      m.content.toLowerCase().includes(lower) ||
      m.category.toLowerCase().includes(lower)
  );
}

/** Clean up expired memories from disk */
export function cleanExpiredMemories(): number {
  const files = readdirSync(MEMORY_DIR).filter((f) => f.endsWith(".json"));
  const now = new Date();
  let cleaned = 0;

  for (const f of files) {
    try {
      const raw = readFileSync(join(MEMORY_DIR, f), "utf-8");
      const mem = JSON.parse(raw) as Memory;
      if (mem.expiresAt && new Date(mem.expiresAt) < now) {
        unlinkSync(join(MEMORY_DIR, f));
        cleaned++;
      }
    } catch {
      continue;
    }
  }
  if (cleaned > 0) {
    invalidateMemoryCache();
    log.info({ cleaned }, "Expired memories cleaned");
  }
  return cleaned;
}

/** Build memory context string for injection into prompts */
export function buildMemoryContext(): string {
  const { durable, episodic, operational } = loadCappedMemories();
  if (durable.length === 0 && episodic.length === 0 && operational.length === 0) return "";

  let context = "\n=== YOUR MEMORIES ===\n";

  if (durable.length > 0) {
    context += "\n*Known Facts (permanent):*\n";
    for (const m of durable) {
      context += `• ${m.category !== "general" ? `[${m.category}] ` : ""}${m.content}\n`;
    }
  }

  if (episodic.length > 0) {
    context += "\n*Recent Context (temporary):*\n";
    for (const m of episodic) {
      context += `• ${m.content}\n`;
    }
  }

  if (operational.length > 0) {
    context += "\n*Working State:*\n";
    for (const m of operational) {
      context += `• ${m.content}\n`;
    }
  }

  return context;
}
