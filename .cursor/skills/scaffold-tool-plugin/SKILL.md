---
name: scaffold-tool-plugin
description: Scaffold a new ToolPlugin for the voxel cave engine. Generates a complete system file with placement, removal, inspect integration, gizmos, save/load, and event bus wiring. Use when the user wants to add a new tool, create a new placeable entity type, or says things like "add crystals", "create traps", "new tool system".
lastReviewed: 2026-03-16
---

# Scaffold a New ToolPlugin

Generate a complete, engine-compliant ToolPlugin for a new placeable entity type.

## Step 1: Gather Requirements

Ask the user (or infer from context):

1. **Entity name** (e.g. "Crystal", "Trap", "Vine") — used for class/file/variable names
2. **Palette group** — existing (`'tool'`, `'npc'`, `'prop'`) or new (e.g. `'organism'`)
3. **Inspect category** — one of: `'light'`, `'atmosphere'`, `'water'`, `'organism'`, `'zone'`
4. **Does it use GLB models?** If yes, it follows the PropSystem pattern with ModelManifest. If no, it uses procedural Three.js geometry (like TorchSystem).

You can infer sensible defaults:
- Living things → category `'organism'`, palette group `'organism'`
- Environmental features → category `'zone'`, palette group `'prop'`
- Light/fire features → category `'light'`, palette group `'tool'`

## Step 2: Determine the Block Type ID

Read `src/core/VoxelWorld.ts` and find the highest `BlockType` value. The new entity gets the next integer.

Add the new constant:

```typescript
/** <Name> tool — not stored in voxel data, used as selection ID only. */
<NAME>: <next_id>,
```

## Step 3: Create the System File

Create `src/systems/<Name>System.ts`. Use this template (adapted from PropSystem):

```typescript
/**
 * <Name>System.ts
 *
 * ToolPlugin for placing and managing <name> entities in the cave world.
 * Self-registers with the PluginRegistry at module load.
 *
 * Depends on: PluginRegistry, InspectRegistry, Gizmos, VoxelWorld
 */

import * as THREE from 'three';
import { BlockType } from '../core/VoxelWorld.ts';
import { pluginRegistry, type ToolPlugin, type GhostHitInfo } from '../core/PluginRegistry.ts';
import { inspectRegistry, type PropertyDef, type InspectableEntity } from '../core/InspectRegistry.ts';
import { createSphereGizmo, removeGizmo } from '../ui/Gizmos.ts';
import { entityManager } from '../core/ComponentRegistry.ts';

// ── HMR state restoration ─────────────────────────────────────
const _hmr = import.meta.hot?.data as Record<string, any> | undefined;

// ── Configuration ─────────────────────────────────────────────

const MAX_ENTITIES = 100;
const REMOVE_RADIUS = 2.0;

// ── Brush settings ────────────────────────────────────────────

const currentBrush = _hmr?.currentBrush ?? {
  scale: 1.0,
};

// ── Types ─────────────────────────────────────────────────────

interface <Name>Entry {
  entityId: string;
  position: THREE.Vector3;
  group: THREE.Group;
  scale: number;
}

interface <Name>SaveEntry {
  x: number; y: number; z: number;
  scale?: number;
}

// ── State (restored from HMR data if available) ──────────────

const entities: <Name>Entry[] = _hmr?.entities ?? [];
let nextId: number = _hmr?.nextId ?? 1;

// ── Placement ─────────────────────────────────────────────────

function place<Name>(
  position: THREE.Vector3,
  scene: THREE.Scene,
): boolean {
  if (entities.length >= MAX_ENTITIES) {
    console.warn(`[<Name>System] Max entity count (${MAX_ENTITIES}) reached`);
    return false;
  }

  const entityId = `<name>-${nextId++}`;
  const s = currentBrush.scale;

  // TODO: Create your Three.js visual here (mesh, group, loaded GLB, etc.)
  const group = new THREE.Group();
  group.position.copy(position);
  group.scale.setScalar(s);
  scene.add(group);

  const entry: <Name>Entry = {
    entityId,
    position: position.clone(),
    group,
    scale: s,
  };

  entities.push(entry);

  inspectRegistry.register(buildInspectable(entry));
  createSphereGizmo(entityId, position, 1.5 * s, '<inspect_category>');

  // Register with ECS (parallel view for component queries)
  entityManager.createEntity('<name>-system', group, {
    id: entityId, skipInspect: true, category: '<inspect_category>', type: '<Name>', icon: '<emoji>',
  });
  entityManager.attachComponent(entityId, 'transform', {
    x: position.x, y: position.y, z: position.z,
  });
  // TODO: Attach additional default components as appropriate, e.g.:
  // entityManager.attachComponent(entityId, 'interactable', { radius: 1.5, prompt: 'Use' });

  pluginRegistry.emit('<name>:placed', {
    id: entityId,
    position: position.clone(),
  });

  return true;
}

function remove<Name>Near(
  position: THREE.Vector3,
  scene: THREE.Scene,
): boolean {
  let bestIdx = -1;
  let bestDist = REMOVE_RADIUS;

  for (let i = 0; i < entities.length; i++) {
    const d = entities[i].position.distanceTo(position);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  if (bestIdx === -1) return false;

  const entry = entities[bestIdx];
  inspectRegistry.unregister(entry.entityId);
  removeGizmo(entry.entityId);
  entityManager.destroyEntity(entry.entityId);
  scene.remove(entry.group);
  entities.splice(bestIdx, 1);

  pluginRegistry.emit('<name>:removed', {
    id: entry.entityId,
    position: entry.position.clone(),
  });

  return true;
}

// ── Inspect integration ───────────────────────────────────────

function buildInspectable(entry: <Name>Entry): InspectableEntity {
  return {
    id: entry.entityId,
    pluginId: '<name>-system',
    type: '<Name>',
    icon: '<emoji>',
    category: '<inspect_category>',
    object: entry.group,
    position: entry.position,

    getProperties(): PropertyDef[] {
      return [
        {
          key: 'header', label: '<emoji> <Name>', type: 'section',
          value: 0, onChange: () => {},
        },
        {
          key: 'scale', label: 'Scale', type: 'slider',
          value: entry.scale,
          min: 0.1, max: 5.0, step: 0.1, decimals: 1,
          gizmo: 'scale-uniform',
          onChange: (v: number) => {
            entry.scale = v;
            entry.group.scale.setScalar(v);
          },
        },
        // TODO: Add entity-specific properties here
      ];
    },

    getSummary(): string[] {
      return [`Scale: ${entry.scale.toFixed(1)}`];
    },
  };
}

// ── Save / Load ───────────────────────────────────────────────

function getSaveEntries(): <Name>SaveEntry[] {
  return entities.map(e => ({
    x: e.position.x, y: e.position.y, z: e.position.z,
    scale: e.scale,
  }));
}

function loadSaveEntries(data: <Name>SaveEntry[], scene: THREE.Scene): void {
  // Clear existing
  while (entities.length > 0) remove<Name>Near(entities[0].position, scene);
  // Recreate
  for (const d of data) {
    currentBrush.scale = d.scale ?? 1.0;
    place<Name>(new THREE.Vector3(d.x, d.y, d.z), scene);
  }
  currentBrush.scale = 1.0;
}

// ── Visibility toggle ─────────────────────────────────────────

function setVisible(visible: boolean): void {
  for (const e of entities) e.group.visible = visible;
}

// ── Tool properties ───────────────────────────────────────────

function getToolProperties(): PropertyDef[] {
  return [
    {
      key: 'scale',
      label: 'Scale',
      type: 'slider',
      value: currentBrush.scale,
      min: 0.1, max: 5.0, step: 0.1, decimals: 1,
      onChange: (v) => { currentBrush.scale = v; },
    },
    // TODO: Add brush-level sliders here
  ];
}

// ── Plugin registration ───────────────────────────────────────

const plugin: ToolPlugin = {
  id: '<name>-system',
  name: '<Name> System',
  description: '<Short description of this tool>.',
  category: 'tool',
  version: '1.0.0',
  dependencies: [],
  blockType: BlockType.<NAME>,
  paletteGroup: '<palette_group>',

  place: (position, normal, scene) => place<Name>(position, scene),
  remove: (position, scene) => remove<Name>Near(position, scene),
  getBrushSettings: () => ({ ...currentBrush }),
  getToolProperties,

  onDisable: () => setVisible(false),
  onEnable: () => setVisible(true),

  getSaveData: () => ({ key: '<name>s', data: getSaveEntries() }),
  loadSaveData: (data, scene) => loadSaveEntries(data, scene),

  onUndoRedo: () => {},
};

if (_hmr?.hmr) {
  pluginRegistry.replace(plugin);
} else {
  pluginRegistry.register(plugin);
}

// ── Vite HMR ──────────────────────────────────────────────────
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose((data) => {
    data.hmr = true;
    data.entities = entities;
    data.nextId = nextId;
    data.currentBrush = currentBrush;
  });
}
```

**Replace all placeholders:**
- `<Name>` → PascalCase entity name (e.g. `Crystal`)
- `<name>` → camelCase/lowercase (e.g. `crystal`)
- `<NAME>` → UPPER_CASE for BlockType (e.g. `CRYSTAL_CLUSTER`)
- `<emoji>` → appropriate Unicode emoji
- `<inspect_category>` → chosen InspectCategory
- `<palette_group>` → chosen palette group string
- `<Short description>` → one-sentence description

## Step 4: Wire Up in main.ts

Add this import to `src/main.ts` alongside the other plugin imports:

```typescript
import './systems/<Name>System.ts';
```

## Step 5: Palette Metadata (Runtime-Generated UI)

Do not edit `index.html` for tool slots. The palette DOM is generated at runtime from
`PaletteRegistry` / `ToolPalette`.

Set palette metadata on the plugin object:

```typescript
const plugin: ToolPlugin = {
  // ...
  paletteGroup: '<palette_group>',
  paletteCategoryLabel: '<Palette Category Label>',
  paletteCategoryOrder: <order_number>,
  paletteItemLabel: '<Name>',
  paletteItemSwatch: '<color>',
  // ...
};
```

- `<palette_group>` = grouping key used for scroll cycling (e.g. `npc`, `prop`)
- `<Palette Category Label>` = category title shown in palette UI
- `<order_number>` = lower values appear earlier in palette category ordering
- `<color>` = CSS color/gradient for the swatch (e.g. `#8c6bff`)

## Step 6: Verify Consistency Checklist

After creating the plugin, verify:

- [ ] `pluginRegistry.register()` called at module level (with `replace()` branch for HMR)
- [ ] `inspectRegistry.register()` in place function
- [ ] `inspectRegistry.unregister()` in remove function
- [ ] `getProperties()` returns `PropertyDef[]`
- [ ] `getSummary()` returns stat strings
- [ ] Gizmo created on place, removed on remove
- [ ] Events emitted: `<name>:placed`, `<name>:removed`
- [ ] `onDisable` / `onEnable` toggle visibility
- [ ] `getSaveData` / `loadSaveData` implemented
- [ ] BlockType constant added to VoxelWorld.ts
- [ ] Import added to main.ts
- [ ] Palette metadata set on plugin (`paletteGroup`, label/order/item label/swatch)
- [ ] `entityManager.createEntity()` in place function (with `skipInspect: true`)
- [ ] `entityManager.attachComponent()` for default components (transform, interactable, etc.)
- [ ] `entityManager.destroyEntity()` in remove function
- [ ] File is under 500 lines
- [ ] **HMR:** `_hmr` state restoration at top of file for entities, nextId, brush settings
- [ ] **HMR:** `import.meta.hot.accept()` + `dispose()` at end of file saves all mutable state
- [ ] **HMR:** `pluginRegistry.replace()` used on reload instead of duplicate `register()`
- [ ] **HMR:** Event bus listeners use named functions + `pluginRegistry.off()` in dispose (if any)
