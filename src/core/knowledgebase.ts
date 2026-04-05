import { readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";
import { resolve } from "path";
import { log } from "./logger.js";
import { askJerry } from "./claude.js";
import { invalidatePersonaCache } from "./memory.js";

const OTTO_DIR = resolve(import.meta.dirname, "../../jerry");

const EDITABLE_FILES: Record<string, string> = {
  company: "company.md",
  team: "team.md",
  goals: "goals.md",
  playbook: "playbook.md",
  persona: "persona.md",
};

/** Read a knowledge base file */
export function readKB(name: string): string | null {
  const filename = EDITABLE_FILES[name];
  if (!filename) return null;
  const path = resolve(OTTO_DIR, filename);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

/** Overwrite a knowledge base file */
export function writeKB(name: string, content: string): boolean {
  const filename = EDITABLE_FILES[name];
  if (!filename) return false;
  const path = resolve(OTTO_DIR, filename);
  writeFileSync(path, content);
  invalidatePersonaCache();
  log.info({ name, filename }, "Knowledge base updated");
  return true;
}

/** Append to a knowledge base file */
export function appendKB(name: string, content: string): boolean {
  const filename = EDITABLE_FILES[name];
  if (!filename) return false;
  const path = resolve(OTTO_DIR, filename);
  const existing = existsSync(path) ? readFileSync(path, "utf-8") : "";
  writeFileSync(path, existing.trimEnd() + "\n\n" + content + "\n");
  invalidatePersonaCache();
  log.info({ name, filename }, "Knowledge base appended");
  return true;
}

/** List available knowledge base files */
export function listKB(): string[] {
  return Object.keys(EDITABLE_FILES);
}

/**
 * Ask Claude to intelligently update a KB file based on new info.
 * This merges new information into existing content without losing anything.
 */
export async function smartUpdateKB(name: string, newInfo: string): Promise<string> {
  const current = readKB(name);
  if (!current) return `Unknown file: ${name}. Available: ${listKB().join(", ")}`;

  const updated = await askJerry(
    `You are updating a knowledge base file. Here is the current content:\n\n---\n${current}\n---\n\nNew information to incorporate:\n${newInfo}\n\nRewrite the file incorporating the new information. Keep the same markdown structure and headers. Don't remove existing info unless the new info explicitly replaces it. Return ONLY the updated file content, nothing else.`
  );

  // Validate: response must be non-empty and at least 50% of original length
  if (!updated || updated.trim().length === 0) {
    log.error({ name }, "KB update rejected: empty response from Claude");
    return `⚠️ Update failed — Claude returned empty content. ${name}.md unchanged.`;
  }
  if (updated.trim().length < current.length * 0.5) {
    log.error({ name, originalLen: current.length, updatedLen: updated.trim().length }, "KB update rejected: response too short");
    return `⚠️ Update failed — Claude returned suspiciously short content (${updated.trim().length} chars vs ${current.length} original). ${name}.md unchanged.`;
  }

  // Backup before overwrite
  const filename = EDITABLE_FILES[name];
  const filePath = resolve(OTTO_DIR, filename);
  const backupPath = resolve(OTTO_DIR, `${filename}.bak`);
  copyFileSync(filePath, backupPath);

  writeKB(name, updated);
  return `✅ Updated ${name}.md (backup saved as ${filename}.bak)`;
}
