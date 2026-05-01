Create a structured implementation plan before coding when the task is non-trivial or has architectural trade-offs.

## 1. Entry flow

1. Switch to Plan mode when the problem benefits from up-front design.
2. Apply the **`plan-major-change`** skill.
3. If ownership or files are unclear, use **`explore`**.
4. For large or ambiguous plans, use **`technical-planning`** (or `technical-director`) to pressure-test the draft.

## 2. Read locally first

- `.cursor/rules/typescript-typing.mdc`
- `.cursor/rules/ai-playtesting.mdc`
- `.cursor/rules/llm.mdc`
- `.cursor/rules/migration-and-terminology.mdc`
- `.cursor/rules/subagent-and-skill-routing.mdc`
- `.cursor/rules/self-maintenance-and-drift-control.mdc`
- `.cursor/rules/runtime-discipline.mdc` when touching runtime, rendering, or concurrency
- Project README / `docs/` / design notes for **this** repo

Use Context7 only for external library APIs, after local context.

## 3. Constraints

- Plan one coherent end state.
- If behavior changes, include documentation updates in the same plan.
- Name validation steps and relevant subagents.
- No browser playtesting in the plan unless the user requested it.
- Refresh `lastReviewed` on touched `.cursor/rules/**`, `.cursor/agents/**`, `.cursor/skills/**`.

## 4. Output

Follow the template in `.cursor/skills/plan-major-change/SKILL.md`.
