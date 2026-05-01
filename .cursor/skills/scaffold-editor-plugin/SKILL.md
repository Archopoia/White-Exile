---
name: scaffold-editor-plugin
description: Scaffold a new EditorPlugin for the voxel cave engine. Generates a complete system file with global update loop, settings sliders, save/load, enable/disable, and HMR wiring. Use when the user wants to add a new global system, simulation, rendering effect, or says things like "add a weather system", "create a particle manager", "new ambient system", "add a physics layer".
lastReviewed: 2026-03-16
---

# Scaffold a New EditorPlugin

Generate a complete, engine-compliant EditorPlugin for a new global system (non-tool — no placement/removal).

EditorPlugins differ from ToolPlugins: they run globally (lighting, audio, post-processing, granular sim), have `onUpdate` for per-frame work, expose settings sliders, and don't place individual entities.

## Step 1: Gather Requirements

Ask the user (or infer from context):

1. **System name** (e.g. "Weather", "ParticleManager", "CaveAmbience") — used for file/variable names
2. **Category** — one of: `'core'`, `'rendering'`, `'simulation'`, `'tool'`, `'ui'`
3. **Needs per-frame update?** Most EditorPlugins do — weather ticks, audio adjusts, effects animate.
4. **Needs terrain change notifications?** Systems that react to digging/filling use `onTerrainChange`.
   - If yes, also choose dispatch policy: `terrainChangeMode` (`immediate` / `deferred` / `coalesced`) and optional priority/timing fields.
5. **Has settings sliders?** Most do — exposed in the escape menu settings panel.
6. **Has a Web Worker?** Heavy simulations run off-thread. If yes, also use the `scaffold-simulation-worker` skill.
7. **Needs startup warmup?** Expensive render/model setup should use plugin `prewarm(ctx, reportProgress)`.

Sensible defaults:
- Runtime infrastructure -> category `'core'`
- Visual effects → category `'rendering'`, with `onUpdate`
- Simulations → category `'simulation'`, with `onUpdate` + optional `onTerrainChange`
- UI/editor orchestration -> category `'ui'`

## Step 2: Create the System File

Create `src/systems/<Name>System.ts`. Use this template:

```typescript
/**
 * <Name>System.ts
 *
 * EditorPlugin for <short description>.
 * Self-registers with the PluginRegistry at module load.
 *
 * Depends on: PluginRegistry
 */

import * as THREE from 'three';
import { pluginRegistry, type EditorPlugin } from '../core/PluginRegistry.ts';
import { markDirty } from '../core/AutoSaveIntent.ts';

// ── HMR state restoration ─────────────────────────────────────
const _hmr = import.meta.hot?.data as Record<string, any> | undefined;

// ── Configuration ─────────────────────────────────────────────

const SIM_INTERVAL_MS = 50; // Fixed-tick interval (adjust per system)

// ── Settings (persisted via save/load) ────────────────────────

interface <Name>Settings {
  enabled: boolean;
  // TODO: Add setting fields (e.g. intensity, speed, density)
  intensity: number;
}

const settings: <Name>Settings = _hmr?.settings ?? {
  enabled: true,
  intensity: 1.0,
};

// ── Internal state ────────────────────────────────────────────

let sceneRef: THREE.Scene | null = _hmr?.sceneRef ?? null;
let tickAccumulator: number = _hmr?.tickAccumulator ?? 0;

// ── Initialization ────────────────────────────────────────────

function init(scene: THREE.Scene): void {
  sceneRef = scene;

  // TODO: Create GPU resources, scene objects, audio nodes, etc.
  // Keep references so they survive HMR via hot.data.

  console.log('[<Name>System] Initialized');
}

// ── Per-frame update ──────────────────────────────────────────

function update(dt: number, scene: THREE.Scene, camera: THREE.Camera): void {
  // Lazy init on first update
  if (!sceneRef) init(scene);

  // Fixed-tick accumulator pattern (for simulations)
  tickAccumulator += dt * 1000;
  while (tickAccumulator >= SIM_INTERVAL_MS) {
    tickAccumulator -= SIM_INTERVAL_MS;
    tick();
  }

  // Per-frame visual updates (interpolation, animations, etc.)
  // TODO: Update visuals here
}

function tick(): void {
  // TODO: Fixed-interval simulation step
  // Keep this as pure math on typed arrays where possible.
}

// ── Terrain change notification ───────────────────────────────

function onTerrainChange(cx: number, cy: number, cz: number, radius: number): void {
  // TODO: React to terrain edits near (cx, cy, cz) within radius.
  // Only implement if the system needs to respond to digging/filling.
}

// ── Settings getters/setters (for escape menu sliders) ────────

export function get<Name>Intensity(): number { return settings.intensity; }
export function set<Name>Intensity(v: number): void {
  settings.intensity = v;
  markDirty('plugin', '<name>-intensity');
}

// TODO: Add more getters/setters as needed

// ── Visibility toggle ─────────────────────────────────────────

function setVisible(visible: boolean): void {
  // TODO: Show/hide all scene objects managed by this system
}

// ── Save / Load ───────────────────────────────────────────────

function getSaveData(): { key: string; data: Record<string, unknown> } {
  return {
    key: '<name>',
    data: { ...settings },
  };
}

function loadSaveData(data: Record<string, unknown>): void {
  if (!data) return;
  if (data.intensity !== undefined) settings.intensity = data.intensity as number;
  // TODO: Restore all setting fields
}

// ── Plugin registration ───────────────────────────────────────

const plugin: EditorPlugin = {
  id: '<name>-system',
  name: '<Name> System',
  description: '<Short description of this system>.',
  category: '<category>',
  version: '1.0.0',
  dependencies: [],

  onUpdate: (dt, scene, camera) => update(dt, scene, camera),

  onTerrainChange: (cx, cy, cz, r) => onTerrainChange(cx, cy, cz, r),

  onDisable: () => setVisible(false),
  onEnable: () => setVisible(true),

  onUndoRedo: () => {
    // TODO: Re-sync state after undo/redo if needed
  },

  getSaveData: () => getSaveData(),
  loadSaveData: (data) => loadSaveData(data),
};

if (_hmr?.hmr) {
  pluginRegistry.replace(plugin);
} else {
  pluginRegistry.register(plugin);
}

// ── Vite HMR ──────────────────────────────────────────────────
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose((data: Record<string, any>) => {
    data.hmr = true;
    data.settings = settings;
    data.sceneRef = sceneRef;
    data.tickAccumulator = tickAccumulator;
    // TODO: Save expensive resources (Workers, AudioContext, GPU objects)
    // through hot.data — don't destroy them.
  });
}
```

**Replace all placeholders:**
- `<Name>` -> PascalCase system name (e.g. `Weather`)
- `<name>` -> camelCase/lowercase (e.g. `weather`)
- `<category>` -> chosen plugin category
- `<Short description>` -> one-sentence description
- Fill in settings fields, init/update/tick logic, and save/load

## Step 3: Wire Up in main.ts

Add this import to `src/main.ts` alongside the other plugin imports:

```typescript
import './systems/<Name>System.ts';
```

## Step 4: Add Settings Sliders to Escape Menu

If the system has user-facing settings, add them to `src/ui/SettingsPanel.ts`.

Find the relevant section (rendering, atmosphere, simulation) and add slider entries:

```typescript
// In the appropriate settings section:
{
  label: '<Name> intensity',
  get: () => get<Name>Intensity(),
  set: (v) => set<Name>Intensity(v),
  min: 0, max: 5, step: 0.1, decimals: 1,
},
```

Import the getters/setters at the top of `SettingsPanel.ts`:

```typescript
import { get<Name>Intensity, set<Name>Intensity } from '../systems/<Name>System.ts';
```

## Step 5: Event Bus Integration (Optional)

If the system needs to communicate with other plugins:

```typescript
// Emit events for cross-plugin communication
pluginRegistry.emit('<name>:state-changed', { intensity: settings.intensity });

// Listen for events from other plugins
function onSomeEvent(data: unknown): void { /* ... */ }
pluginRegistry.on('some-plugin:event', onSomeEvent);

// Clean up in HMR dispose:
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    pluginRegistry.off('some-plugin:event', onSomeEvent);
    // ... other cleanup
  });
}
```

Document new events in `llms.txt` (canonical Event Bus section).

## Step 6: HMR Bridge Pattern (If Exporting Functions)

If the system exports functions consumed by other modules via static import (like `getIntensity()` used by `SettingsPanel.ts`), use the **bridge pattern** to prevent stale bindings:

```typescript
const _bridge = ((_hmr as any)?.bridge ?? {}) as Record<string, Function>;
if (import.meta.hot) (import.meta.hot.data as any).bridge = _bridge;

function getIntensityImpl(): number { return settings.intensity; }
_bridge.getIntensity = getIntensityImpl;

function _w_getIntensity(): number {
  return (_bridge.getIntensity as typeof getIntensityImpl)();
}
export { _w_getIntensity as get<Name>Intensity };
```

Only needed when the module self-accepts HMR (`import.meta.hot.accept()`) AND other modules hold static import references to its exports.

## Step 7: Verify Consistency Checklist

- [ ] `pluginRegistry.register()` called at module level (with `replace()` branch for HMR)
- [ ] `onUpdate` runs per-frame work (simulation tick, animations)
- [ ] `onTerrainChange` handles terrain edits (if applicable)
- [ ] `terrainChangeMode`/priority/min-interval options are set when deferred/coalesced fanout is needed
- [ ] `onDisable` / `onEnable` toggle visibility of all managed scene objects
- [ ] `getSaveData` / `loadSaveData` implemented for all settings
- [ ] `markDirty(scope, reason, urgency?)` called after state-changing operations
- [ ] Settings sliders added to SettingsPanel (if user-facing)
- [ ] Import added to `main.ts`
- [ ] File is under 500 lines (extract sub-modules if larger)
- [ ] **HMR:** `_hmr` state restoration at top of file
- [ ] **HMR:** `import.meta.hot.accept()` + `dispose()` at end of file
- [ ] **HMR:** `pluginRegistry.replace()` used on reload (not duplicate `register()`)
- [ ] **HMR:** Event bus listeners unsubscribed in `dispose()` (named functions + `off()`)
- [ ] **HMR:** Expensive resources (Workers, AudioContext, GPU objects) passed through `hot.data`
- [ ] `prewarm(ctx, reportProgress)` implemented for expensive startup work (if applicable)
- [ ] **HMR:** Bridge pattern used if exports are consumed by other modules via static import
- [ ] **Docs updated:** canonical sections in `llms.txt` (plugin table/event bus) and any affected architecture references
