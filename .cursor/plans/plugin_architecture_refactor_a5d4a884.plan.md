---
name: Plugin Architecture Refactor
overview: Refactor the entire project so every feature is a self-registering, standalone plugin. Create a central PluginRegistry for decoupled communication, replace all direct cross-system imports with registry hooks, and add a Plugin Panel in the escape menu showing all plugins and their dependencies.
todos:
  - id: registry
    content: Create `src/core/PluginRegistry.ts` with EditorPlugin / ToolPlugin interfaces, singleton registry, hook dispatch methods (notifyTerrainChange, broadcastUpdate, gatherSaveData, broadcastLoad, notifyUndoRedo)
    status: completed
  - id: register-torch
    content: Refactor TorchSystem to self-register as a ToolPlugin with metadata, tool hooks, save/load hooks, and slider definitions
    status: completed
  - id: register-fog
    content: Refactor FogEmitterSystem to self-register as a ToolPlugin with metadata, tool hooks, save/load hooks, and slider definitions
    status: completed
  - id: register-water
    content: Refactor WaterSystem to self-register as a plugin with terrain change hook, undo/redo hook, save/load hooks, and tool slider definitions
    status: completed
  - id: register-granular
    content: Refactor GranularSystem to self-register as a plugin with terrain change hook and undo/redo hook
    status: completed
  - id: register-camera
    content: Refactor FirstPersonCamera to self-register as a core plugin with metadata and dependency declarations
    status: completed
  - id: register-postprocess
    content: Refactor PostProcessing to self-register as a rendering plugin with metadata
    status: completed
  - id: decouple-digging
    content: "Refactor DiggingSystem: replace direct system imports with pluginRegistry queries (tool placement, terrain notifications, update broadcasts, undo/redo)"
    status: completed
  - id: decouple-panel
    content: "Refactor ToolOptionsPanel: replace direct system imports with pluginRegistry.getToolForBlockType() for dynamic slider building"
    status: completed
  - id: decouple-editor
    content: "Refactor EditorUI: replace direct system imports with pluginRegistry.gatherSaveData() and pluginRegistry.broadcastLoad()"
    status: completed
  - id: simplify-main
    content: "Simplify main.ts: remove unnecessary direct imports, use registry for init ordering"
    status: completed
  - id: plugin-panel-ui
    content: Create `src/ui/PluginPanel.ts` and add HTML/CSS in index.html for the Plugin Panel (escape menu button + scrollable plugin list with categories, dependencies, status)
    status: completed
isProject: false
---

# Plugin Architecture Refactor

## Problem: Current Tight Coupling

The codebase has heavy direct import chains making features inseparable:

```mermaid
graph TD
  Digging["DiggingSystem"]
  Torch["TorchSystem"]
  Fog["FogEmitterSystem"]
  Granular["GranularSystem"]
  Water["WaterSystem"]
  FPCam["FirstPersonCamera"]
  Panel["ToolOptionsPanel"]
  Editor["EditorUI"]
  Post["PostProcessing"]
  MainTS["main.ts"]

  Digging -->|"direct import"| Torch
  Digging -->|"direct import"| Fog
  Digging -->|"direct import"| Granular
  Digging -->|"direct import"| Water
  Digging -->|"direct import"| FPCam
  Digging -->|"direct import"| Panel
  Panel -->|"direct import"| Torch
  Panel -->|"direct import"| Fog
  Panel -->|"direct import"| Water
  Editor -->|"direct import"| Digging
  Editor -->|"direct import"| Torch
  Editor -->|"direct import"| Fog
  FPCam -->|"direct import"| Post
  FPCam -->|"direct import"| Panel
  MainTS -->|"imports everything"| Digging
  MainTS -->|"imports everything"| Torch
  MainTS -->|"imports everything"| Granular
  MainTS -->|"imports everything"| Water
  MainTS -->|"imports everything"| Post
  MainTS -->|"imports everything"| Panel
  MainTS -->|"imports everything"| Editor
```



**DiggingSystem** is the worst offender: it directly imports 5 other systems and the UI panel.

---

## Target Architecture

```mermaid
graph TD
  Registry["PluginRegistry (core)"]
  Digging["DiggingSystem"]
  Torch["TorchSystem"]
  Fog["FogEmitterSystem"]
  Granular["GranularSystem"]
  Water["WaterSystem"]
  FPCam["FirstPersonCamera"]
  Panel["ToolOptionsPanel"]
  Editor["EditorUI"]
  Post["PostProcessing"]
  PluginPanel["PluginPanel (new)"]

  Digging -->|"registers + queries"| Registry
  Torch -->|"registers"| Registry
  Fog -->|"registers"| Registry
  Granular -->|"registers"| Registry
  Water -->|"registers"| Registry
  FPCam -->|"registers"| Registry
  Post -->|"registers"| Registry
  Panel -->|"queries"| Registry
  Editor -->|"queries"| Registry
  PluginPanel -->|"queries"| Registry
```



Every system registers itself with the `PluginRegistry`. Communication flows through hooks, not direct imports.

---

## New File: `src/core/PluginRegistry.ts`

Central registry with typed hook interfaces. Key responsibilities:

- **Plugin metadata**: id, name, description, category, version, dependencies, status
- **Tool hooks**: `place()`, `remove()`, `getBrushSettings()`, `getToolPanelSliders()` -- queried by blockType
- **Terrain change hooks**: replaces `notifyDigAt()`, `notifyWaterChange()` -- DiggingSystem calls `registry.notifyTerrainChange()`, all registered listeners fire
- **Update hooks**: `onUpdate(dt, scene)` -- replaces DiggingSystem calling `updateTorches()` and `updateFogEmitters()` each frame
- **Save/load hooks**: `getSaveData()` / `loadSaveData()` -- replaces EditorUI importing each system's data functions
- **Undo/redo hooks**: `onUndoRedo()` -- replaces DiggingSystem calling `requestGranularResim()` and `requestWaterResim()`

```typescript
// Key interfaces
interface EditorPlugin {
  id: string;
  name: string;
  description: string;
  category: 'core' | 'rendering' | 'simulation' | 'tool' | 'ui';
  version: string;
  dependencies: string[];

  // Optional hooks
  onTerrainChange?: (x: number, y: number, z: number, radius: number) => void;
  onUpdate?: (dt: number, scene: THREE.Scene) => void;
  getSaveData?: () => { key: string; data: any };
  loadSaveData?: (data: any, scene: THREE.Scene) => void;
  onUndoRedo?: () => void;
  dispose?: () => void;
}

interface ToolPlugin extends EditorPlugin {
  blockType: number;
  place: (...args) => boolean;
  remove: (...args) => boolean;
  getBrushSettings: () => any;
  getToolPanelSliders: () => SliderDef[];
}
```

Singleton export: `pluginRegistry` with methods like `register()`, `getAll()`, `getById()`, `getToolForBlockType()`, `notifyTerrainChange()`, `notifyUndoRedo()`, `gatherSaveData()`, `broadcastLoad()`.

## New File: `src/ui/PluginPanel.ts`

Manages the plugin list panel accessible from the escape menu. Shows:

- All registered plugins grouped by category
- For each: name, description, version, active/inactive status
- Dependencies section: lists each dependency by name with a green/red dot showing if that dependency is present
- Styled in the existing baroque/grimdark theme (Cinzel headers, Crimson Text body, amber accents)

---

## Refactored Files

### 1. `src/systems/TorchSystem.ts`

- **Add**: Self-registration with `pluginRegistry.register()` and `pluginRegistry.registerTool()`
- **Add**: Dependency comment at top: `// Depends on: VoxelWorld (core)`
- **Add**: `getToolPanelSliders()` returning slider definitions (moves slider config out of ToolOptionsPanel)
- **Keep**: All existing logic (placement, particles, soot, etc.)
- **Remove**: Nothing (it's already fairly standalone)

### 2. `src/systems/FogEmitterSystem.ts`

- Same pattern as TorchSystem: self-register, expose tool panel sliders via hook

### 3. `src/systems/WaterSystem.ts`

- **Add**: Self-registration with terrain change hook (replaces `notifyWaterChange()`)
- **Add**: Undo/redo hook (replaces `requestWaterResim()`)
- **Add**: Save/load hooks, tool panel sliders hook
- **Keep**: All simulation logic
- **Export removal**: `notifyWaterChange` and `requestWaterResim` no longer need to be imported by DiggingSystem -- they become internal, triggered via registry hooks

### 4. `src/systems/GranularSystem.ts`

- Same pattern: terrain change hook replaces `notifyDigAt()`, undo/redo hook replaces `requestGranularResim()`

### 5. `src/systems/DiggingSystem.ts` (biggest change)

- **Remove**: Direct imports of TorchSystem, FogEmitterSystem, GranularSystem, WaterSystem
- **Add**: Import only `pluginRegistry`
- **Replace**: `notifyDigAt()` / `notifyWaterChange()` calls with `pluginRegistry.notifyTerrainChange()`
- **Replace**: `placeTorch()` / `removeTorchNear()` etc. with `pluginRegistry.getToolForBlockType(bt).place()` / `.remove()`
- **Replace**: `updateTorches()` / `updateFogEmitters()` with `pluginRegistry.broadcastUpdate(dt, scene)`
- **Replace**: `requestGranularResim()` / `requestWaterResim()` with `pluginRegistry.notifyUndoRedo()`
- **Keep**: Import of FirstPersonCamera (for camera + lock state -- this is a core dependency, declared as such)
- **Keep**: Import of ToolOptionsPanel (for openPanel/isPanelOpen -- UI core dependency)

### 6. `src/systems/FirstPersonCamera.ts`

- **Add**: Self-registration as a core plugin
- **Keep**: PostProcessing and ToolOptionsPanel imports (both are core dependencies, declared clearly)

### 7. `src/ui/ToolOptionsPanel.ts`

- **Remove**: Direct imports of FogEmitterSystem, TorchSystem, WaterSystem
- **Add**: Import `pluginRegistry`
- **Replace**: `buildFogOptions()` / `buildTorchOptions()` / `buildSpringOptions()` with a generic `buildToolOptions()` that queries `pluginRegistry.getToolForBlockType(bt).getToolPanelSliders()` and builds sliders dynamically from the returned definitions

### 8. `src/ui/EditorUI.ts`

- **Remove**: Direct imports of DiggingSystem, TorchSystem, FogEmitterSystem
- **Add**: Import `pluginRegistry`
- **Replace**: `getTorchData()` / `getFogEmitterData()` with `pluginRegistry.gatherSaveData()`
- **Replace**: `loadTorchData()` / `loadFogEmitterData()` with `pluginRegistry.broadcastLoad(data, scene)`
- **Keep**: VoxelWorld/TerrainSurfaceRenderer imports (core infrastructure)

### 9. `src/main.ts`

- **Simplify**: Remove most direct system imports
- **Add**: Import `pluginRegistry` and `initPluginPanel`
- **Keep**: Plugin `.withPlugin()` registration (this is the VibeGame ECS plugin system -- separate from our metadata registry)
- System init calls (`initDigging`, `initGranular`, `initWater`) remain since they wire VoxelWorld/TerrainSurfaceRenderer, but the cross-system coupling is gone

### 10. `index.html`

- **Add**: "Plugins" button in the escape menu center card (under the File section)
- **Add**: Plugin panel HTML container (`#plugin-panel`) -- a scrollable overlay that lists all plugins
- **Add**: CSS for the plugin panel (same baroque theme: dark background, amber accents, Cinzel headers)

---

## Implementation Order

The work is sequenced so the project stays compilable at each step:

1. Create `PluginRegistry.ts` (no existing code depends on it yet)
2. Have each system register itself (additive -- existing imports still work)
3. Refactor consumers (DiggingSystem, ToolOptionsPanel, EditorUI) to use registry instead of direct imports
4. Remove now-unused direct exports/imports
5. Create PluginPanel UI
6. Add Plugin button to escape menu HTML


