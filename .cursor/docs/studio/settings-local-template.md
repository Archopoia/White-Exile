# Optional local overrides (Cursor)

Use **Cursor Settings** (Rules for AI, MCP, terminal permissions) for personal preferences. This repo does not require a committed `settings.local.json` in-tree.

## Suggested practices

- **Development:** keep normal confirmation for destructive commands and git operations.
- **Prototyping:** relax scope to `prototypes/**` when iterating quickly.
- **Review / audit:** use read-only exploration when you only want analysis, not edits.

## Optional git hooks

Shell helpers live in `tools/hooks/`. Wire them in `.git/hooks/` only if you want local automation; see `tools/hooks/README.md`.
