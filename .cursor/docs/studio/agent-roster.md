# Agent Roster

Each role has a definition in `.cursor/agents/`. When work spans domains, coordinate via `producer` or the relevant lead, using [`agent-coordination-map.md`](agent-coordination-map.md).

## Tier 1 — Leadership

| Agent | Domain | When to Use |
|-------|--------|-------------|
| `creative-director` | High-level vision | Major creative decisions, pillar conflicts, tone/direction |
| `technical-director` | Technical vision | Architecture decisions, tech stack choices, performance strategy |
| `producer` | Production management | Sprint planning, milestone tracking, risk management, coordination |

## Tier 2 — Department leads

| Agent | Domain | When to Use |
|-------|--------|-------------|
| `game-designer` | Game design | Mechanics, systems, progression, economy, balancing |
| `lead-programmer` | Code architecture | System design, code review, API design, refactoring |
| `art-director` | Visual direction | Style guides, art bible, asset standards, UI/UX direction |
| `audio-director` | Audio direction | Music direction, sound palette, audio implementation strategy |
| `narrative-director` | Story and writing | Story arcs, world-building, character design, dialogue strategy |
| `qa-lead` | Quality assurance | Test strategy, bug triage, release readiness, regression planning |
| `release-manager` | Release pipeline | Build management, versioning, changelogs, deployment, rollbacks |
| `localization-lead` | Internationalization | String externalization, translation pipeline, locale testing |

## Tier 3 — Specialists

| Agent | Domain | When to Use |
|-------|--------|-------------|
| `systems-designer` | Systems design | Specific mechanic implementation, formula design, loops |
| `level-designer` | Level design | Level layouts, pacing, encounter design, flow |
| `economy-designer` | Economy/balance | Resource economies, loot tables, progression curves |
| `gameplay-programmer` | Gameplay code | Feature implementation, gameplay systems code |
| `engine-programmer` | Engine systems | Core engine, rendering, physics, memory management |
| `ai-programmer` | AI systems | Behavior trees, pathfinding, NPC logic, state machines |
| `network-programmer` | Networking | Netcode, replication, lag compensation, matchmaking |
| `tools-programmer` | Dev tools | Editor extensions, pipeline tools, debug utilities |
| `ui-programmer` | UI implementation | UI framework, screens, widgets, data binding |
| `technical-artist` | Tech art | Shaders, VFX, optimization, art pipeline tools |
| `sound-designer` | Sound design | SFX design docs, audio event lists, mixing notes |
| `writer` | Dialogue/lore | Dialogue writing, lore entries, item descriptions |
| `world-builder` | World/lore design | World rules, faction design, history, geography |
| `qa-tester` | Test execution | Writing test cases, bug reports, test checklists |
| `performance-analyst` | Performance | Profiling, optimization recs, memory analysis |
| `devops-engineer` | Build/deploy | CI/CD, build scripts, version control workflow |
| `analytics-engineer` | Telemetry | Event tracking, dashboards, A/B test design |
| `ux-designer` | UX flows | User flows, wireframes, accessibility, input handling |
| `prototyper` | Rapid prototyping | Throwaway prototypes, mechanic testing, feasibility validation |
| `security-engineer` | Security | Anti-cheat, exploit prevention, save encryption, network security |
| `accessibility-specialist` | Accessibility | WCAG compliance, colorblind modes, remapping, text scaling |
| `live-ops-designer` | Live operations | Seasons, events, battle passes, retention, live economy |
| `community-manager` | Community | Patch notes, player feedback, crisis comms, community health |

## Engine — web voxel stack (this repo)

| Agent | Scope | When to Use |
| ---- | ---- | ---- |
| `voxel-engine-specialist` | Three.js, VibeEngine, rendering, meshing | Rendering paths, GPU work, frame budgets |
| `web-worker-wasm-specialist` | Workers, WASM, async terrain | Worker entrypoints, world-swap restore, Rust hot loops |
| `editor-plugin-specialist` | ToolPlugin / EditorPlugin | Registry wiring, palette, inspector integration |

## Engine workflow agents (repo-native)

| Agent | Purpose |
| ---- | ---- |
| `engine-planning` | Architecture-aware planning pressure test |
| `plugin-and-systems` | Plugin registry and event bus execution |
| `ecs-and-components` | ComponentDef schema and registration |
| `migration-and-terminology` | Contract/term refactors without drift |
| `architecture-and-docs` | Doc sync and contract alignment |
| `test-runner` | Test pass execution |
| `verifier` | Non-trivial verification |
| `hitch-investigator` | Runtime hitch isolation |
