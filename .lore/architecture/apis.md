# APIs & External Services

## Tool Registry (`src/tools/index.ts`)

All tools are invoked via `[TOOL:name args]` tags in Claude's responses. The gateway parses these and dispatches to the tool registry.

### Gmail (via `gws` CLI)
- `gmail_triage` — unread emails with priority
- `gmail_search` — search by sender/subject/keyword
- `gmail_send` — send email (write, requires approval)
- `gmail_reply` — reply to email (write, requires approval)

### Calendar (via `gws` CLI)
- `calendar_agenda` — today's events
- `calendar_create` — create event (write, requires approval)

### Linear (GraphQL API)
- `linear_issues` — current sprint issues
- `linear_my_issues` — issues by assignee
- `linear_stale` — overdue issues (3+ days no update)
- `linear_projects` — project-level progress

API: `https://api.linear.app/graphql` with `LINEAR_API_KEY` bearer token.

### GitHub (via `gh` CLI)
- `github_prs` — open PRs
- `github_pr` — single PR details
- `github_pr_diff` — PR diff
- `github_commits` — recent commits
- `github_status` — CI/deploy status
- `github_issues` — open issues
- `github_checks` — CI checks on a PR

Default repo: `GITHUB_REPO` env var.

### Google Chat (via `gws` CLI)
- `gchat_recent` — last 24h messages
- `gchat_search` — search messages
- `gchat_send` — send DM (write, requires approval)

### Slack (via `gws` CLI)
- `slack_recent` — last 24h across channels
- `slack_read` — read specific channel
- `slack_search` — search messages
- `slack_send` — send message (write, requires approval)

### Google Docs (via `gws` CLI)
- `gdoc_create` — create doc (write, requires approval)
- `gdoc_read` — read doc by ID
- `gdoc_replace` — find/replace in doc (write, requires approval)
- `gdoc_append` — append to doc (write, requires approval)

### Google Sheets (via `gws` CLI)
- `sheets_read`, `sheets_info` — read data/metadata
- `sheets_append`, `sheets_update`, `sheets_create`, `sheets_clear`, `sheets_delete_tab`, `sheets_add_tab` — write ops (require approval)

### Web (via `claude` CLI)
- `web_search` — web search
- `web_fetch` — fetch and summarize URL

### Files (local)
- `save_document` — save to Desktop/Otto Documents (write, requires approval)
- `read_document` — read from Otto Documents
- `list_documents` — list documents

### iMessage (macOS only, via AppleScript/sqlite)
- `imessage_vip` — VIP contact messages
- `imessage_unreplied` — messages awaiting reply
- `imessage_recent` — last 24h activity
- `imessage_search` — search by contact/keyword

## Claude CLI Integration (`src/core/claude.ts`)

```
claude --print --output-format text --model claude-opus-4-5 --system-prompt "..." -
```

Prompt piped via stdin. 120s timeout. System prompt includes: persona + formatting rules + memory instructions + tool policy + scheduling instructions + tool descriptions + memories + tasks + date/time.
