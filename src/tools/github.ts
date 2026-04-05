import { execFile } from "child_process";
import { log } from "../core/logger.js";

const GH_BIN = "gh";
const TIMEOUT_MS = 30_000;
const DEFAULT_REPO = process.env.GITHUB_REPO ?? "Stablish-io/stablishChurch";
const GITHUB_ORG = process.env.GITHUB_ORG ?? "Stablish-io";

function exec(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(GH_BIN, args, { timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        log.error({ err, stderr, args }, "gh command failed");
        reject(new Error(`gh error: ${stderr || err.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/** List open PRs across the whole org */
export async function listPRs(repo?: string): Promise<string> {
  if (repo) {
    return exec([
      "pr", "list",
      "--repo", repo,
      "--state", "open",
      "--json", "number,title,author,createdAt,reviewDecision,mergeable,headRefName",
    ]);
  }
  // Org-wide search for all open PRs
  return exec([
    "search", "prs",
    "--owner", GITHUB_ORG,
    "--state", "open",
    "--json", "number,title,author,createdAt,repository,headRefName",
    "--limit", "20",
  ]);
}

/** Get a specific PR with details */
export async function getPR(number: string, repo?: string): Promise<string> {
  return exec([
    "pr", "view", number,
    "--repo", repo ?? DEFAULT_REPO,
    "--json", "number,title,author,body,createdAt,reviewDecision,mergeable,additions,deletions,files,comments",
  ]);
}

/** Get PR diff */
export async function getPRDiff(number: string, repo?: string): Promise<string> {
  const diff = await exec([
    "pr", "diff", number,
    "--repo", repo ?? DEFAULT_REPO,
  ]);
  // Truncate very large diffs
  return diff.length > 5000 ? diff.slice(0, 5000) + "\n...(truncated)" : diff;
}

/** List recent commits across the org's most active repos */
export async function listCommits(branch?: string, repo?: string): Promise<string> {
  if (repo) {
    const args = [
      "api", `repos/${repo}/commits`,
      "--jq", '.[0:10] | .[] | {sha: .sha[0:7], message: .commit.message, author: .commit.author.name, date: .commit.author.date}',
    ];
    if (branch) args.push("-f", `sha=${branch}`);
    return exec(args);
  }
  // Search recent commits across org
  return exec([
    "search", "commits",
    "--owner", GITHUB_ORG,
    "--json", "sha,message,author,committer,repository",
    "--limit", "20",
    "--sort", "committer-date",
  ]);
}

/** Get repo deploy/CI status */
export async function getDeployStatus(repo?: string): Promise<string> {
  return exec([
    "run", "list",
    "--repo", repo ?? DEFAULT_REPO,
    "--limit", "5",
    "--json", "databaseId,displayTitle,status,conclusion,createdAt,headBranch",
  ]);
}

/** List open issues */
export async function listIssues(repo?: string): Promise<string> {
  return exec([
    "issue", "list",
    "--repo", repo ?? DEFAULT_REPO,
    "--state", "open",
    "--limit", "10",
    "--json", "number,title,author,labels,createdAt,assignees",
  ]);
}

/** Get checks on a PR */
export async function getPRChecks(number: string, repo?: string): Promise<string> {
  return exec([
    "pr", "checks", number,
    "--repo", repo ?? DEFAULT_REPO,
  ]);
}
