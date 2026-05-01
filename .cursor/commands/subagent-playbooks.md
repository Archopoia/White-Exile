Use these playbooks to orchestrate subagents consistently.

## Planning / Pre-Implementation

1. If the user asks for a plan or the task has major trade-offs, switch to Plan mode.
2. Apply the `plan-engine-change` skill first to structure the plan around engine constraints.
3. Use `explore` when ownership, touched systems, or likely files are still unclear.
4. Use `engine-planning` to pressure-test large or ambiguous plans before implementation starts.
5. Only hand off to domain execution subagents after the plan names docs, validation, and migration concerns.

## Feature Work

1. `plugin-and-systems` and/or `ecs-and-components` (parallel when independent).
2. Add domain-specific subagent only if needed (rendering/worker/behavior/assets).
3. `test-runner` verification pass:
   - run relevant tests/build/typecheck
   - summarize failures and minimal fixes
4. `architecture-and-docs` compliance pass:
   - architecture check
   - canonical doc updates
   - rule/command consistency check
5. `verifier` final skeptical pass:
   - confirm claimed work is functional
   - flag incomplete claims and edge-case gaps

## Bugfix

1. Assign owning domain subagent.
2. Fix with minimal scope.
3. `test-runner` confirms regression status.
4. Run `architecture-and-docs` if contracts/events/behavior changed.
5. `verifier` confirms fix completeness for user-facing claims.

## Refactor

1. `architecture-and-docs` defines constraints and affected docs first.
2. Implement by domain in dependency order.
3. `test-runner` validates no regressions.
4. Final `architecture-and-docs` + `verifier` gate.

## Performance Pass

1. Use `hitch-investigator` first for runtime hitch/stall discovery and subsystem bisection.
2. Ask it to choose one split axis at a time and keep the comparison set small (`A/B/C`, `T1/T2/T3`).
3. If a human tester is needed, require all preset commands in one copy-pastable batch; each command should fully define one scenario.
4. Use rendering/workers subagent next depending on the narrowed hotspot.
5. Verify typed-array purity and worker boundaries.
6. `test-runner` validates perf-related regressions where tests exist.
7. Update architecture docs if pipeline/contract changed.
8. `verifier` checks claimed perf outcome evidence.

## Release Prep

1. Run `.cursor/commands/check-architecture.md`.
2. Fix violations by domain.
3. Run `test-runner` for release candidate confidence.
4. Confirm docs-sync gate and no contradictions.
5. Run `verifier` before release sign-off.

## Manual Playtest Lane

Use `.cursor/commands/playtest.md` when the user explicitly requests browser/in-game testing.
Do not treat automated test passes as full replacement for long-session or scenario-based playtesting.

## When Not to Delegate

- Very small single-step edits that do not benefit from context isolation
- Trivial formatting/text-only changes
- Quick answers where subagent startup overhead outweighs value

## KPIs (Track Monthly)

- architecture check pass rate
- doc-sync pass rate
- rework rate after initial subagent output
- median time to complete feature tasks
- percent of tasks with clean domain ownership
