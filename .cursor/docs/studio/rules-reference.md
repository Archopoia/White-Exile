# Path-specific rules

Path-scoped guidance lives in **`.cursor/rules/*.mdc`** using `globs` (and `alwaysApply` where noted).

| Rule file | Scope | Notes |
|-----------|-------|------|
| `runtime-discipline.mdc` | `src/**` (default glob) | Application runtime, rendering, concurrency |
| `typescript-typing.mdc` | Always on | Strict TypeScript habits |
| `studio-design-documents.mdc` | `design/gdd/**` | GDD structure |
| `studio-prototype-code.mdc` | `prototypes/**` | Throwaway code |
| `studio-test-standards.mdc` | `tests/**` | Test conventions |
| `studio-systems-quality.mdc` | `src/systems/**` | Systems / gameplay habits |

Add new scoped rules under `.cursor/rules/` when you introduce new `globs` patterns.
