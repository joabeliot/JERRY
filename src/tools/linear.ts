import { env } from "../core/config.js";
import { log } from "../core/logger.js";

const LINEAR_API = "https://api.linear.app/graphql";

async function query(gql: string, variables?: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: env.LINEAR_API_KEY,
    },
    body: JSON.stringify({ query: gql, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    log.error({ status: res.status, body: text }, "Linear API error");
    throw new Error(`Linear API ${res.status}: ${text}`);
  }

  const json = await res.json() as { data: unknown; errors?: unknown[] };
  if (json.errors) {
    log.error({ errors: json.errors }, "Linear GraphQL errors");
    throw new Error(`Linear GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

/** Get active sprint issues with status */
export async function getActiveSprintIssues(): Promise<string> {
  const data = await query(`
    query {
      cycles(filter: { isActive: { eq: true } }, first: 1) {
        nodes {
          name
          startsAt
          endsAt
          progress
          issues(first: 50) {
            nodes {
              identifier
              title
              state { name }
              assignee { name }
              priority
              dueDate
              updatedAt
            }
          }
        }
      }
    }
  `);
  return JSON.stringify(data, null, 2);
}

/** Get issues assigned to team members */
export async function getMyIssues(): Promise<string> {
  const data = await query(`
    query {
      issues(
        filter: { state: { type: { nin: ["completed", "canceled"] } } }
        first: 30
        orderBy: updatedAt
      ) {
        nodes {
          identifier
          title
          state { name }
          assignee { name }
          priority
          dueDate
          updatedAt
          labels { nodes { name } }
        }
      }
    }
  `);
  return JSON.stringify(data, null, 2);
}

/** Get overdue or stale issues (not updated in 3+ days) */
export async function getStaleIssues(): Promise<string> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const data = await query(`
    query($before: DateTimeOrDuration!) {
      issues(
        filter: {
          state: { type: { nin: ["completed", "canceled"] } }
          updatedAt: { lt: $before }
        }
        first: 20
        orderBy: updatedAt
      ) {
        nodes {
          identifier
          title
          state { name }
          assignee { name }
          priority
          dueDate
          updatedAt
        }
      }
    }
  `, { before: threeDaysAgo });
  return JSON.stringify(data, null, 2);
}

/** Get project-level progress */
export async function getProjects(): Promise<string> {
  const data = await query(`
    query {
      projects(first: 10, orderBy: updatedAt) {
        nodes {
          name
          state
          progress
          targetDate
          lead { name }
          issues {
            nodes {
              state { name }
            }
          }
        }
      }
    }
  `);
  return JSON.stringify(data, null, 2);
}
