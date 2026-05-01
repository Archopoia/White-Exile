---
name: plan-engine-change
description: Create engine-aware implementation plans for this voxel cave engine. Use when the user asks for a plan, approach, refactor, roadmap, or before non-trivial work touching rendering, workers, plugins, persistence, editor systems, or architecture.
lastReviewed: 2026-03-19
---

# Plan an Engine Change

Use Cursor's planning flow to produce plans that fit this repo's architecture, routing rules, and documentation sync requirements.

## When to use

- The user asks for a plan, approach, breakdown, roadmap, or refactor strategy.
- The task is ambiguous, multi-file, or has meaningful trade-offs.
- The change touches rendering, workers, plugin contracts, persistence, editor systems, docs/rules, or terminology.

## First pass

1. Classify the change:
   - `rendering/core/worker`
   - `systems/editor/ui`
   - `migration/terminology`
   - `docs/rules only`
   - mixed
2. Read local guidance before using external docs:
   - always-on rules: `.cursor/rules/typescript-typing.mdc`, `.cursor/rules/ai-playtesting.mdc`, `.cursor/rules/llm.mdc`, `.cursor/rules/migration-and-terminology.mdc`, `.cursor/rules/subagent-and-skill-routing.mdc`, `.cursor/rules/self-maintenance-and-drift-control.mdc`
   - scoped rules: `.cursor/rules/engine-architecture.mdc` for core/rendering/workers/wasm and `.cursor/rules/immersive-editor.mdc` for systems/editor/ui/components
   - canonical docs from the ownership map in `.cursor/rules/llm.mdc`
3. If ownership or scope is unclear, use the `explore` subagent for broad discovery.
4. If external API details are needed for Three.js, Vite, Web Workers, Web Audio, TypeScript, IndexedDB, or Rapier, use Context7 after local docs.

## Required planning constraints

- Plan one canonical end state. Do not preserve compatibility shims, fallback fields, or dual paths.
- If behavior changes, include code updates and canonical doc updates in the same plan.
- Route scaffold-like work through existing skills before manual implementation.
- Name required specialist subagents for implementation and validation.
- Do not include browser playtesting unless the user explicitly asked for it.
- When planning governance file edits under `.cursor/rules/**`, `.cursor/agents/**`, or `.cursor/skills/**`, refresh `lastReviewed`.

## Helper routing

- Broad architecture discovery or ownership mapping -> `explore`
- Plugin and system work in `src/systems/**` -> `plugin-and-systems`
- Component schema and registration work -> `ecs-and-components`
- Field/type/API renames or terminology cleanup -> `migration-and-terminology`
- Behavior or contract changes needing doc sync -> `architecture-and-docs`
- Post-change validation -> `test-runner`
- Final skeptical confirmation -> `verifier`
- Large or high-risk plan review -> `engine-planning`

## Plan output

Use this structure:

```markdown
## Goal
[One paragraph on the user-facing outcome and why it matters.]

## Touched Areas
- `src/...`
- `docs/...`
- `.cursor/...`

## Canonical Docs And Rules
- `docs/...`
- `llms.txt`
- `.cursor/rules/...`

## Helper Routing
- `explore` for ...
- `plugin-and-systems` for ...

## Plan
1. ...
2. ...
3. ...

## Validation
- `ReadLints` on edited files
- relevant tests / typecheck
- `architecture-and-docs` if contracts or behavior changed
- `verifier` for non-trivial work

## Risks / Open Questions
- ...
```

## Beginner-friendly requirement

When the user appears to want handholding, the plan should name the exact root-relative files expected to be created or edited.

## Good defaults by area

- Rendering, workers, world swap, prewarm, or ownership changes -> read `docs/engine/Engine_Architecture.md`
- Persistence and continue/resume behavior -> read `docs/editor/Immersive_Editor_Principles.md`
- Plugin contracts and event bus changes -> read `llms.txt`
- Rule, agent, or skill changes -> audit nearby guidance for drift in `.cursor/rules/**`, `.cursor/agents/**`, and `.cursor/skills/**`

## Planning checklist

- [ ] Scope and owning systems are identified
- [ ] Canonical docs and rules are named explicitly
- [ ] Expected file edits are listed
- [ ] No compatibility path is planned
- [ ] Helper routing is explicit
- [ ] Validation covers lints, tests, and verification as appropriate
- [ ] Playtesting is only included if the user requested it
