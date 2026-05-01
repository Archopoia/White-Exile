# Setup requirements

Optional tooling for **git hook scripts** in `tools/hooks/`. If you do not use those scripts, only **Git** is strictly required for version control.

## Required for development

| Tool | Purpose | Install |
| ---- | ---- | ---- |
| **Git** | Version control | [git-scm.com](https://git-scm.com/) |
| **Cursor** | Editor + AI workspace | [cursor.com](https://cursor.com/) |

## Recommended for hook scripts

| Tool | Used by | Purpose | Install |
| ---- | ---- | ---- | ---- |
| **jq** | Several hooks | JSON parsing | [jqlang.github.io/jq](https://jqlang.github.io/jq/) |
| **Python 3** | Some hooks | JSON validation helpers | [python.org](https://www.python.org/) |
| **Bash** | All `*.sh` hooks | Script execution | Git for Windows includes Git Bash |

### jq install (examples)

**Windows:** `winget install jqlang.jq`  
**macOS:** `brew install jq`  
**Linux:** `sudo apt install jq` (Debian/Ubuntu)

## Platform notes

- **Windows:** use **Git Bash** so `bash tools/hooks/<name>.sh` works from a compatible shell.
- **macOS / Linux:** bash is standard.

## Verify

```bash
git --version
bash --version
jq --version    # optional
python3 --version  # optional
```

## Without optional tools

Hooks skip checks they cannot run; commits and pushes still proceed. See `tools/hooks/README.md`.

## IDE

This repo is authored for **Cursor** (VS Code–compatible). Use Rules for AI and project rules under `.cursor/rules/` as documented in `llms.txt`.
