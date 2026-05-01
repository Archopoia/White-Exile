---
name: ""
overview: ""
todos: []
isProject: false
---

# Plan: 2D Spritesheet Character Pipeline

**Classification:** `mixed` — `rendering/core` + `systems/editor/ui` + `docs/rules` + `.cursor/skills`  
**Last updated:** 2026-03-25  
**Specialist input:** `voxel-engine-specialist`, `plugin-and-systems`, `lead-programmer`, `architecture-and-docs`

---

## Goal

Deliver a **single canonical pipeline** so 2D characters (billboard quads with frame-stepped UV animation) can be authored under `public/sprites/<characterId>/`, described by a **typed manifest**, loaded and animated through **reusable runtime modules**, and **orchestrated** like existing NPCs (placement, culling, prewarm, optional save/inspect). The first concrete asset target is `**larva`** (`character_idle` / `character_walk` as separate WebP/PNG sheets per clip).

This enables a future **Cursor skill** (`scaffold-sprite-character`) to generate folder layout, manifest stub, and wiring hooks without a second “legacy” asset path.

---

## Touched Areas


| Area                   | Paths (expected)                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime (pure + Three) | `src/characters/sprites/`** — manifest types/IO, frame math, loader, animator                                                            |
| Billboard reuse        | `src/rendering/YAxisBillboard.ts` (consume only; no API break unless measured)                                                           |
| Orchestration          | `src/systems/CharacterSystem.ts` **or** new `src/systems/SpriteCharacterSystem.ts` (ToolPlugin), plus palette/registry if new tool entry |
| Prewarm / coverage     | `src/core/PluginPrewarmCoverage.ts`, `PluginPrewarmCoverageKeys.ts`, `PLUGIN_PREWARM_IDS` alignment with `character-system` or new id    |
| Events (if needed)     | `src/core/PluginRegistryEvents.types.ts` — extend `npc:*` payloads with discriminator vs new names                                       |
| Public assets          | `public/sprites/<id>/sprite-manifest.json`, textures                                                                                     |
| Tooling                | `tools/sprite-manifest-validate.mjs` (optional) or `npm` script; devDependency `sharp` optional for dimension probing                    |
| Docs                   | `llms.txt`, `docs/engine/Engine_Architecture.md`, `.cursor/rules/llm.mdc` ownership table                                                |
| Skill                  | `.cursor/skills/scaffold-sprite-character/SKILL.md`, `.cursor/rules/subagent-and-skill-routing.mdc`                                      |
| Tests                  | `tests/`** — frame math unit tests (pure TS, no GPU)                                                                                     |


---

## Canonical Docs And Rules

- `llms.txt` — §0 map, §1 anti-spaghetti table, §2 structure, §11 plugins, §12 Character System, event bus index  
- `docs/engine/Engine_Architecture.md` — NPC / orchestrator section, render ownership, prewarm  
- `.cursor/rules/llm.mdc` — ownership map mirror  
- `.cursor/rules/engine-architecture.mdc` — HMR, RenderGateway, prewarm, no spaghetti  
- `.cursor/rules/immersive-editor.mdc` — if save/load or inspector fields change  
- `src/core/RenderGateway.ts` — `requestEngineRender` + `owner: 'character-prewarm'` for probe/prewarm only

---

## Design Decisions (Canonical End State)

1. **Mesh + `PlaneGeometry` + `MeshBasicMaterial`**, not `THREE.Sprite`, so `**YAxisBillboard**` (Y-only yaw) matches NPC orientation behavior.
2. **Per-clip texture files** (e.g. `character_idle.webp`, `character_walk.webp`) are **first-class** in the manifest: each clip references its own `texture` path relative to the manifest directory. Optional **later** enhancement: single atlas + UV regions in the same schema version (only if profiling demands it — not in v1).
3. **One canonical loader**: `SpriteManifestIO` + `SpriteCharacterLoader`; **one animator**: `SpriteSheetAnimator` with API parity to `CharacterAnimator` (`play`, `transition`, `getState`, `update`, `dispose`).
4. **Orchestration**: **ToolPlugin** path mirroring `CharacterSystem` (`pluginRegistry`, `onUpdate`, prewarm). **No** new `EnginePlugin` in `main.ts` unless a measured need for draw-group ordering (default: avoid).
5. **Integration strategy (pick one during implementation — do not ship both):**
  - **A — Extend `CharacterSystem`** with a sprite mode / manifest branch (shared culling, save shape, palette).  
  - **B — `SpriteCharacterSystem` ToolPlugin** with shared utilities extracted to `src/characters/sprites/` and optional thin shared “character placement” helpers.  
   Recommendation from specialists: prefer **B** if `CharacterSystem.ts` is already near budget; prefer **A** if save format and palette should stay one “character” tool. **Decision record in PR.**
6. **No compatibility shims**: one manifest version field; invalid manifests fail at load with one clear error shape.
7. **RenderGateway**: runtime gameplay does **not** call `renderer.render`; prewarm uses `requestEngineRender` with `**owner: 'character-prewarm'`** and explicit reason string.

---

## Manifest Schema (v1)

**File:** `public/sprites/<characterId>/sprite-manifest.json`

```json
{
  "version": 1,
  "worldWidth": 1.0,
  "worldHeight": 1.0,
  "pixelated": true,
  "clips": {
    "idle": {
      "texture": "character_idle.webp",
      "layout": "strip",
      "frameWidth": 32,
      "frameHeight": 32,
      "frameCount": 8,
      "fps": 8,
      "loop": true
    },
    "walk": {
      "texture": "character_walk.webp",
      "layout": "strip",
      "frameWidth": 32,
      "frameHeight": 32,
      "frameCount": 8,
      "fps": 10,
      "loop": true
    }
  }
}
```

- `**layout`:** `strip` | `grid` (grid: require `columns`, `rows`, and validated `frameCount`).  
- **Validation:** `frameCount` ≤ grid capacity; image dimensions must match `frameWidth * columns` etc. (assert in loader; optional CLI check with `sharp`).  
- **Filtering:** `pixelated` → `NearestFilter`; else `LinearFilter`; `ClampToEdgeWrapping`.

---

## Plan (Phased)

### Phase 1 — Core runtime (no editor tool yet)

1. `**SpriteManifest.types.ts`** — Types + `parseSpriteManifest` (hand validation or small schema).
2. `**SpriteSheetFrameMath.ts**` — Pure functions: clip metadata + frame index → `repeat` / `offset`; unit tests.
3. `**SpriteManifestIO.ts**` — Fetch manifest; resolve URLs; optional in-memory cache with HMR dispose.
4. `**SpriteCharacterLoader.ts**` — For each clip: `TextureLoader.load`, configure wrap/filter/flipY, build `Map<clipName, { texture, runtimeMeta }>`. Return `SpriteCharacterResources` with `dispose()` for textures/materials.
5. `**SpriteSheetAnimator.ts**` — Current clip, frame time, `play` / `getState` / `update(dt)`; apply UVs each frame; **swap texture** when clip changes (per-clip textures).
6. `**SpriteCharacterMesh.ts` (optional small module)** — Create `PlaneGeometry` sized by `worldWidth`/`worldHeight`, `MeshBasicMaterial` (`transparent: true`, `depthWrite: false`, `alphaTest` optional).
7. **Manual test harness** — Temporary scene add in dev-only path or unit test with mocked `Texture` — **only if** needed before Phase 2; prefer frame-math tests + one visual smoke checklist.

### Phase 2 — World integration + billboard

1. **Billboard pass** — Each frame for each active sprite: `setYAxisBillboardQuaternion(mesh, camera)` (or `compute` + copy) using `**getThreeCamera()`** / engine camera from same context as `CharacterSystem`.
2. **Culling** — Reuse patterns from `CharacterSystem` (distance / frustum): when culled, skip UV/billboard work; policy for AI tick matches existing NPC rules.
3. **Orchestration** — Implement **Phase 1 choice A or B**: place sprite NPCs, register inspect/ECS analogously to GLB path where applicable.
4. **Prewarm** — In ToolPlugin `prewarm`: load manifest + textures; optional `requestEngineRender` for first compile; extend `**buildCharacterPrewarmCoverageKey`** (or sibling) with sprite manifest + clip URLs + renderer fingerprint; `**commitPluginCoverageSuccess**` — no new `localStorage` keys outside `**PluginPrewarmCoverage**`.
5. **Events** — Prefer extending `**npc:placed` / `npc:removed`** with `kind: 'sprite' | 'glb'` (or equivalent) in `**PluginRegistryEvents.types.ts**`.

### Phase 3 — Authoring automation + docs + skill

1. `**scaffold-sprite-character` SKILL.md`** — Steps: create` public/sprites//`, emit` sprite-manifest.json`template, list naming convention`character_.webp`, point to` SpriteManifestIO` contract.
2. **Optional `tools/` script** — Validate manifest against file presence; optional `sharp` to read dimensions and cross-check `frameCount` vs image size.
3. **Docs** — Update `llms.txt`, `Engine_Architecture.md`, `.cursor/rules/llm.mdc`; run `npm run check:docs-drift`.
4. **ADR (optional)** — `.cursor/skills/architecture-decision` or `docs/engine/adr/` if the repo stores ADRs there — record **ToolPlugin vs CharacterSystem extension** decision.

---

## Helper Routing (Subagents)


| Phase            | Subagent                    | Role                                                                   |
| ---------------- | --------------------------- | ---------------------------------------------------------------------- |
| Implementation   | `gameplay-programmer`       | Placement, behavior hooks, parity with NPC flows                       |
| Implementation   | `voxel-engine-specialist`   | Billboard edge cases, texture settings, prewarm render                 |
| Implementation   | `plugin-and-systems`        | ToolPlugin registration, HMR `replace`, event payloads                 |
| Implementation   | `ecs-and-components`        | Only if new ECS components / inspectables are required                 |
| Schema / renames | `migration-and-terminology` | Event names, save keys, public API naming                              |
| Docs             | `architecture-and-docs`     | `llms.txt` / `Engine_Architecture.md` / `llm.mdc` sync                 |
| Validation       | `test-runner`               | `npm run test`, `npm run check`                                        |
| Gate             | `verifier`                  | Non-trivial PRs: prewarm path, HMR dispose, no stray `renderer.render` |


---

## Validation

- `ReadLints` on all new/edited `src/`**  
- `npm run check` (tsc + docs drift)  
- `npm run test` (frame math + any new tests)  
- `npm run lint`  
- Manual: one sprite character visible in editor/play, clip swap idle↔walk, billboard tracks camera yaw, no first-frame hitch after prewarm (or document deferral per `DeferredToolPrewarmRuntime` if used)

---

## Risks / Open Questions


| Risk                            | Mitigation                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `flipY` / UV mismatch           | Centralize in `SpriteSheetFrameMath`; test one known asset (`larva`) early   |
| Transparency sorting vs terrain | `renderOrder`; document if issues persist                                    |
| `CharacterSystem.ts` size       | Prefer extracting shared NPC helpers before adding sprite branches           |
| Save/load                       | Align early with `getSaveData` / `loadSaveData` shape for `character-system` |
| Docs drift                      | Update `llms.txt` and `PluginRegistryEvents.types.ts` together               |


---

## Implementation Checklist (Quick)

- `src/characters/sprites/*.ts` (types, IO, math, loader, animator)  
- Tests for `SpriteSheetFrameMath`  
- ToolPlugin or `CharacterSystem` integration + billboard + culling  
- Prewarm + coverage key extension  
- `public/sprites/larva/sprite-manifest.json` (validated against real frame dimensions)  
- `llms.txt` + `Engine_Architecture.md` + `llm.mdc`  
- `.cursor/skills/scaffold-sprite-character/SKILL.md` + routing rule  
- `verifier` + `test-runner` clean on CI

---

## References

- `src/rendering/YAxisBillboard.ts`  
- `src/core/VibeEngine.ts` — system groups; plugin update order vs camera  
- `src/systems/CharacterSystem.ts` — NPC orchestration, prewarm, HMR  
- `src/core/RenderGateway.ts` — `character-prewarm`  
- `src/core/PluginPrewarmCoverage.ts` — coverage keys

