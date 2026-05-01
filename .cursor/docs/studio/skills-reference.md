# Workflow skills catalog

Each workflow is a **folder** under **`.cursor/skills/<name>/`** containing **`SKILL.md`**.

## How to use in Cursor

- **Chat:** ask for a skill by name (e.g. “follow the `sprint-plan` skill”, “use `brainstorm`”).
- **Direct:** open `.cursor/skills/<name>/SKILL.md` and work through it step by step.
- **Rules for AI:** `.cursor/rules/` routes complex work; skills add structured workflows on top.

| Skill | Purpose |
|-------|---------|
| `start` | First-time onboarding — where you are, then route to the right workflow |
| `brainstorm` | Guided ideation toward a structured concept |
| `sprint-plan` | Sprint planning and task breakdown |
| `code-review` | Structured code / architecture review |
| `design-review` | Review a design document for completeness |
| `playtest-report` | Structured playtest notes (see also `.cursor/commands/playtest.md`) |
| `balance-check` | Balance data review |
| `bug-report` | Structured bug report |
| `architecture-decision` | ADR-style decision record |
| `asset-audit` | Asset pipeline compliance |
| `milestone-review` | Milestone status |
| `onboard` | Contributor onboarding context |
| `prototype` | Throwaway prototype scaffold |
| `release-checklist` | Pre-release checklist |
| `changelog` | Changelog from git / sprint data |
| `retrospective` | Retrospective |
| `estimate` | Effort estimate |
| `hotfix` | Controlled hotfix flow |
| `tech-debt` | Tech debt scan / triage |
| `scope-check` | Scope vs plan |
| `localize` | Localization workflow |
| `perf-profile` | Performance profiling outline |
| `project-stage-detect` | Project state and gaps |
| `reverse-document` | Docs from existing code |
| `plan-major-change` | Structured planning for non-trivial technical work |
| `map-systems` | Systems decomposition |
| `design-system` | Single-system GDD authoring |
| `gate-check` | Phase readiness |
| `team-combat` / `team-narrative` / `team-ui` / `team-release` / `team-polish` / `team-audio` / `team-level` | Multi-role orchestration prompts |

For large implementation plans, prefer **`plan-major-change`**. Add **project-specific** scaffold skills under `.cursor/skills/` when your stack or pipeline needs repeatable templates.
