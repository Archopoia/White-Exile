Create an engine-aware implementation plan before coding. Use this when the user asks for a plan, approach, refactor strategy, or when the task has meaningful architectural trade-offs.

## 1. Planning Entry Flow

1. Switch to Plan mode for non-trivial work.
2. Apply the `plan-engine-change` skill first.
3. If ownership, touched systems, or likely files are unclear, use `explore`.
4. If the plan is large, ambiguous, or high-risk, use `engine-planning` to pressure-test the draft plan.

## 2. Required Reading

Read local guidance before relying on external docs:

- Always-on rules:
  - `.cursor/rules/typescript-typing.mdc`
  - `.cursor/rules/ai-playtesting.mdc`
  - `.cursor/rules/llm.mdc`
  - `.cursor/rules/migration-and-terminology.mdc`
  - `.cursor/rules/subagent-and-skill-routing.mdc`
  - `.cursor/rules/self-maintenance-and-drift-control.mdc`
- Scoped rules:
  - `.cursor/rules/engine-architecture.mdc` for core/rendering/workers/wasm work
  - `.cursor/rules/immersive-editor.mdc` for systems/editor/ui/components work
- Canonical docs from the ownership map in `.cursor/rules/llm.mdc`

Use Context7 only after local docs, and only for external dependency APIs.

## 3. Planning Constraints

- Plan one canonical end state.
- Do not propose compatibility shims, fallback fields, or dual paths.
- If behavior changes, include code updates and canonical doc updates in the same plan.
- Route scaffold-like implementation through existing project skills first.
- Name required specialist subagents for implementation and validation.
- Do not include browser playtesting unless the user explicitly asked for it.
- If the plan includes edits to `.cursor/rules/**`, `.cursor/agents/**`, or `.cursor/skills/**`, refresh `lastReviewed`.

## 4. Helper Routing

- `explore` for broad architecture discovery or ownership mapping
- `plugin-and-systems` for `src/systems/**` plugin work
- `ecs-and-components` for component schema/registration work
- `migration-and-terminology` for field/type/API renames and terminology cleanup
- `architecture-and-docs` for contract or behavior changes that require doc sync
- `test-runner` for validation after behavior-changing work
- `verifier` for final skeptical confirmation
- `engine-planning` for high-risk or ambiguous planning review

## 5. Output Format

Return the plan using this structure:

```md
## Goal
[One short paragraph on the user-facing outcome and why it matters.]

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

## 6. Beginner-Friendly Requirement

If the user appears to want handholding, name the exact root-relative files expected to be created or edited.
