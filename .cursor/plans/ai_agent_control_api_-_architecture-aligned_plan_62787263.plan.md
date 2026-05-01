---
name: AI Agent Control API - Architecture-Aligned Plan
overview: ""
todos:
  - id: create-typescript-typing-rule
    content: Create .cursor/rules/typescript-typing.mdc with typing discipline rules (no any, explicit returns, centralized types)
    status: completed
  - id: add-quick-reference-to-llm-mdc
    content: Add Quick Reference section to .cursor/rules/llm.mdc (instead of separate llms.txt)
    status: completed
  - id: create-types-file
    content: Create src/debug/GameAPITypes.ts with all API interfaces (no any types, use unknown with guards). Include content manifest types (ModelManifest, ItemCatalog interfaces).
    status: completed
  - id: create-gameapi-module
    content: Create src/debug/GameAPI.ts importing types from GameAPITypes.ts, implementing all APIs with strict typing
    status: completed
  - id: implement-content-api
    content: Implement content namespace in GameAPI.ts for read-only manifest queries (getModels, getNpcModels, getPropModels, getEquipmentForSlot, getItems, getQuests)
    status: completed
  - id: verify-exports
    content: Check which functions need to be exported for GameAPI (initDigging, setSmokePhysicsWorld, wireSootProvider, initGranular, initWater, updateEditorRefs, finalizeWorld)
    status: completed
  - id: implement-world-api
    content: Implement world API following exact MainMenu.ts pattern with proper typing
    status: completed
  - id: implement-entity-api
    content: Implement entity API with event listener pattern, proper typing, undo commands
    status: completed
  - id: implement-component-api
    content: Implement component API using component system with proper typing
    status: completed
  - id: implement-tool-api
    content: Implement tool API with proper typing (ToolType enum, BrushMode enum)
    status: completed
  - id: implement-terrain-api
    content: Implement terrain API with undo commands and proper typing
    status: completed
  - id: implement-lighting-api
    content: Implement lighting API wrapping LightingSystem with proper typing
    status: completed
  - id: implement-postprocessing-api
    content: Implement post-processing API with proper typing
    status: completed
  - id: implement-behavior-api
    content: "Implement behavior graph API with proper typing (GraphInfo, NodeInfo interfaces). Include write operations: createGraph, addNode, removeNode, addConnection, removeConnection, setNodeParams, removeGraph (runtime content editing)"
    status: completed
  - id: implement-prefab-api
    content: Implement prefab API with proper typing
    status: completed
  - id: implement-undoredo-api
    content: Implement undo/redo API with proper typing (HistoryEntry interface)
    status: completed
  - id: implement-query-api
    content: Implement query API with proper typing (RaycastHit interface)
    status: completed
  - id: add-hmr-support
    content: Add HMR boundary to GameAPI.ts with state preservation
    status: completed
  - id: wire-to-window
    content: Wire GameAPI to window.gameAPI in main.ts after initDebugAPI()
    status: completed
  - id: add-error-handling
    content: Add comprehensive error handling with typed returns (no any types)
    status: completed
  - id: update-llms-txt
    content: Update llms.txt with new window.gameAPI documentation section (Section 20), including content manifest queries
    status: completed
  - id: update-ai-playtesting
    content: Update .cursor/rules/ai-playtesting.mdc with API usage examples
    status: completed
  - id: update-engine-architecture
    content: Update .cursor/rules/engine-architecture.mdc to reference typescript-typing.mdc
    status: completed
  - id: update-engine-arch-md
    content: Update docs/engine/Engine_Architecture.md to add GameAPI to debug tools section
    status: completed
  - id: verify-typescript
    content: Run npm run check to verify no TypeScript errors and no any types
    status: completed
isProject: false
---

# AI Agent Control API Enhancement Plan (Architecture-Aligned)

## Analysis of Hyperscape Recommendations

### ✅ Already Implemented or Planned

1. **Strict typing discipline** ✅ - Already in plan (GameAPITypes.ts, no `any` types)
2. **File management discipline** ✅ - Already enforced via "No Feature Spaghetti" rule
3. **Content manifests** ✅ - Engine already uses manifests for content: `manifest.json` (models), `public/data/items.json` (items catalog), behavior graphs as JSON (quests/dialogue)

### 🔧 Useful Additions

1. **Quick reference llms.txt** - Optional but helpful for AI assistants
2. **Type safety rule file** - Dedicated `.cursor/rules/typescript-typing.mdc` for typing discipline
3. **Future visual testing note** - Documented but not implemented (requires test framework)

### ❌ Not Applicable to Our Architecture (Code Modules)

1. **Block type manifests** - Block types are core constants in `VoxelWorld.ts` (part of data model, not content)
2. **Tool manifests** - Tools auto-discover via PluginRegistry (better than static manifests)
3. **Component manifests** - Components auto-register via ComponentRegistry (better than static manifests)
4. **Testing framework** - Would require adding Playwright + test infrastructure (beyond GameAPI scope)

### ✅ Part of Our Architecture (Content Data)

1. **Model manifest** - Already implemented (`ModelManifest.ts` loads `manifest.json` for NPCs, equipment, props)
2. **Item catalog** - Planned (`public/data/items.json` per `Immersive_Editor_Principles.md` Section 19.1)
3. **Quest/dialogue graphs** - Behavior graphs serialized as JSON (data-driven content)
4. **External mod manifests** - Future runtime plugin loading will need manifests for external `.ts` files

## Architecture Alignment

The engine uses a **two-tier approach**:


| Category                                                 | Approach                                  | Manifest?             |
| -------------------------------------------------------- | ----------------------------------------- | --------------------- |
| **Code modules** (tools, components, block types)        | Code-as-configuration (self-registration) | ❌ No — auto-discovery |
| **Content data** (models, items, quests, dialogue, mods) | Data-driven (JSON catalogs/manifests)     | ✅ Yes — already using |


**Key distinction:** Code modules are TypeScript files that register themselves. Content is JSON data loaded at runtime. The GameAPI should reflect this architecture.

## Refined Implementation Plan

### 1. Type Definitions (`src/debug/GameAPITypes.ts`)

Centralized type definitions with strict typing (no `any` types). Include interfaces for:

- World management (WorldInfo, WorldOptions)
- Entity operations (EntityInfo, EntityType, Position3D)
- Component management (ComponentInfo, ComponentData)
- Tool operations (ToolType enum, BrushMode enum, BrushSettings)
- Terrain editing (TerrainOperation, DigOptions)
- Lighting (LightingMode, LightingSettings)
- Post-processing (PostProcessingSettings)
- Behavior graphs (GraphInfo, NodeInfo, GraphConnection)
- Prefabs (PrefabInfo)
- Undo/redo (HistoryEntry, HistoryState)
- Query operations (RaycastHit, QueryOptions)
- **Content manifests** (ModelManifest, ItemCatalog, QuestCatalog) — query-only, read from existing systems

### 2. Type Safety Rule File

**Create `.cursor/rules/typescript-typing.mdc`:**

```markdown
---
alwaysApply: true
---
# TypeScript Typing Discipline

Follow strict typing patterns for maximum AI compatibility.

## Core Rules

1. **No `any` types** - Use `unknown` with type guards if dynamic typing is needed
2. **Explicit return types** - All exported functions must have explicit return types
3. **Centralized types** - Shared types live in dedicated `.types.ts` or `.Types.ts` files
4. **Strong type assumptions** - Trust TypeScript types, minimize runtime property checks
5. **Type guards** - Use `is` functions for runtime type validation when needed

## Examples

### Good: Explicit types, no `any`
```typescript
function getEntity(id: string): EntityInfo | null {
  const entity = inspectRegistry.getById(id);
  return entity ? {
    id: entity.id,
    type: entity.type,
    pluginId: entity.pluginId,
    position: { x: entity.position.x, y: entity.position.y, z: entity.position.z },
    properties: {},
    components: [],
  } : null;
}
```

### Bad: Using `any`

```typescript
function getEntity(id: any): any {
  // Don't do this - loses type safety
}
```

### Good: Type guard for dynamic values

```typescript
function isEntityType(value: unknown): value is EntityType {
  return typeof value === 'string' && 
    ['torch', 'fog', 'npc', 'prop', 'vfx', 'water-spring', 'vegetation'].includes(value);
}

function placeEntity(type: unknown, position: Position3D): Promise<string | null> {
  if (!isEntityType(type)) {
    console.warn(`[gameAPI] Invalid entity type: ${type}`);
    return Promise.resolve(null);
  }
  // TypeScript now knows type is EntityType
  return placeEntityInternal(type, position);
}
```

## Enforcement

- TypeScript `strict: true` is enabled in `tsconfig.json`
- Run `npm run check` before committing to catch type errors
- No `@ts-ignore` or `@ts-expect-error` without justification

```

### 3. Quick Reference Section in llm.mdc

**Add a "Quick Reference" section to `.cursor/rules/llm.mdc`** (instead of separate llms.txt file):

```markdown
# VibeEngine — Quick Reference for AI Assistants

This is a **custom voxel game engine** built in TypeScript on the web platform, optimized for AI-assisted development.

## Primary Documentation

- **`llms.txt`** — Complete engine documentation (architecture, API, recipes)
- **`.cursor/rules/`** — Focused rule files (engine-architecture, immersive-editor, typescript-typing)
- **`docs/`** — Full design documents (`docs/engine/Engine_Architecture.md`, `docs/editor/Immersive_Editor_Principles.md`)

## Key Principles

1. **AI-First Design** — TypeScript everywhere, clear module boundaries, self-documenting interfaces
2. **The Game IS the Editor** — Everything is editable in-place, no separate editor windows
3. **No Feature Spaghetti** — Extract distinct capabilities into focused modules
4. **Plugin Architecture** — Optional features register with PluginRegistry, can be enabled/disabled
5. **Component System** — Composable ECS for entity behavior (separate from plugins)
6. **Content Manifests** — Models, items, quests use JSON catalogs; code modules use auto-discovery

## Programmatic API

The engine exposes `window.gameAPI` for AI agent control:

```typescript
// World management
await gameAPI.world.createCaveWorld(128, 64, 128);
await gameAPI.world.save('my-world');

// Entity operations
const id = await gameAPI.entities.place('torch', { x: 10, y: 5, z: 10 });
gameAPI.entities.setProperty(id, 'intensity', 2.5);

// Terrain editing
gameAPI.terrain.dig({ x: 20, y: 10, z: 20 }, 3);

// Component management
gameAPI.components.attach(id, 'flicker', { speed: 0.3 });

// Content queries (read-only from manifests)
const models = gameAPI.content.getModels(); // From manifest.json
const items = gameAPI.content.getItems(); // From items.json (future)

// Undo/redo
gameAPI.undoRedo.undo();
```

See `llms.txt` Section 20 for complete API documentation.

## Debug API

`window.gameDebug` provides inspection and control:

- `gameDebug.getState()` — Full state snapshot
- `gameDebug.dumpState()` — Log JSON to console (F4)
- `gameDebug.teleport(x, y, z)` — Move camera
- `gameDebug.togglePlugin(id)` — Enable/disable features

## Architecture

- **VibeEngine** — Own bootstrap (~177 lines), zero external engine dependencies
- **PluginRegistry** — Optional features (torches, fog, water, NPCs, etc.) — auto-discovery, no manifests
- **ComponentRegistry** — Composable ECS for entity behavior — auto-registration, no manifests
- **Content Manifests** — Models (`manifest.json`), items (`items.json`), quests (behavior graphs as JSON)
- **InspectRegistry** — Entity inspection and editing
- **UndoRedoManager** — Centralized command stack with IndexedDB persistence

## Quick Commands

```bash
npm run dev          # Start dev server (port 3000)
npm run check        # TypeScript type checking
npm run wasm:build   # Build WASM modules
```

## When Adding Features

1. Check `llms.txt` for relevant sections
2. Follow plugin/component patterns from existing systems
3. Update documentation (llms.txt + .cursor/rules + docs/)
4. Ensure HMR support (import.meta.hot.accept)
5. Implement getSaveData()/loadSaveData() for persistence

See `.cursor/rules/llm.mdc` for the Documentation Sync Rule.

```

**Rationale:** Integrating into `.cursor/rules/llm.mdc` keeps all AI-facing documentation rules in one place. The file already serves as a meta-documentation guide, so adding a quick reference section fits naturally.

### 4. Behavior Graph Write Operations (Runtime Content)

Behavior graphs are **runtime state** (stored in IndexedDB, serialized as JSON), not static files. The GameAPI should support programmatic editing:

```typescript
gameAPI.behavior = {
  // Graph management
  createGraph(label: string, entityId?: string | null): string; // Returns graph ID
  removeGraph(graphId: string): boolean;
  getGraph(graphId: string): GraphInfo | null;
  getGraphsForEntity(entityId: string): GraphInfo[];
  getGlobalGraphs(): GraphInfo[];
  
  // Node operations
  addNode(graphId: string, nodeDefId: string, position: { x: number; y: number }): string | null; // Returns node ID
  removeNode(graphId: string, nodeId: string): boolean;
  setNodeParams(graphId: string, nodeId: string, params: Record<string, any>): boolean;
  
  // Connection operations
  addConnection(graphId: string, fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string): string | null; // Returns connection ID
  removeConnection(graphId: string, connectionId: string): boolean;
  
  // Node type queries (read-only)
  getNodeDefs(): NodeDefInfo[];
  getNodeDefsByCategory(category: NodeCategory): NodeDefInfo[];
};
```

**Integration:** All write operations should:

- Push undo commands via `undoRedoManager.push()`
- Trigger `scheduleAutoSave()` for IndexedDB persistence
- Emit events via `pluginRegistry.emit('behavior:graph-changed', graphId)`

**Distinction:** Static content files (`items.json`, `manifest.json`) remain read-only. Runtime content (behavior graphs) is editable programmatically.

### 5. Content API Namespace (Static Content - Read-Only)

Add a `content` namespace to GameAPI for querying content manifests (read-only):

```typescript
gameAPI.content = {
  // Model manifest queries (from ModelManifest.ts)
  getModels(): ModelManifest | null;
  getNpcModels(): ManifestNpc[];
  getPropModels(): ManifestProp[];
  getEquipmentForSlot(slot: string): ManifestEquip[];
  
  // Item catalog queries (future, from items.json)
  getItems(): ItemCatalog | null;
  getItemById(id: string): ItemInfo | null;
  
  // Quest/dialogue queries (from BehaviorGraphRegistry)
  getQuests(): QuestInfo[];
  getDialogueGraphs(): DialogueGraphInfo[];
};
```

This provides read-only access to static content files (build-time assets). Runtime content (behavior graphs) is editable via `gameAPI.behavior` namespace.

### 6. Testing Note (Future Enhancement)

**Add to plan as "Future Work" section:**

```markdown
## Future Enhancements (Out of Scope)

### Visual Testing Infrastructure
Hyperscape uses Playwright + screenshot testing for visual regression. This could be valuable for:
- Verifying shader changes don't break rendering
- Ensuring UI layouts remain consistent
- Catching visual regressions automatically

**Implementation would require:**
- Adding Playwright as dev dependency
- Creating test utilities for Three.js scene introspection
- Screenshot comparison infrastructure
- Colored cube proxies for entity verification

**Current testing:** Browser MCP tools for manual playtesting (already implemented via `.cursor/rules/ai-playtesting.mdc`).

**Decision:** Defer until automated testing becomes a priority. Manual playtesting via browser MCP tools is sufficient for current development pace.
```

## Updated Implementation Checklist

### Phase 1: Type Definitions & Rules

- Create `src/debug/GameAPITypes.ts` with all interfaces (no `any` types)
- Add content manifest types (ModelManifest, ItemCatalog interfaces)
- Create `.cursor/rules/typescript-typing.mdc` with typing discipline rules
- Add Quick Reference section to `.cursor/rules/llm.mdc`

### Phase 2: Core Implementation

- Create `src/debug/GameAPI.ts` with strict typing
- Implement all API namespaces following patterns
- Implement `content` namespace (read-only static content queries)
- Implement `behavior` namespace (read/write runtime content: graphs, nodes, connections)
- Add comprehensive error handling (typed returns)
- Integrate with undo/redo system
- Integrate with auto-save system
- Add HMR support

### Phase 3: Integration

- Wire to `window.gameAPI` in `main.ts`
- Verify all operations trigger visual feedback
- Test undo/redo integration
- Test auto-save integration
- Test content manifest queries

### Phase 4: Documentation

- Update `llms.txt` with API documentation (Section 20)
- Document content manifest queries in API section
- Update `.cursor/rules/ai-playtesting.mdc` with API examples
- Update `.cursor/rules/engine-architecture.mdc` to reference typescript-typing.mdc
- Update `docs/engine/Engine_Architecture.md` with API section

### Phase 5: Validation

- Run `npm run check` to verify no TypeScript errors
- Verify no `any` types in GameAPI code
- Test all operations via console
- Verify documentation examples work
- Test content manifest queries return correct data

## Key Decisions

### ✅ Include

1. **Strict typing** - GameAPITypes.ts with no `any` types
2. **Type safety rule file** - `.cursor/rules/typescript-typing.mdc` for discipline
3. **Quick reference** - Optional llms.txt pointing to llms.txt
4. **Content API namespace** - Read-only queries for manifests (models, items, quests)

### ❌ Exclude (Code Modules - Not Applicable)

1. **Block type manifests** - Block types are core constants (correct architecture)
2. **Tool manifests** - Tools auto-discover via PluginRegistry (better than manifests)
3. **Component manifests** - Components auto-register (better than manifests)
4. **Testing framework** - Beyond scope, manual playtesting sufficient

### ✅ Acknowledge (Content Data - Part of Architecture)

1. **Model manifest** - Already implemented, expose via `content` namespace
2. **Item catalog** - Planned, expose via `content` namespace when implemented
3. **Quest/dialogue graphs** - Behavior graphs as JSON, expose via `content` namespace
4. **External mod manifests** - Future, will need manifests for runtime plugin loading

### 🔮 Future Work

1. **Visual testing** - Documented as future enhancement, not in current plan
2. **Content write operations** - Currently content is edited via immersive editor only; programmatic content editing could be added later if needed

## Alignment Summary

✅ **Hyperscape Patterns Applied:**

- Strict typing discipline (no `any` types)
- Centralized type definitions
- Strong type assumptions
- Quick reference documentation (llms.txt)

✅ **Our Architecture Preserved:**

- PluginRegistry auto-discovery for code modules (better than manifests)
- ComponentRegistry auto-registration for code modules (better than manifests)
- Block types as core constants (correct for data model)
- Content manifests acknowledged and exposed via `content` namespace
- Manual playtesting via browser MCP (sufficient for now)

The plan now correctly distinguishes between code modules (auto-discovery, no manifests) and content data (manifests are part of the architecture, exposed via read-only API).