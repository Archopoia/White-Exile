# Studio agents — quick start (Digging)

## What this is

A **studio-style agent map**: specialized roles (design, art, code, QA, production) you can invoke via Cursor subagents, aligned with this repo’s **TypeScript + Three.js + Web Workers + WASM** voxel engine. Coordination rules live in [`agent-coordination-map.md`](agent-coordination-map.md).

## Tiers

1. **Leadership** — `creative-director`, `technical-director`, `producer`
2. **Department leads** — e.g. `game-designer`, `lead-programmer`, `art-director`, `qa-lead`, `release-manager`
3. **Specialists** — e.g. `gameplay-programmer`, `level-designer`, `writer`, `performance-analyst`

**Engine roles for this stack:** `voxel-engine-specialist`, `web-worker-wasm-specialist`, `editor-plugin-specialist`, plus existing engine agents (`engine-planning`, `plugin-and-systems`, `ecs-and-components`, `hitch-investigator`, …).

## Picking an agent

Ask: *which discipline would own this in a real studio?* Use [`agent-roster.md`](agent-roster.md) for a full table.

## Workflows (skills)

Reusable workflows live under **`.cursor/skills/<name>/SKILL.md`**. Examples: `start`, `brainstorm`, `sprint-plan`, `code-review`, `map-systems`, `setup-engine`. Open the skill folder you need or reference it from chat when relevant.

## Templates

Authoring templates are in **`.cursor/docs/studio/templates/`** (GDDs, ADRs, sprint plans, etc.).

## Canonical engine docs

- **`llms.txt`** — engine API and plugin index  
- **`docs/engine/`** — architecture and loading  
- **`docs/editor/`** — immersive editor principles  
