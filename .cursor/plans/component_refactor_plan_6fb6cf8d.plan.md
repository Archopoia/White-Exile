---
name: Component Refactor Plan
overview: Refactor all hardcoded behaviors from TorchSystem, FogEmitterSystem, VFXSystem, and CharacterSystem into standalone, composable ComponentDefs that can be attached to any entity via the inspector. This requires upgrading the ComponentRegistry runtime, creating ~12 new ComponentDef files, and progressively migrating each system to delegate to components.
todos:
  - id: upgrade-component-hooks
    content: Upgrade ComponentDef hook signatures to pass ComponentContext (object, scene, camera) instead of bare entityId. Update EntityManager.updateAll(), attachComponent(), detachComponent(). Update ecs-tick plugin in WorldInit.ts to pass scene+camera.
    status: completed
  - id: point-light-component
    content: Create src/components/PointLightComponent.ts — manages THREE.PointLight lifecycle (onAttach creates, onDetach disposes, onUpdate syncs position). Register in WorldInit.
    status: completed
  - id: flicker-component
    content: Create src/components/FlickerComponent.ts — sine-wave modulation of sibling point-light intensity + position jitter. Extract from TorchSystem lines 436-451.
    status: completed
  - id: particle-emitter-component
    content: Create src/components/ParticleEmitterComponent.ts — config-driven particle pool with presets (fire, smoke, fog, drip, steam, etc.). Extract shared spawn/update from TorchSystem, FogEmitterSystem, VFXSystem.
    status: completed
  - id: soot-source-component
    content: Create src/components/SootSourceComponent.ts — wraps SmokePhysics soot API. Eliminates duplication between TorchSystem and FogEmitterSystem.
    status: completed
  - id: sound-emitter-component
    content: Create src/components/SoundEmitterComponent.ts — event-driven audio wiring via AudioSystem. Extract identical pattern from 4 systems.
    status: completed
  - id: heat-source-component
    content: Create src/components/HeatSourceComponent.ts — registers in queryable heat map. Create src/components/HeatReactiveComponent.ts — queries heat map to affect sibling particles.
    status: completed
  - id: shadow-pool-manager
    content: Create src/components/ShadowPoolManager.ts — queries all point-light entities, enables shadows on nearest N. Extract from TorchSystem lines 615-656.
    status: completed
  - id: character-ai-components
    content: Create WanderAIComponent, AnimationControllerComponent, EquipmentSlotComponent, BodyParamsComponent in src/components/. Extract AI state machine, animation, equipment, and body logic from CharacterSystem.
    status: completed
  - id: multi-instance-support
    content: Implement suffixed-ID factory pattern for multiple instances of same component type (e.g. particle-emitter:fire, particle-emitter:smoke on one entity).
    status: completed
  - id: migrate-torch-system
    content: Refactor TorchSystem to use component attachments in place(). Remove ~900 lines of inline behavior logic. Keep only mesh creation, distance culling dispatch, and orchestration.
    status: completed
  - id: migrate-fog-system
    content: Refactor FogEmitterSystem to use component attachments. Remove inline particle/soot/heat-reactive/audio logic.
    status: completed
  - id: migrate-vfx-system
    content: Refactor VFXSystem to use component attachments. Extract cross-VFX interactions into standalone module.
    status: completed
  - id: migrate-character-system
    content: Refactor CharacterSystem to use wander-ai, animation-controller, equipment-slot, body-params components. Keep model loading and orbit-inspect orchestration.
    status: completed
  - id: culling-integration
    content: Integrate distance culling and frustum culling into EntityManager.updateAll() so culled entities skip all component onUpdate calls automatically.
    status: completed
  - id: update-documentation
    content: Update llms.txt, engine-architecture.mdc, immersive-editor.mdc, Engine_Architecture.md, and Immersive_Editor_Principles.md to reflect new component architecture, reduced system descriptions, and src/components/ structure.
    status: completed
isProject: false
---

# Component Extraction Refactor

## Problem

Behaviors like point-light emission, particle effects, soot accumulation, sound, heat, flicker, and AI are hardcoded inside monolithic system files (TorchSystem ~1227 lines, VFXSystem ~1100+, FogEmitterSystem ~500+, CharacterSystem ~470+). The existing `ComponentRegistry` + `EntityManager` infrastructure supports composable `ComponentDef` types with `onAttach`/`onDetach`/`onUpdate` hooks, but these hooks are **data-only stubs** today — no component actually manages Three.js resources or runs real per-frame logic.

This means: you cannot give a mushroom prop a point light, make a crystal hum, or let a campfire produce soot — without writing an entire new system.

## Pre-Requisite: Upgrade ComponentDef Hooks

The current `onUpdate` signature is `(data: T, entityId: string, dt: number) => void`. Components that manage Three.js resources (lights, meshes, audio) need access to the entity's `Object3D` and the `scene`. Similarly, `onAttach` and `onDetach` need the entity's Object3D to add/remove children.

**Fix:** Introduce a `ComponentContext` parameter passed to all lifecycle hooks:

```typescript
// src/core/ComponentRegistry.ts — new interface
export interface ComponentContext {
  entityId: string;
  object: THREE.Object3D;   // entity's root Object3D
  position: THREE.Vector3;  // entity world position
  scene: THREE.Scene;       // for adding non-parented objects (lights)
  camera: THREE.Camera;     // for distance/frustum checks
}
```

Update the `ComponentDef` interface signatures:

- `onAttach(data, ctx)` — replaces `onAttach(data, entityId)`
- `onDetach(data, ctx)` — replaces `onDetach(data, entityId)`
- `onUpdate(data, ctx, dt)` — replaces `onUpdate(data, entityId, dt)`
- `getProperties(data, ctx)` — replaces `getProperties(data, entityId)`

Update `EntityManager.updateAll(dt, scene, camera)` to build `ComponentContext` from the `ManagedEntity` for each invocation. Update `attachComponent`/`detachComponent` similarly. The `ecs-tick` plugin in [WorldInit.ts](src/core/WorldInit.ts) already receives `dt` from `onUpdate(dt, scene, camera)` — just pass `scene` and `camera` through.

**Backward compat:** Existing components (`transform`, `interactable`, `flammable`, `physics-body`, all RPG components) use only `data` and `entityId` — they still work if we keep `entityId` on `ComponentContext`.

## New ComponentDef Files

All new files go in `src/components/`. Each file exports one `ComponentDef` and a registration function. Registration happens in [WorldInit.ts](src/core/WorldInit.ts) alongside the existing built-in registrations (lines 238-245).

### Phase 1 — Core Behavior Components (no system changes yet)

These define the ComponentDefs with full `onAttach`/`onDetach`/`onUpdate` logic. They are self-contained modules.

**1. `src/components/PointLightComponent.ts**` — `point-light`

- Data: `color`, `intensity`, `range`, `castShadow`, `shadowMapSize`, `offset` (vec3)
- `onAttach`: creates `THREE.PointLight`, adds to entity's Object3D (or scene for shadow perf)
- `onDetach`: disposes light, removes from parent
- `onUpdate`: syncs position from entity + offset
- Gizmo: wireframe sphere showing range
- Extracts logic from [TorchSystem.ts](src/systems/TorchSystem.ts) lines 289-299 and [VFXSystem.ts](src/systems/VFXSystem.ts) lines 422-441

**2. `src/components/FlickerComponent.ts**` — `flicker`

- Data: `phase`, `amplitude`, `frequencyLow/Mid/High`, `positionJitter`
- `onUpdate`: sine-wave modulation of sibling `point-light` intensity + position jitter
- Uses `entityManager.getComponentData(entityId, 'point-light')` to find the light
- Extracts logic from [TorchSystem.ts](src/systems/TorchSystem.ts) lines 436-451

**3. `src/components/ParticleEmitterComponent.ts**` — `particle-emitter`

- Data: `preset` (fire, smoke, fog, drip, steam, spores, etc.), `count`, `spawnRate`, `velocity`, `life`, `color`, `size`, `blending`
- `onAttach`: creates particle pool (mesh array) under entity Object3D
- `onDetach`: disposes all particle meshes/materials
- `onUpdate`: spawn/recycle/update particles per preset config
- Extracts the shared spawn/update pattern from [TorchSystem.ts](src/systems/TorchSystem.ts) lines 325-365/464-478 (fire), 150-198/507-539 (smoke), [FogEmitterSystem.ts](src/systems/FogEmitterSystem.ts) lines 170-254, and [VFXSystem.ts](src/systems/VFXSystem.ts) lines 232-408
- Preset-specific behaviors (billboard, gravity, Brownian drift) are config-driven, not if/else branches

**4. `src/components/SootSourceComponent.ts**` — `soot-source`

- Data: `rate`, `maxIntensity`, `maxRadius`, `color`
- `onAttach`: calls `addSootSource()` from [SmokePhysics.ts](src/systems/SmokePhysics.ts)
- `onDetach`: calls `clearSoot()` for this source
- `onUpdate`: calls `updateSoot()` + `updateSootColor()`
- Extracts duplicated soot logic from [TorchSystem.ts](src/systems/TorchSystem.ts) lines 326-328/544-556 AND [FogEmitterSystem.ts](src/systems/FogEmitterSystem.ts) lines 292-300/366-376

**5. `src/components/SoundEmitterComponent.ts**` — `sound-emitter`

- Data: `soundId`, `volume`, `pitch`, `loop`, `spatial`
- `onAttach`: emits `audio:attach-source` event for AudioSystem to pick up
- `onDetach`: emits `audio:detach-source`
- Inspector: volume/pitch sliders call `updateEntityAudioVolume`/`updateEntityAudioPitch` from [AudioSystem](src/systems/AudioSystem.ts)
- Extracts the identical audio wiring from TorchSystem, FogEmitterSystem, VFXSystem, and WaterSystem

**6. `src/components/HeatSourceComponent.ts**` — `heat-source`

- Data: `temperature`, `range`
- `onAttach`: registers in a global `heatSourceMap` (queryable by other components)
- `onDetach`: unregisters from map
- Gizmo: wireframe sphere showing heat range
- Replaces the implicit heat from [TorchSystem.ts](src/systems/TorchSystem.ts) and the manual `heatSources` list in [FogEmitterSystem.ts](src/systems/FogEmitterSystem.ts) lines 89-121

**7. `src/components/HeatReactiveComponent.ts**` — `heat-reactive`

- Data: `dissipationRate`, `velocityBoost`, `opacityReduction`
- `onUpdate`: queries `heatSourceMap`, modifies sibling `particle-emitter` particles based on proximity
- Extracts logic from [FogEmitterSystem.ts](src/systems/FogEmitterSystem.ts) lines 322-346

**8. `src/components/ShadowPoolComponent.ts**` — `shadow-pool` (singleton system-component)

- Not a per-entity component. Instead, a shared module: `src/components/ShadowPoolManager.ts`
- Queries all entities with `point-light` + `castShadow: true`, sorts by distance, enables shadows on nearest N
- Extracts logic from [TorchSystem.ts](src/systems/TorchSystem.ts) lines 615-656
- Runs as a lightweight EngineSystem or inside the `ecs-tick` update

### Phase 2 — Character/AI Components

**9. `src/components/WanderAIComponent.ts**` — `wander-ai`

- Data: `behaviour` (idle/wander/lookAround/facePlayer), `wanderRadius`, `wanderSpeed`, `decisionTimerMin/Max`, `facePlayerRange`, `wanderTarget`
- `onUpdate`: runs the AI state machine currently in [CharacterSystem.ts](src/systems/CharacterSystem.ts) lines 355-412
- Queries sibling `transform` to update position

**10. `src/components/AnimationControllerComponent.ts**` — `animation-controller`

- Data: `clips` (map of clip names), `currentClip`, `blendDuration`, `timeScale`
- `onAttach`: finds `AnimationMixer` on the entity's Object3D
- `onUpdate`: calls `mixer.update(dt)`, handles transitions
- Extracts animation logic from [CharacterSystem.ts](src/systems/CharacterSystem.ts) lines 314, 414-419

**11. `src/components/EquipmentSlotComponent.ts**` — `equipment-slot`

- Data: `slotType`, `equippedItemId`, `fittingParams`
- Delegates to existing [EquipmentManager.ts](src/equipment/EquipmentManager.ts)
- Extracts the equip/unequip wiring from [CharacterSystem.ts](src/systems/CharacterSystem.ts) lines 268-282

**12. `src/components/BodyParamsComponent.ts**` — `body-params`

- Data: bone scaling overrides map
- Delegates to existing [BodyEditor.ts](src/characters/BodyEditor.ts)
- Extracts body editing from [CharacterSystem.ts](src/systems/CharacterSystem.ts) lines 344-354

### Phase 3 — Migrate Systems to Use Components

Each system becomes a thin **orchestrator** that:

1. In `place()`: creates a mesh, calls `entityManager.createEntity()`, then attaches the appropriate components
2. In `remove()`: calls `entityManager.destroyEntity()` (components auto-detach via `onDetach`)
3. Shrinks its `onUpdate` to only handle system-level concerns (shadow pool, global soot shader uniforms)

**TorchSystem migration:**

- `place()` attaches: `transform`, `point-light`, `flicker`, `particle-emitter` (fire preset), `particle-emitter` (smoke preset — needs multi-instance support), `soot-source`, `sound-emitter`, `heat-source`, `flammable`
- `onUpdate` reduces to: distance culling dispatch + shadow pool manager
- Estimated reduction: ~1227 lines to ~300 lines

**FogEmitterSystem migration:**

- `place()` attaches: `transform`, `particle-emitter` (fog preset), `soot-source`, `sound-emitter`, `heat-reactive`
- `onUpdate` reduces to: distance culling dispatch
- Estimated reduction: ~500 lines to ~150 lines

**VFXSystem migration:**

- `place()` attaches: `transform`, `particle-emitter` (per-type preset), optionally `point-light` (Crystal/Wisps), `sound-emitter`
- Cross-VFX interactions become a standalone module `src/components/VFXInteractions.ts` that queries pairs of `particle-emitter` entities by preset type
- Estimated reduction: ~1100 lines to ~400 lines

**CharacterSystem migration:**

- `place()` attaches: `transform`, `interactable`, `wander-ai`, `animation-controller`, `equipment-slot`, `body-params`, `stats`
- `onUpdate` reduces to: distance culling + model loading orchestration
- Estimated reduction: ~470 lines to ~200 lines

### Multi-Instance Component Support

One entity may need multiple `particle-emitter` instances (torch: fire + smoke + ceiling smoke). Current `ComponentInstance` is keyed by `componentId`, so only one per type. Options:

- **Suffixed IDs**: `particle-emitter:fire`, `particle-emitter:smoke` — register as separate ComponentDefs with shared logic via a factory function
- **Array data**: Single `particle-emitter` component with `emitters: EmitterConfig[]` array
- Recommended: **Suffixed IDs with a factory** — keeps the inspector clean (each emitter gets its own collapsible section) and requires minimal changes to EntityManager

### Registration and Wiring

All new ComponentDefs are registered in [WorldInit.ts](src/core/WorldInit.ts) between lines 241-245, alongside the existing built-ins:

```typescript
import { registerBehaviorComponents } from '../components/index.ts';
// After existing registrations:
registerBehaviorComponents(); // registers all 12 new ComponentDefs
```

### Performance Considerations

- Components with `onUpdate` that need spatial queries (heat-reactive finding heat-sources) should maintain indexed data structures, not O(n^2) scans. The `heatSourceMap` pattern (spatial hash or simple array for <100 sources) keeps it fast.
- Particle pool sizes and spawn rates stay configurable per-component — no performance regression from the current system-owned pools.
- Distance culling and frustum culling move into component-aware utilities that EntityManager calls before `onUpdate` — skipping all component updates for culled entities.

### Documentation Updates

Per the Documentation Sync Rule, these files must be updated:

- [llms.txt](llms.txt) — new component types, updated plugin descriptions
- [.cursor/rules/engine-architecture.mdc](.cursor/rules/engine-architecture.mdc) — ComponentRegistry section, new `src/components/` structure
- [.cursor/rules/immersive-editor.mdc](.cursor/rules/immersive-editor.mdc) — plugin table (reduced descriptions), component list
- [docs/engine/Engine_Architecture.md](docs/engine/Engine_Architecture.md) — architecture diagrams
- [docs/editor/Immersive_Editor_Principles.md](docs/editor/Immersive_Editor_Principles.md) — component awareness section

