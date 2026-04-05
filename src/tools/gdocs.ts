import { execFile } from "child_process";
import { log } from "../core/logger.js";

const GWS_BIN = "gws";
const TIMEOUT_MS = 15_000;

function exec(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(GWS_BIN, args, { timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        log.error({ err, stderr, args }, "gws docs command failed");
        reject(new Error(`gws docs error: ${stderr || err.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/** Create a new Google Doc and write content to it */
export async function createDoc(title: string, content: string): Promise<string> {
  // Create the doc
  const createResult = await exec([
    "docs", "documents", "create",
    "--json", JSON.stringify({ title }),
  ]);
  const parsed = JSON.parse(createResult);
  const docId = parsed.documentId;

  if (!docId) return "Failed to create document";

  // Write content to it
  const cleanContent = content.replace(/\\n/g, "\n");
  await exec([
    "docs", "+write",
    "--document", docId,
    "--text", cleanContent,
  ]);

  const url = `https://docs.google.com/document/d/${docId}/edit`;
  log.info({ docId, title, url }, "Google Doc created");
  return `Created: ${title}\n${url}`;
}

/** Read the content of a Google Doc */
export async function readDoc(docId: string): Promise<string> {
  const result = await exec([
    "docs", "documents", "get",
    "--params", JSON.stringify({ documentId: docId }),
  ]);
  try {
    const parsed = JSON.parse(result);
    // Extract plain text from the document body
    const body = parsed.body?.content;
    if (!body || !Array.isArray(body)) return "Document is empty.";
    const text = body
      .flatMap((block: any) =>
        block.paragraph?.elements?.map((el: any) => el.textRun?.content ?? "") ?? []
      )
      .join("");
    const title = parsed.title ?? "(untitled)";
    log.info({ docId, title }, "Google Doc read");
    return `*${title}*\n\n${text.trim()}`;
  } catch {
    return result; // Return raw if parsing fails
  }
}

/** Replace text in a Google Doc (find and replace) */
export async function replaceInDoc(docId: string, find: string, replace: string): Promise<string> {
  const cleanFind = find.replace(/\\n/g, "\n");
  const cleanReplace = replace.replace(/\\n/g, "\n");
  const result = await exec([
    "docs", "documents", "batchUpdate",
    "--params", JSON.stringify({ documentId: docId }),
    "--json", JSON.stringify({
      requests: [{
        replaceAllText: {
          containsText: { text: cleanFind, matchCase: true },
          replaceText: cleanReplace,
        },
      }],
    }),
  ]);
  try {
    const parsed = JSON.parse(result);
    const count = parsed.replies?.[0]?.replaceAllText?.occurrencesChanged ?? 0;
    log.info({ docId, find: cleanFind.slice(0, 50), count }, "Google Doc text replaced");
    return count > 0
      ? `Replaced ${count} occurrence(s) in document.`
      : `No matches found for "${cleanFind.slice(0, 80)}". Try reading the doc first to get the exact text.`;
  } catch {
    return result;
  }
}

/** Append content to an existing Google Doc */
export async function appendToDoc(docId: string, content: string): Promise<string> {
  const cleanContent = content.replace(/\\n/g, "\n");
  await exec([
    "docs", "+write",
    "--document", docId,
    "--text", cleanContent,
  ]);
  return `Content appended to document ${docId}`;
}
