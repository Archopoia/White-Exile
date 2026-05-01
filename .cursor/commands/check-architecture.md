Scan the codebase for architecture violations against the engine rules. Report findings as a checklist.

## 1. File Size Check

Find all `.ts` files in `src/` and report the top 10 by line count.

Thresholds:
- **Under 300 lines**: Healthy
- **300-500 lines**: Acceptable
- **500-800 lines**: Needs scrutiny — look for extractable sub-features
- **Over 800 lines**: Flag as needing extraction — likely violates the anti-spaghetti rule

## 2. Cross-Plugin Imports

Check that files in `src/systems/` do NOT import from each other's internals.

**Allowed imports between system files** (these are shared utilities, not plugins):
- `SmokePhysics.ts` — shared particle collision/soot utilities
- `ParticleTextures.ts` — shared canvas-based particle textures
- `GhostPreview.ts` — shared ghost preview utilities
- `LightingSystem.ts` — scene lighting getters (isGrimdarkMode, etc.)
- `AudioSystem.ts` — audio utility exports (updateEntityAudioVolume, etc.)
- `FirstPersonCamera.ts` — camera state getters (getThreeCamera, isInspectMode, etc.)

**Forbidden**: Any direct `import ... from '../systems/TorchSystem'`, `import ... from '../systems/WaterSystem'`, etc. between plugin system files. Cross-plugin communication must go through the PluginRegistry event bus.

Search pattern: Look for `import` statements in `src/systems/*.ts` that reference other files in `src/systems/`. Check each against the allowed list above.

## 3. Plugin Registration Compliance

For each file in `src/systems/` that calls `pluginRegistry.register(`, verify it has:

- [ ] `onDisable` hook (hides visuals, pauses simulation)
- [ ] `onEnable` hook (restores visuals, resumes simulation)
- [ ] `getSaveData` method (returns `{ key, data }`)
- [ ] `loadSaveData` method (restores from saved data)
- [ ] At least one `pluginRegistry.emit()` call (event bus integration)
- [ ] At least one `inspectRegistry.register()` call (if it's a ToolPlugin that places entities)

## 4. InspectRegistry Compliance

For each `inspectRegistry.register()` call in the codebase, verify the registered entity provides:

- [ ] `getProperties()` method returning `PropertyDef[]`
- [ ] `getSummary()` method returning `string[]`

Search for `inspectRegistry.register(` and check each call site.

## 5. ECS Integration Compliance

For each file in `src/systems/` that calls `pluginRegistry.register(` as a **ToolPlugin** (has `place()` method), verify it also:

- [ ] Calls `entityManager.createEntity()` in its `place()` function (with `skipInspect: true`)
- [ ] Calls `entityManager.attachComponent()` for at least the `transform` component
- [ ] Calls `entityManager.destroyEntity()` in its `remove()` function

Search for `import { entityManager }` in `src/systems/*.ts`. Cross-reference with systems that have `inspectRegistry.register()` calls — those should also have ECS integration.

**Exceptions:** Paint-based systems (e.g. `VegetationSystem`) that don't create individual entities are exempt.

## 6. Anti-Spaghetti: Function Length Check

In all `src/systems/*.ts` files, find any single function body longer than 100 lines. These are candidates for extraction into focused modules.

Use a heuristic: search for function declarations and measure the distance to their closing brace. Flag functions over 100 lines with their name and line range.

## Report Format

Present results as:

```
## Architecture Check Results

### 1. File Sizes
| File | Lines | Status |
|------|-------|--------|
| ... | ... | OK / Needs scrutiny / NEEDS EXTRACTION |

### 2. Cross-Plugin Imports
- [PASS/FAIL] <file>: imports <other_file> — <allowed/forbidden>

### 3. Plugin Registration
- [PASS/FAIL] <plugin_id>: <missing hooks>

### 4. InspectRegistry Compliance
- [PASS/FAIL] <entity_type>: <missing methods>

### 5. ECS Integration
- [PASS/FAIL] <system_file>: <missing entityManager calls>

### 6. Long Functions
- [PASS/FAIL] <file>:<function_name> — <line_count> lines
```

Include specific `file:line` references for all violations so they can be fixed directly.

## 7. Documentation and Rule Sync Gate

If any behavior or contract changed in the scanned files, report doc updates needed using canonical ownership:

- Plugin table, event list, plugin interfaces, PluginRegistry methods -> `llms.txt`
- Persistence flow and auto-save behavior -> `docs/editor/Immersive_Editor_Principles.md`
- Worker/world-swap contracts -> `docs/engine/Engine_Architecture.md`
- Render ownership / render-call contract -> `docs/engine/Engine_Architecture.md`
- Resume heavy-prewarm phase contract -> `docs/engine/Engine_Architecture.md`
- Degraded worker diagnostics contract -> `docs/engine/Engine_Architecture.md`
- Performance regression benchmark contract -> `docs/engine/Engine_Architecture.md`
- Architecture constraints / HMR policy -> `.cursor/rules/engine-architecture.mdc`
- Immersive workflow policy -> `.cursor/rules/immersive-editor.mdc`
- Playtest procedure -> `.cursor/commands/playtest.md`

Return a final checklist item:

- [PASS/FAIL] docs-sync: canonical docs and derived rule summaries are aligned
