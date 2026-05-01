Use these playbooks to orchestrate subagents consistently.

## Planning / pre-implementation

1. If the user asks for a plan or the task has major trade-offs, switch to Plan mode.
2. Apply the **`plan-major-change`** skill first.
3. Use **`explore`** when ownership, systems, or files are unclear.
4. Use **`technical-planning`** or **`technical-director`** to pressure-test large or ambiguous plans.
5. Hand off to domain agents only after the plan names validation and doc updates.

## Feature work

1. Assign domain agents (gameplay, rendering, UI, audio, etc.) as needed — often in parallel when independent.
2. Run **`test-runner`** (typecheck / tests as defined by the project).
3. Run **`architecture-and-docs`** when contracts or player-visible behavior changed.
4. Run **`verifier`** for a final skeptical pass on non-trivial work.

## Bugfix

1. Assign the owning domain agent.
2. Minimal scope fix.
3. **`test-runner`** for regression signal.
4. **`architecture-and-docs`** if contracts changed.
5. **`verifier`** if the fix has user-visible claims.

## Refactor

1. **`architecture-and-docs`** (or lead programmer) sets constraints and doc impact first.
2. Implement in dependency order.
3. **`test-runner`** then final **`architecture-and-docs`** + **`verifier`**.
