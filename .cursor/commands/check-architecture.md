Scan the codebase for **maintainability and boundary** issues. Adapt sections to your repo layout — defaults assume a `src/` tree.

## 1. File size sanity

Find large source files under `src/` (or the project’s main code root). Report the top contributors by line count.

Heuristic bands:

- **Under ~300 lines:** usually fine
- **300–500:** watch for mixed concerns
- **500+:** consider splitting by feature or layer

## 2. Layering and coupling

- Flag **cycles** or deep imports that skip public module boundaries.
- Flag UI layers that import low-level simulation internals without an abstraction.
- If the project uses plugins, modules, or feature folders, verify **cross-feature imports** match the documented pattern (event bus, services, DI, etc.) — define the allowed list in your architecture doc.

## 3. State and persistence

- Serialization / save formats: single schema owner, versioning story if applicable.
- Networked state: identify authority and replication boundaries.

## 4. Hot paths

- Frame loop / tick handlers: keep heavy work out of unconditional paths; note deferred work patterns.

## 5. Report format

```
## Architecture check

### File sizes
| File | Lines | Note |

### Coupling / boundaries
- ...

### Persistence / networking
- ...

### Hot paths
- ...

### Doc sync
- List canonical docs or rules that need updating if contracts changed
```

## 6. Rules and docs

Point findings at **this repo’s** canonical architecture doc and `.cursor/rules/runtime-discipline.mdc` when relevant. Update playtest docs only if player-facing behavior or controls changed.
