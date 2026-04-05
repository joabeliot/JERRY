import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { log } from "../core/logger.js";

const JERRY_DOCS = "/Users/joabeliot/projects/personal/JERRY/jerry";

// Ensure output directory exists
if (!existsSync(JERRY_DOCS)) mkdirSync(JERRY_DOCS, { recursive: true });

/** Save a document to the Jerry knowledge base folder */
export async function saveDocument(filename: string, content: string): Promise<string> {
  // Sanitize filename
  const clean = filename.replace(/[^a-zA-Z0-9_\-. ]/g, "").trim();
  if (!clean) return "Invalid filename";

  const path = resolve(JERRY_DOCS, clean);
  const cleanContent = content.replace(/\\n/g, "\n");
  writeFileSync(path, cleanContent);
  log.info({ path, filename: clean }, "Document saved");
  return `Saved to jerry/${clean}`;
}

/** Read a document from Jerry Documents */
export async function readDocument(filename: string): Promise<string> {
  const clean = filename.replace(/[^a-zA-Z0-9_\-. ]/g, "").trim();
  const path = resolve(JERRY_DOCS, clean);
  if (!existsSync(path)) return `File not found: ${clean}`;
  return readFileSync(path, "utf-8");
}

/** List documents in Jerry Documents */
export async function listDocuments(): Promise<string> {
  const { readdirSync, statSync } = await import("fs");
  if (!existsSync(JERRY_DOCS)) return "No documents yet.";
  const files = readdirSync(JERRY_DOCS);
  if (files.length === 0) return "No documents yet.";
  return files.map((f) => {
    const stat = statSync(resolve(JERRY_DOCS, f));
    const size = stat.size > 1024 ? `${(stat.size / 1024).toFixed(1)}KB` : `${stat.size}B`;
    return `• ${f} (${size})`;
  }).join("\n");
}
