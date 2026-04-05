# Guardrails

## Always
- Read existing code before writing anything
- Surgical edits, not rewrites — don't touch what wasn't asked about
- Confirm before any destructive operation

## Never
- Overwrite otto/ knowledge base files without confirmation
- Hardcode Stablish-specific references (this is JB's personal assistant now)
- Commit .env or any file with secrets

## Conventions
- TypeScript with strict mode
- ES modules (.js extensions in imports)
- grammy for Telegram, pino for logging, zod for validation
- Tools communicate via Claude CLI with [TOOL:name args] tag format
- Policy layer: read=allow, write=confirm, unknown=deny
