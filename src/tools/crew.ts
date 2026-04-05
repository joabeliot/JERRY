import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { log } from "../core/logger.js";
import { askJerry } from "../core/claude.js";

const CREW_DIR = resolve(import.meta.dirname, "../../crew");

const VALID_CREW = ["ace", "scott", "sage", "atlas", "nix"] as const;
type CrewMember = (typeof VALID_CREW)[number];

const VALID_FILES = ["identity", "soul", "memory"] as const;
type CrewFile = (typeof VALID_FILES)[number];

function isValidCrew(name: string): name is CrewMember {
  return VALID_CREW.includes(name as CrewMember);
}

function isValidFile(file: string): file is CrewFile {
  return VALID_FILES.includes(file as CrewFile);
}

function crewFilePath(crew: CrewMember, file: CrewFile): string {
  return resolve(CREW_DIR, crew, `${file}.md`);
}

/** Read a crew member's knowledge base file */
export function readCrewKB(crew: string, file: string): string {
  if (!isValidCrew(crew)) {
    return `Unknown crew member: ${crew}. Available: ${VALID_CREW.join(", ")}`;
  }
  if (!isValidFile(file)) {
    return `Unknown file type: ${file}. Available: ${VALID_FILES.join(", ")}`;
  }
  const path = crewFilePath(crew, file);
  if (!existsSync(path)) {
    return `File not found: ${crew}/${file}.md`;
  }
  return readFileSync(path, "utf-8");
}

/** Write to a crew member's knowledge base file */
export function writeCrewKB(crew: string, file: string, content: string): string {
  if (!isValidCrew(crew)) {
    return `Unknown crew member: ${crew}. Available: ${VALID_CREW.join(", ")}`;
  }
  if (!isValidFile(file)) {
    return `Unknown file type: ${file}. Available: ${VALID_FILES.join(", ")}`;
  }
  const crewDir = resolve(CREW_DIR, crew);
  if (!existsSync(crewDir)) {
    mkdirSync(crewDir, { recursive: true });
  }
  const path = crewFilePath(crew, file);
  writeFileSync(path, content);
  log.info({ crew, file }, "Crew KB file written");
  return `Saved ${crew}/${file}.md`;
}

/** Smart update a crew member's knowledge base file using Claude */
export async function smartUpdateCrewKB(crew: string, file: string, newInfo: string): Promise<string> {
  if (!isValidCrew(crew)) {
    return `Unknown crew member: ${crew}. Available: ${VALID_CREW.join(", ")}`;
  }
  if (!isValidFile(file)) {
    return `Unknown file type: ${file}. Available: ${VALID_FILES.join(", ")}`;
  }

  const path = crewFilePath(crew, file);
  const current = existsSync(path) ? readFileSync(path, "utf-8") : "";

  // If file doesn't exist or is empty, just write the new content
  if (!current.trim()) {
    writeCrewKB(crew, file, newInfo);
    return `Created ${crew}/${file}.md`;
  }

  const updated = await askJerry(
    `You are updating a crew member's knowledge base file. Here is the current content:\n\n---\n${current}\n---\n\nNew information to incorporate:\n${newInfo}\n\nRewrite the file incorporating the new information. Keep the same markdown structure and headers. Don't remove existing info unless the new info explicitly replaces it. Return ONLY the updated file content, nothing else.`
  );

  // Validate response
  if (!updated || updated.trim().length === 0) {
    log.error({ crew, file }, "Crew KB update rejected: empty response");
    return `Update failed: empty response. ${crew}/${file}.md unchanged.`;
  }
  if (updated.trim().length < current.length * 0.5) {
    log.error({ crew, file }, "Crew KB update rejected: response too short");
    return `Update failed: response too short. ${crew}/${file}.md unchanged.`;
  }

  // Backup before overwrite
  const backupPath = path + ".bak";
  copyFileSync(path, backupPath);

  writeFileSync(path, updated);
  log.info({ crew, file }, "Crew KB updated via smart merge");
  return `Updated ${crew}/${file}.md (backup saved)`;
}

/** List available crew members */
export function listCrew(): string[] {
  return [...VALID_CREW];
}

/** List available file types */
export function listCrewFiles(): string[] {
  return [...VALID_FILES];
}
