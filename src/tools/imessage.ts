import { execFile } from "child_process";
import { existsSync } from "fs";
import { log } from "../core/logger.js";

const HOME = process.env.HOME || "/tmp";
const DB_PATH = `${HOME}/Library/Messages/chat.db`;
const CONTACTS_DB = `${HOME}/Library/Application Support/AddressBook/AddressBook-v22.abcddb`;
const SQLITE_BIN = "/usr/bin/sqlite3";
const TIMEOUT_MS = 15_000;

/** iMessage is macOS-only — check if the database exists */
export const IMESSAGE_AVAILABLE = process.platform === "darwin" && existsSync(DB_PATH);

// VIP contacts — always surface immediately
// Set in .env as comma-separated pairs: IMESSAGE_VIPS=8182777778:Jeff,9514540044:Jackie
const VIP_NUMBERS: Record<string, string> = {};
if (process.env.IMESSAGE_VIPS) {
  for (const pair of process.env.IMESSAGE_VIPS.split(",")) {
    const [number, name] = pair.trim().split(":");
    if (number && name) VIP_NUMBERS[number.trim()] = name.trim();
  }
}

function sqlite(db: string, sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(SQLITE_BIN, [db, sql], { timeout: TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        log.error({ err, stderr }, "sqlite3 failed");
        reject(new Error(`sqlite3 error: ${stderr || err.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/** Build a phone→name lookup from Contacts DB */
async function buildContactMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  // Add VIPs first
  for (const [num, name] of Object.entries(VIP_NUMBERS)) {
    map.set(num.replace(/\D/g, ""), name);
  }

  try {
    const rows = await sqlite(
      CONTACTS_DB,
      `SELECT r.ZFIRSTNAME, r.ZLASTNAME, p.ZFULLNUMBER
       FROM ZABCDRECORD r
       JOIN ZABCDPHONENUMBER p ON p.ZOWNER = r.Z_PK
       WHERE r.ZFIRSTNAME IS NOT NULL OR r.ZLASTNAME IS NOT NULL`
    );
    for (const row of rows.split("\n")) {
      const parts = row.split("|");
      if (parts.length < 3) continue;
      const [first, last, number] = parts;
      const digits = number.replace(/\D/g, "").slice(-10);
      const name = [first, last].filter(Boolean).join(" ");
      if (digits && name) map.set(digits, name);
    }
  } catch {
    // Contacts may not be readable — VIPs still work
  }

  return map;
}

function resolveName(handleId: string, contacts: Map<string, string>): string {
  const digits = handleId.replace(/\D/g, "").slice(-10);
  return contacts.get(digits) ?? handleId;
}

/** Get recent messages from VIP contacts */
export async function getVIPMessages(hoursBack = 24): Promise<string> {
  const contacts = await buildContactMap();
  const since = Math.floor(Date.now() / 1000) - hoursBack * 3600;
  // Convert to Apple epoch (seconds since 2001-01-01)
  const appleEpoch = since - 978307200;

  const vipNumbers = Object.keys(VIP_NUMBERS).map(n => `'%${n}%'`).join(", ");

  const rows = await sqlite(DB_PATH, `
    SELECT
      datetime(m.date/1000000000 + strftime('%s', '2001-01-01'), 'unixepoch', 'localtime') as time,
      h.id as handle,
      m.text,
      m.is_from_me,
      m.is_read
    FROM message m
    JOIN handle h ON m.handle_id = h.ROWID
    WHERE (${Object.keys(VIP_NUMBERS).map(n => `h.id LIKE '%${n}%'`).join(" OR ")})
      AND m.text IS NOT NULL
      AND m.date/1000000000 > ${appleEpoch}
    ORDER BY m.date DESC
    LIMIT 30;
  `);

  if (!rows) return "No VIP messages in the last 24 hours.";

  const lines = ["*VIP Messages:*"];
  for (const row of rows.split("\n")) {
    const [time, handle, text, fromMe, isRead] = row.split("|");
    if (!text) continue;
    const name = resolveName(handle, contacts);
    const direction = fromMe === "1" ? "→ you said" : "→ they said";
    const readFlag = fromMe === "0" && isRead === "0" ? " 🔴 UNREAD" : "";
    lines.push(`[${time}] ${name} ${direction}: ${text}${readFlag}`);
  }
  return lines.join("\n");
}

/** Get unreplied messages — people waiting on Jared */
export async function getUnreplied(hoursBack = 48): Promise<string> {
  const contacts = await buildContactMap();

  // Find chats where the last message is NOT from me, older than 1 hour
  const rows = await sqlite(DB_PATH, `
    SELECT
      h.id as handle,
      datetime(m.date/1000000000 + strftime('%s', '2001-01-01'), 'unixepoch', 'localtime') as time,
      m.text,
      m.is_read,
      CAST((strftime('%s','now') - (m.date/1000000000 + strftime('%s','2001-01-01'))) / 3600 AS INTEGER) as hours_ago
    FROM message m
    JOIN handle h ON m.handle_id = h.ROWID
    WHERE m.is_from_me = 0
      AND m.text IS NOT NULL
      AND m.text != ''
      AND (strftime('%s','now') - (m.date/1000000000 + strftime('%s','2001-01-01'))) / 3600 BETWEEN 1 AND ${hoursBack}
      AND m.ROWID = (
        SELECT MAX(m2.ROWID) FROM message m2
        JOIN handle h2 ON m2.handle_id = h2.ROWID
        WHERE h2.id = h.id AND m2.text IS NOT NULL
      )
    ORDER BY m.date DESC
    LIMIT 25;
  `);

  if (!rows) return "No unreplied messages.";

  const lines = ["*Unreplied messages (people waiting on you):*"];
  for (const row of rows.split("\n")) {
    const [handle, time, text, isRead, hoursAgo] = row.split("|");
    if (!text) continue;
    const name = resolveName(handle, contacts);
    const readFlag = isRead === "0" ? " 🔴 unread" : " 👁 seen";
    const preview = text.length > 80 ? text.slice(0, 80) + "…" : text;
    lines.push(`• *${name}* (${hoursAgo}h ago${readFlag}): ${preview}`);
  }
  return lines.join("\n");
}

/** Search messages by contact name or keyword */
export async function searchMessages(query: string): Promise<string> {
  const contacts = await buildContactMap();

  // Check if query matches a contact name
  let handleFilter = "";
  for (const [digits, name] of contacts.entries()) {
    if (name.toLowerCase().includes(query.toLowerCase())) {
      handleFilter = `AND h.id LIKE '%${digits.slice(-10)}%'`;
      break;
    }
  }

  const textFilter = handleFilter
    ? ""
    : `AND m.text LIKE '%${query.replace(/'/g, "''")}%'`;

  const rows = await sqlite(DB_PATH, `
    SELECT
      datetime(m.date/1000000000 + strftime('%s', '2001-01-01'), 'unixepoch', 'localtime') as time,
      h.id as handle,
      m.text,
      m.is_from_me
    FROM message m
    JOIN handle h ON m.handle_id = h.ROWID
    WHERE m.text IS NOT NULL
      ${handleFilter}
      ${textFilter}
    ORDER BY m.date DESC
    LIMIT 20;
  `);

  if (!rows) return `No messages found for "${query}".`;

  const lines = [`*Messages matching "${query}":*`];
  for (const row of rows.split("\n")) {
    const [time, handle, text, fromMe] = row.split("|");
    if (!text) continue;
    const name = resolveName(handle, contacts);
    const dir = fromMe === "1" ? "You" : name;
    lines.push(`[${time}] ${dir}: ${text}`);
  }
  return lines.join("\n");
}

/** Get recent message activity across all contacts */
export async function getRecentActivity(hoursBack = 24): Promise<string> {
  const contacts = await buildContactMap();
  const appleEpoch = Math.floor(Date.now() / 1000) - hoursBack * 3600 - 978307200;

  const rows = await sqlite(DB_PATH, `
    SELECT
      h.id as handle,
      COUNT(*) as msg_count,
      SUM(CASE WHEN m.is_from_me = 0 AND m.is_read = 0 THEN 1 ELSE 0 END) as unread,
      datetime(MAX(m.date)/1000000000 + strftime('%s', '2001-01-01'), 'unixepoch', 'localtime') as last_time,
      (SELECT m2.text FROM message m2 JOIN handle h2 ON m2.handle_id = h2.ROWID
       WHERE h2.id = h.id AND m2.text IS NOT NULL ORDER BY m2.date DESC LIMIT 1) as last_text
    FROM message m
    JOIN handle h ON m.handle_id = h.ROWID
    WHERE m.date/1000000000 > ${appleEpoch}
      AND m.text IS NOT NULL
    GROUP BY h.id
    ORDER BY MAX(m.date) DESC
    LIMIT 20;
  `);

  if (!rows) return `No iMessage activity in the last ${hoursBack} hours.`;

  const lines = [`*iMessage activity (last ${hoursBack}h):*`];
  for (const row of rows.split("\n")) {
    const [handle, count, unread, lastTime, lastText] = row.split("|");
    if (!handle) continue;
    const name = resolveName(handle, contacts);
    const unreadFlag = parseInt(unread) > 0 ? ` 🔴 ${unread} unread` : "";
    const preview = lastText ? (lastText.length > 60 ? lastText.slice(0, 60) + "…" : lastText) : "";
    lines.push(`• *${name}*${unreadFlag} — "${preview}" (${lastTime})`);
  }
  return lines.join("\n");
}
