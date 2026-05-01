---
name: scaffold-blender-prop
description: Scaffold a new Blender prop model (static or animated) for the voxel cave engine. Generates a Python script that creates a multi-material GLB prop, registers it in the manifest, and wires it into PropSystem. Use when the user wants to add a new prop, environmental object, or says things like "add a lantern", "create a barrel", "new mushroom prop", "make a torch post".
lastReviewed: 2026-03-16
---

# Scaffold a New Blender Prop

Generate a Blender Python script that produces a GLB prop model compatible with the engine's PropSystem.

## Step 1: Gather Requirements

Ask the user (or infer from context):

1. **Prop name** (e.g. "lantern-post", "barrel", "stalagmite") — used for file naming
2. **Static or animated?** Static props have no moving parts. Animated props have a part that moves (swings, rotates, pulses).
3. **Material zones** — list the distinct visual zones (e.g. "wood post, iron frame, glass, candle flame"). Each becomes a separate tweakable material in the inspector.
4. **Which zones are emissive?** Glowing parts (fire, crystals, magic) use `make_mat_emissive`.
5. **For animated props:** What part moves? What's the pivot point? What kind of motion (pendulum swing, rotation, bobbing)?

## Step 2: Choose the Material Strategy

### CRITICAL: Use Separate Materials (Not Baked Textures)

Each visually distinct zone MUST get its own Principled BSDF material. This ensures:
- The in-engine inspector shows each material as a **separate tweakable colour swatch**
- Changing CandleMat changes the candle; changing WoodMat changes the post
- The GLB is small (no baked texture images, just PBR parameters)

| Zone type | Material factory | Example |
|-----------|-----------------|---------|
| Opaque solid (wood, stone, metal) | `make_mat(name, color_rgba, roughness)` | `make_mat('WoodMat', (0.28, 0.18, 0.08, 1.0), roughness=0.82)` |
| Emissive/glowing (fire, crystal, glass) | `make_mat_emissive(name, color_rgba, intensity, roughness)` | `make_mat_emissive('GlassMat', (0.85, 0.58, 0.15, 1.0), intensity=2.5, roughness=0.08)` |

### DO NOT use `make_mat_vertcol` + `bake_textures` for props with multiple visual zones. That pipeline bakes everything into one texture on one material, making the inspector useless.

## Step 3: Choose the Animation Strategy

### Static props — No armature needed

Join all parts into one mesh. Use `export_prop()` from `model_utils.py`. All sub-meshes are regular `THREE.Mesh` objects. Per-mesh scale and visibility work in the inspector.

### Animated props — Use Node Animation (NOT Armature)

**CRITICAL: Do NOT use an armature/skeleton.** Armatures produce `SkinnedMesh` objects in Three.js, which breaks per-mesh scale/visibility in the inspector.

Instead, use **node animation** — animate an Empty's transform:

1. **Split geometry into two groups:**
   - **Static group** (parts that don't move) → join into one mesh
   - **Moving group** (parts that swing/rotate/bob) → join into a separate mesh

2. **Create an Empty at the pivot point:**
   ```python
   bpy.ops.object.empty_add(type='PLAIN_AXES', location=PIVOT_POINT)
   pivot = bpy.context.active_object
   pivot.name = 'swing_pivot'
   ```

3. **Parent the moving mesh to the Empty:**
   ```python
   moving_mesh.parent = pivot
   moving_mesh.matrix_parent_inverse = pivot.matrix_world.inverted()
   ```

4. **Keyframe the Empty's rotation (not a bone):**
   ```python
   pivot.rotation_mode = 'XYZ'
   pivot.animation_data_create()
   pivot.animation_data.action = bpy.data.actions.new('MyAnimation')
   for frame in range(1, NUM_FRAMES + 2):  # +2 for loop-closing keyframe
       t = (frame - 1) / NUM_FRAMES
       angle = MAX_ANGLE * math.sin(2 * math.pi * t)
       pivot.rotation_euler = Euler((0, angle, 0), 'XYZ')
       pivot.keyframe_insert(data_path='rotation_euler', frame=frame)
   ```

5. **Export with standard glTF settings** (no armature to worry about).

### Animation Looping — Seamless Loops

Two rules to avoid a visible pop when the animation loops:

1. **All sine frequencies must be integers.** If you use compound motion (primary + secondary axes), the secondary frequency multiplier MUST be an integer (e.g. 2, 3). Irrational frequencies (like the golden ratio 1.618) don't complete full cycles, leaving the animation at a non-zero angle when the loop restarts.

2. **Add a loop-closing keyframe.** Keyframe `NUM_FRAMES + 1` frames (not `NUM_FRAMES`), where the last frame at `t = 1.0` has `sin(2π) = 0`, exactly matching the first frame at `t = 0`.

```python
# CORRECT: integer frequency, N+1 keyframes
FREQ = 2  # integer!
for frame in range(1, NUM_FRAMES + 2):
    t = (frame - 1) / NUM_FRAMES  # 0.0 to 1.0 inclusive
    angle = AMPLITUDE * math.sin(2 * math.pi * t * FREQ)
```

## Step 4: Create the Python Script

Create `blender/scripts/<name>.py`. Template:

```python
"""
<name>.py  —  <Short description>

Output: public/models/prop-<name>.glb
"""

import bpy, bmesh, os, sys, math, random
from mathutils import Vector, Euler

try:
    from mathutils import noise as bl_noise
    HAS_NOISE = True
except ImportError:
    HAS_NOISE = False

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from model_utils import clean_scene, select_only, smooth_shade, flat_shade, make_mat, make_mat_emissive

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'models')
OUTPUT_FILE = os.path.join(OUTPUT_DIR, 'prop-<name>.glb')

random.seed(<seed>)

# ── Dimensions ──────────────────────────────────────────────

# TODO: Define parametric dimensions here

# ── Geometry builders ───────────────────────────────────────

# TODO: One function per visual part (build_post, build_frame, etc.)
# Each returns a Blender mesh object.

# ── Main ────────────────────────────────────────────────────

def main():
    clean_scene()

    # 1. Create materials (one per visual zone)
    mat_a = make_mat('ZoneAMat', (R, G, B, 1.0), roughness=0.82)
    mat_b = make_mat_emissive('ZoneBMat', (R, G, B, 1.0), intensity=2.0, roughness=0.1)

    # 2. Build geometry, assign materials
    part_a = build_part_a()
    part_a.data.materials.append(mat_a)
    # ... more parts ...

    all_parts = [part_a, ...]

    # 3. Apply modifiers + transforms
    for obj in all_parts:
        select_only(obj)
        for mod in list(obj.modifiers):
            try: bpy.ops.object.modifier_apply(modifier=mod.name)
            except RuntimeError: pass
    for obj in all_parts:
        select_only(obj)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # 4a. STATIC: join all, export
    #     bpy.ops.object.select_all(action='DESELECT')
    #     for obj in all_parts: obj.select_set(True)
    #     bpy.context.view_layer.objects.active = all_parts[0]
    #     bpy.ops.object.join()
    #     from model_utils import export_prop
    #     export_prop(OUTPUT_FILE)

    # 4b. ANIMATED: split into static + moving groups, add Empty pivot, animate
    #     (see Step 3 above for full pattern)

main()
```

## Step 5: `model_utils.py` API Reference

| Function | Purpose |
|----------|---------|
| `clean_scene()` | Purge all objects, meshes, materials, images |
| `select_only(obj)` | Select one object and make it active |
| `smooth_shade(obj)` | Set all faces to smooth shading |
| `flat_shade(obj)` | Set all faces to flat shading |
| `make_mat(name, color, roughness)` | Solid-color Principled BSDF |
| `make_mat_emissive(name, color, intensity, roughness)` | Emissive Principled BSDF (base + emission) |
| `make_mat_vertcol(name, roughness)` | Vertex-color-driven material (for single-material props only) |
| `export_prop(filepath)` | Static GLB export (select all, export_apply=True) |

For animated props, write a custom export function:
```python
def export_animated_prop(filepath):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=filepath, export_format='GLB', use_selection=True,
        export_apply=True, export_materials='EXPORT', export_yup=True,
        export_animations=True, export_nla_strips=False, export_current_frame=False,
    )
```

## Step 6: Build and Register

```bash
# Generate the GLB
blender --background --python blender/scripts/<name>.py

# Regenerate the manifest (adds to props automatically)
node blender/generate-manifest.mjs
```

## Step 7: Add Variant Swatch in PropSystem

Open `src/systems/PropSystem.ts` and add a swatch colour to `PROP_VARIANT_SWATCHES`:

```typescript
const PROP_VARIANT_SWATCHES: Record<string, string> = {
  'crystal-cluster':   '#a86eff',
  'mushroom-cluster':  '#c87040',
  'stalactites':       '#8899aa',
  '<name>':            '<hex_color>',  // ← add this
};
```

The swatch key must match the prop id from the manifest (the `prop-` prefix is stripped).

## Step 8: Engine Integration — Emissive Material Tweaking

The PropSystem inspector already handles emissive materials correctly. When a user changes the colour picker for an emissive material, both `material.color` and `material.emissive` are updated (see `PropSystem.ts`). No extra wiring is needed.

## Step 9: Verify

1. `public/models/prop-<name>.glb` exists
2. `public/models/manifest.json` lists it under `props`
3. Launch the game, select the Prop tool, scroll to the new prop, place it
4. Open the inspector (E key) → confirm all material swatches appear and are tweakable
5. Confirm per-mesh scale/visibility controls work (under "Parts" subsection)
6. For animated props: confirm animation plays and loops seamlessly

## Naming Convention

File: `prop-<type>.glb` where `<type>` is lowercase-hyphenated (e.g. `lantern-post`, `crystal-cluster`).

The `generate-manifest.mjs` script auto-categorises any file matching `prop-*.glb` and derives the label from the type: `lantern-post` → `Lantern Post`.

## Quick Decision Matrix

| Question | → Use |
|----------|-------|
| Multiple visual zones? | Separate materials (`make_mat` / `make_mat_emissive` per zone) |
| Single uniform material? | `make_mat_vertcol` + `bake_textures` (crystal/mushroom pattern) |
| Has moving parts? | Node animation (Empty pivot, NOT armature) |
| No moving parts? | Static export via `export_prop()` |
| Glowing/emissive zone? | `make_mat_emissive(name, color, intensity, roughness)` |
| Looping animation? | Integer frequencies + N+1 keyframes for seamless loop |

## Common Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Used armature for animation | Per-mesh scale doesn't work in inspector; meshes are `SkinnedMesh` | Use Empty + node animation instead |
| Used single baked material | Only one colour swatch in inspector; all zones same look | Use separate materials per zone |
| Non-integer animation frequency | Visible pop/reset when animation loops | Use integer frequency multipliers |
| Forgot loop-closing keyframe | Slight jump at loop boundary | Keyframe N+1 frames (t=0 to t=1.0) |
| `export_apply=False` | Textures/modifiers may not export correctly | Always use `export_apply=True` |
| Vertex colors left on mesh | Three.js multiplies vertex colors with textures → washed out | Strip vertex color layers after baking, or don't use vertex colors with multi-material |
