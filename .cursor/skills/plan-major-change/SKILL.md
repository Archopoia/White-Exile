---
name: plan-major-change
description: Structure implementation plans for non-trivial game work. Use when the user asks for a plan, approach, refactor, roadmap, or before multi-file changes with real trade-offs.
lastReviewed: 2026-05-01
---

# Plan a major change

Produce plans that fit **this repo’s** architecture and documentation habits.

## When to use

- The user asks for a plan, breakdown, roadmap, or refactor strategy.
- The task is ambiguous, multi-file, or has meaningful trade-offs.
- The change touches rendering, simulation, networking, tools, persistence, or public contracts.

## First pass

1. Classify: rendering / gameplay / tools / networking / data & persistence / docs-only / mixed.
2. Read **local** guidance first:
   - Always-on rules under `.cursor/rules/*.mdc`
   - Project canonical docs (README, `docs/`, `design/`, or your repo’s AI index if present)
3. If ownership is unclear, use the `explore` subagent.
4. Use Context7 for **external** APIs after local context is loaded.

## Planning constraints

- Prefer **one** clear end state; avoid unspecified “maybe we keep both” compatibility unless explicitly required.
- If behavior changes, plan code **and** canonical doc updates together.
- Name specialist subagents and validation steps.
- Do not include browser playtesting unless the user asked for it.
- Refresh `lastReviewed` on any `.cursor` governance file you edit.

## Helper routing (examples)

- Broad discovery → `explore`
- Field renames / glossary → `migration-and-terminology`
- Contract or doc sync → `architecture-and-docs`
- Validation → `test-runner`; skeptical pass → `verifier`
- Large plan review → `technical-planning` or `technical-director` as appropriate

## Plan output template

```markdown
## Goal
[User-visible outcome and why it matters.]

## Touched areas
- `path/...`

## Canonical docs
- [List project docs to update]

## Helper routing
- ...

## Plan
1. ...
2. ...

## Validation
- Typecheck / tests (project script names)
- Lint on edited files
- Doc sync if contracts changed

## Risks / open questions
- ...
```

## Checklist

- [ ] Owning systems and boundaries identified
- [ ] Canonical docs named
- [ ] File-level edit list or creation list
- [ ] Validation explicit
- [ ] Playtesting only if requested
