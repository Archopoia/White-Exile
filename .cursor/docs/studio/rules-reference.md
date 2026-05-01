# Path-specific rules

Path-scoped guidance lives in **`.cursor/rules/*.mdc`** using `globs` (and `alwaysApply` where noted).

| Rule file | Scope | Notes |
|-----------|-------|------|
| `engine-architecture.mdc` | Core, rendering, workers, WASM | Primary engine guardrails |
| `immersive-editor.mdc` | Editor, systems, UI, components | In-world editor contracts |
| `typescript-typing.mdc` | TypeScript | Strict typing |
| `studio-design-documents.mdc` | `design/gdd/**` | GDD structure |
| `studio-prototype-code.mdc` | `prototypes/**` | Throwaway code |
| `studio-test-standards.mdc` | `tests/**` | Test conventions |
| `studio-systems-quality.mdc` | `src/systems/**` | Systems habits |

Add new scoped rules under `.cursor/rules/` when you introduce new `globs` patterns.
