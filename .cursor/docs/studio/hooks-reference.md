# Shell hooks (optional)

Scripts live in **`tools/hooks/`**. They are **not** wired automatically by Cursor; use **git hooks** or run them manually. See **`tools/hooks/README.md`**.

| Script | Typical use |
|--------|-------------|
| `validate-commit.sh` | Extra checks before or around commits |
| `validate-push.sh` | Warnings on push / branch |
| `validate-assets.sh` | Asset naming / JSON checks |
| `session-start.sh` | Optional banner / context at session start |
| `detect-gaps.sh` | Suggest filling design docs when code outpaces `design/gdd/` |
| `pre-compact.sh` | Optional notes before long context compaction |
| `session-stop.sh` | Optional session summary |
| `log-agent.sh` | Optional subagent audit log |
| `statusline.sh` | Optional one-line status for compatible hosts |

Input / schema notes for advanced wiring: `hooks-reference/hook-input-schemas.md` (if present).
