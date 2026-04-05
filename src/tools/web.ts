import { execFile } from "child_process";
import { log } from "../core/logger.js";

const TIMEOUT_MS = 30_000;

function exec(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        log.error({ err, stderr, cmd, args }, "Web command failed");
        reject(new Error(`${cmd} error: ${stderr || err.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/** Search the web using Claude CLI */
export async function search(query: string): Promise<string> {
  // Use Claude CLI with web search capability
  const result = await exec("claude", [
    "--print",
    "--output-format", "text",
    "--max-turns", "1",
    "--allowedTools", "WebSearch,WebFetch",
    `Search the web for: ${query}\n\nReturn a concise summary of the top results. Include key facts, numbers, and sources.`,
  ]);
  return result;
}

/** Fetch and summarize a specific URL */
export async function fetchUrl(url: string): Promise<string> {
  const result = await exec("claude", [
    "--print",
    "--output-format", "text",
    "--max-turns", "1",
    "--allowedTools", "WebFetch",
    `Fetch this URL and summarize the key content: ${url}`,
  ]);
  return result;
}
