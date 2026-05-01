# Studio agents — quick start

## What this is

A **studio-style agent map**: specialized roles (design, art, code, QA, production) you can invoke via Cursor subagents. Coordination rules live in [`agent-coordination-map.md`](agent-coordination-map.md). Align agents with **your** stack — off-the-shelf engine, framework, or custom web app.

## Tiers

1. **Leadership** — `creative-director`, `technical-director`, `producer`
2. **Department leads** — e.g. `game-designer`, `lead-programmer`, `art-director`, `qa-lead`, `release-manager`
3. **Specialists** — e.g. `gameplay-programmer`, `level-designer`, `writer`, `performance-analyst`

**Common technical roles:** `rendering-specialist`, `web-platform-specialist`, `editor-tools-specialist`, plus `technical-planning`, `game-systems`, `ecs-and-components`, `hitch-investigator`, …

## Picking an agent

Ask: *which discipline would own this in a real studio?* Use [`agent-roster.md`](agent-roster.md) for a full table.

## Workflows (skills)

Reusable workflows live under **`.cursor/skills/<name>/SKILL.md`**. Examples: `start`, `brainstorm`, `sprint-plan`, `code-review`, `map-systems`, `plan-major-change`. Open the skill folder you need or reference it from chat when relevant.

## Templates

Authoring templates are in **`.cursor/docs/studio/templates/`** (GDDs, ADRs, sprint plans, etc.).

## Canonical project docs

Canonical references: README, `docs/`, `design/`, and optional index files (e.g. `AGENTS.md`).
