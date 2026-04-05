import { execFile } from "child_process";
import { log } from "../core/logger.js";

const GWS_BIN = "gws";
const TIMEOUT_MS = 15_000;

function exec(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(GWS_BIN, args, { timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        log.error({ err, stderr, args }, "gws sheets command failed");
        reject(new Error(`gws sheets error: ${stderr || err.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/** Read values from a spreadsheet range */
export async function readSheet(spreadsheetId: string, range: string): Promise<string> {
  const result = await exec([
    "sheets", "+read",
    "--spreadsheet", spreadsheetId,
    "--range", range,
    "--format", "table",
  ]);
  log.info({ spreadsheetId, range }, "Sheet read");
  return result || "No data found in that range.";
}

/** Append a row to a spreadsheet */
export async function appendRow(spreadsheetId: string, values: string): Promise<string> {
  const result = await exec([
    "sheets", "+append",
    "--spreadsheet", spreadsheetId,
    "--values", values,
  ]);
  log.info({ spreadsheetId, values }, "Row appended to sheet");
  return `Row appended successfully.`;
}

/** Update a specific range in a spreadsheet */
export async function updateRange(spreadsheetId: string, range: string, values: string[][]): Promise<string> {
  const result = await exec([
    "sheets", "spreadsheets", "values", "update",
    "--params", JSON.stringify({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
    }),
    "--json", JSON.stringify({ values }),
  ]);
  log.info({ spreadsheetId, range }, "Sheet range updated");
  return `Updated range ${range}.`;
}

/** Get spreadsheet metadata (sheet names, titles) */
export async function getSpreadsheetInfo(spreadsheetId: string): Promise<string> {
  const result = await exec([
    "sheets", "spreadsheets", "get",
    "--params", JSON.stringify({ spreadsheetId }),
  ]);
  try {
    const parsed = JSON.parse(result);
    const title = parsed.properties?.title ?? "(untitled)";
    const sheets = parsed.sheets?.map((s: any) => s.properties?.title).filter(Boolean) ?? [];
    log.info({ spreadsheetId, title }, "Spreadsheet info retrieved");
    return `*${title}*\nSheets: ${sheets.join(", ") || "(none)"}`;
  } catch {
    return result;
  }
}

/** Clear a range in a spreadsheet */
export async function clearRange(spreadsheetId: string, range: string): Promise<string> {
  await exec([
    "sheets", "spreadsheets", "values", "clear",
    "--params", JSON.stringify({ spreadsheetId, range }),
    "--json", "{}",
  ]);
  log.info({ spreadsheetId, range }, "Sheet range cleared");
  return `Cleared range ${range}.`;
}

/** Delete a sheet tab from a spreadsheet */
export async function deleteSheet(spreadsheetId: string, sheetName: string): Promise<string> {
  // First get the sheetId from the name
  const info = await exec([
    "sheets", "spreadsheets", "get",
    "--params", JSON.stringify({ spreadsheetId }),
  ]);
  const parsed = JSON.parse(info);
  const sheet = parsed.sheets?.find((s: any) => s.properties?.title === sheetName);
  if (!sheet) return `Sheet "${sheetName}" not found.`;
  const sheetId = sheet.properties.sheetId;

  await exec([
    "sheets", "spreadsheets", "batchUpdate",
    "--params", JSON.stringify({ spreadsheetId }),
    "--json", JSON.stringify({
      requests: [{ deleteSheet: { sheetId } }],
    }),
  ]);
  log.info({ spreadsheetId, sheetName, sheetId }, "Sheet tab deleted");
  return `Deleted sheet "${sheetName}".`;
}

/** Add a new sheet tab to a spreadsheet */
export async function addSheet(spreadsheetId: string, sheetName: string): Promise<string> {
  await exec([
    "sheets", "spreadsheets", "batchUpdate",
    "--params", JSON.stringify({ spreadsheetId }),
    "--json", JSON.stringify({
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    }),
  ]);
  log.info({ spreadsheetId, sheetName }, "Sheet tab added");
  return `Added sheet "${sheetName}".`;
}

/** Create a new spreadsheet */
export async function createSpreadsheet(title: string): Promise<string> {
  const result = await exec([
    "sheets", "spreadsheets", "create",
    "--json", JSON.stringify({ properties: { title } }),
  ]);
  try {
    const parsed = JSON.parse(result);
    const id = parsed.spreadsheetId;
    const url = parsed.spreadsheetUrl;
    log.info({ spreadsheetId: id, title, url }, "Spreadsheet created");
    return `Created: ${title}\n${url}`;
  } catch {
    return result;
  }
}
