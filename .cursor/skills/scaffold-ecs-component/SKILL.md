---
name: scaffold-ecs-component
description: Scaffold a new ECS ComponentDef for the voxel cave engine. Generates a complete component definition with data shape, properties, gizmos, summary, and optional per-frame update. Use when the user wants to add a new component, entity behavior, or says things like "add a Burnable component", "create a Health component", "new Stamina stat", "make entities glow".
lastReviewed: 2026-03-16
---

# Scaffold a New ECS Component

Generate a complete ComponentDef for the entity component system.

## Step 1: Gather Requirements

Ask the user (or infer from context):

1. **Component name** (e.g. "Stamina", "Burnable", "Magnetic") — used for type names and id
2. **Data fields** — what values does the component store? (e.g. `maxStamina: number`, `isOnFire: boolean`)
3. **Category** — one of: `'physics'`, `'interaction'`, `'rpg'`, `'behavior'`, `'rendering'`, `'audio'`, `'ecology'`
4. **Needs per-frame update?** — does it tick every frame? (e.g. stamina regen, burn damage, magnetic pull)
5. **Has gizmos?** — spatial visualization? (e.g. radius sphere for magnetic pull, cone for audio source)

Sensible defaults:
- Health/Stamina/Stats → `'rpg'`, no gizmos, with `onUpdate` for regen
- Interactable/Trigger → `'interaction'`, sphere gizmo for radius
- Physics effects → `'physics'`, no update (driven by simulation)
- Visual effects → `'rendering'`, optional gizmo

## Step 2: Choose Placement

Components go in one of two locations:

| Placement | When to use |
|-----------|-------------|
| **Add to `src/core/RPGComponents.ts`** | RPG-related components (stats, inventory, quest, faction, loot) |
| **Create new file `src/components/<Name>Component.ts`** | Domain-specific components (physics, interaction, rendering, audio, behavior) |

For RPG components, add them alongside the existing `InventoryComponentDef`, `StatsComponentDef`, etc.

## Step 3: Create the Component Definition

Use this template:

```typescript
import { type ComponentDef } from '../core/ComponentRegistry.ts';
import type { PropertyDef } from '../core/InspectRegistry.ts';

// ── Data Shape ────────────────────────────────────────────────

export interface <Name>Data {
  // TODO: Define all fields with types and comments
  // Example:
  //   maxValue: number;
  //   currentValue: number;
  //   regenRate: number;
}

// ── Component Definition ──────────────────────────────────────

export const <Name>ComponentDef: ComponentDef<<Name>Data> = {
  id: '<name>',
  label: '<Name>',
  icon: '<emoji>',
  category: '<category>',
  description: '<Short description of what this component does.>',

  defaultData: () => ({
    // TODO: Set sensible defaults for all fields
  }),

  getProperties: (data, _entityId): PropertyDef[] => [
    {
      key: '<name>-header', label: '<emoji> <Name>', type: 'section',
      value: 0, onChange: () => {},
    },
    // TODO: Add PropertyDef for each editable field
    // Slider example:
    // {
    //   key: 'maxValue', label: 'Max Value', type: 'slider',
    //   value: data.maxValue, min: 0, max: 1000, step: 1, decimals: 0,
    //   onChange: (v: number) => { data.maxValue = v; },
    // },
    // Toggle example:
    // {
    //   key: 'enabled', label: 'Enabled', type: 'toggle',
    //   value: data.enabled, onChange: (v: boolean) => { data.enabled = v; },
    // },
    // Dropdown example:
    // {
    //   key: 'mode', label: 'Mode', type: 'dropdown',
    //   value: data.mode, options: ['fast', 'slow', 'pulse'],
    //   onChange: (v: string) => { data.mode = v; },
    // },
  ],

  getSummary: (data) => [
    // Return 1-2 short stat lines for the entity tooltip
    // Example: `Stamina: ${data.currentValue}/${data.maxValue}`
  ],

  // ── Optional: Gizmos (spatial visualization) ────────────────
  // Uncomment and customize if the component has spatial properties:
  //
  // getGizmos: (data, _entityId) => [
  //   { type: 'sphere', size: data.radius, color: '#FFD080' },
  // ],

  // ── Optional: Per-frame update ──────────────────────────────
  // Uncomment if the component needs to tick every frame:
  //
  // onUpdate: (data, entityId, dt) => {
  //   // Example: regenerate stamina
  //   // data.currentValue = Math.min(data.maxValue, data.currentValue + data.regenRate * dt);
  // },

  // ── Optional: Lifecycle hooks ───────────────────────────────
  //
  // onAttach: (data, entityId) => {
  //   // Called when component is first attached to an entity
  // },
  //
  // onDetach: (data, entityId) => {
  //   // Called when component is detached from an entity
  // },
};
```

**Replace all placeholders:**
- `<Name>` → PascalCase component name (e.g. `Stamina`)
- `<name>` → camelCase/lowercase id (e.g. `stamina`)
- `<emoji>` → appropriate Unicode emoji
- `<category>` → chosen ComponentCategory
- `<Short description>` → one-sentence description
- Fill in `defaultData()` with real default values
- Fill in `getProperties()` with PropertyDef entries for each field
- Fill in `getSummary()` with 1-2 tooltip stat lines

## Step 4: Register the Component

### If added to `src/core/RPGComponents.ts`:

Add the new `ComponentDef` to the `BUILTIN_RPG_COMPONENTS` array at the bottom of the file:

```typescript
const BUILTIN_RPG_COMPONENTS: ComponentDef[] = [
  InventoryComponentDef,
  QuestGiverComponentDef,
  FactionComponentDef,
  StatsComponentDef,
  LootTableComponentDef,
  <Name>ComponentDef,  // ← add here
];
```

### If in a new file:

Register it in `src/core/WorldInit.ts` alongside the other component registrations:

```typescript
import { <Name>ComponentDef } from '../components/<Name>Component.ts';
// ...
componentRegistry.registerComponent(<Name>ComponentDef);
```

## Step 5: PropertyDef Quick Reference

| PropertyDef type | Use for | Key fields |
|------------------|---------|------------|
| `'slider'` | Numeric values | `min`, `max`, `step`, `decimals`, `gizmo?` |
| `'toggle'` | Boolean on/off | — |
| `'color'` | Color picker | — |
| `'dropdown'` | Enum/preset choice | `options: string[]` |
| `'text'` | Text input | — |
| `'vec3'` | 3D vector | `labels?: [string, string, string]` |
| `'section'` | Collapsible group header | `collapsed?: boolean` |
| `'button'` | Action trigger | — |
| `'readonly'` | Display-only value | — |
| `'progress'` | Progress bar | `min`, `max` |
| `'array'` | List of items | `items`, `onAdd`, `onRemove` |
| `'curve'` | Bezier curve editor | `points` |
| `'asset'` | Asset reference picker | — |

## Step 6: GizmoDef Quick Reference

| GizmoDef type | Use for | Key fields |
|---------------|---------|------------|
| `'sphere'` | Radius visualization | `size` (radius), `color` |
| `'cylinder'` | Height/spread area | `size` (height), `color` |
| `'ring'` | Ground area | `size` (radius), `color` |
| `'arrow'` | Direction indicator | `size` (length), `color` |
| `'box'` | Bounding volume | `size` (half-extent), `color` |

All gizmo types support `offset?: [x, y, z]` for positioning relative to the entity origin.

## Step 7: Verify

1. Launch the game and place any entity (torch, NPC, prop, etc.)
2. Press **E** to open the inspector on the entity
3. Scroll to the **Components** section
4. Click **"Add Component"** and find the new component in the dropdown
5. Attach it — verify the properties appear and are editable
6. Verify gizmos appear (if applicable) when **G** key is active
7. Detach the component — verify cleanup
8. Save and reload — verify the component persists via auto-save
