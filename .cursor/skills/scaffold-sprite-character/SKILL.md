---
name: scaffold-sprite-character
description: Scaffold a new 2D spritesheet NPC for the voxel cave engine — public folder layout, sprite-manifest.json, and catalog entry in SpriteCharacterSystem. Use when the user wants a new 2D character, spritesheet NPC, or says "add sprite character", "new larva-style NPC".
lastReviewed: 2026-03-25
---

# Scaffold a 2D Spritesheet Character

## Layout

1. Create `public/sprites/<characterId>/`.
2. Add one or more horizontal strips or grids: `character_<clipName>.webp` (or `.png`).
3. Add `sprite-manifest.json` in that folder (see `public/sprites/larva/sprite-manifest.json`).

## Manifest (v1)

- `version`: `1`
- `worldWidth` / `worldHeight`: size of the quad in world units (feet at bottom center; mesh origin is bottom center via `SpriteCharacterMesh`).
- `pixelated`: `true` for pixel art (`NearestFilter`).
- `clips`: each clip has `texture` (file name), `layout` (`strip` or `grid`), `frameWidth`, `frameHeight`, `frameCount`, `fps`, `loop`. Grid clips require `columns` and `rows`.

## Runtime types

- Parser: `src/characters/sprites/SpriteManifest.types.ts` (`parseSpriteManifest`).
- UV math: `SpriteSheetFrameMath.ts`.
- Loader pool + per-instance texture clones: `SpriteCharacterLoader.ts`.
- Animator: `SpriteSheetAnimator.ts` (API mirrors `CharacterAnimator` for `play` / `transition` / `update`).

## Register in the editor

Add a preset to `SPRITE_PRESETS` in `src/systems/SpriteCharacterSystem.ts` (`id`, `label`, `manifest: '/sprites/<characterId>/sprite-manifest.json'`, `swatch`).

## Validate assets

```bash
node tools/sprite-manifest-validate.mjs public/sprites/<characterId>
```

## Doc pointers

- `llms.txt` §11 (`sprite-character-system`), §12 Character System (sprite bullet).
- `docs/engine/Engine_Architecture.md` (2D sprite NPCs paragraph).
