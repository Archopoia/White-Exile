---
name: scaffold-blender-character
description: Scaffold a new Blender character model for the voxel cave engine. Generates a Python script that creates a rigged GLB model using the standard 21-bone skeleton, then updates the manifest. Use when the user wants to add a new creature, NPC type, character model, or says things like "create a troll", "new creature", "add a spider NPC".
lastReviewed: 2026-03-16
---

# Scaffold a New Blender Character

Generate a Blender Python script that produces a rigged GLB character model compatible with the engine's CharacterSystem.

## Step 1: Gather Requirements

Ask the user (or infer from context):

1. **Creature name** (e.g. "troll", "mushroom-man") — used for file naming
2. **Body description** — general shape, limb proportions, distinguishing features
3. **Approximate height** in Blender units (goblins are ~1.1, humans ~1.7)
4. **Color palette** — 3-5 colors (linear RGB) for skin, details, clothing

## Step 2: Create the Python Script

Create `blender/scripts/<name>_npc.py` following this template (based on `goblin_npc.py`):

```python
"""
<name>_npc.py  —  <Description> NPC

Techniques used:
  - Skin modifier body with branching hands and feet
  - Sculpted UV sphere head with detail meshes
  - Vertex color painting for color variation
  - Armature with manual vertex group assignment
  - ~1500-3000 polys, game-ready

Blender coords: X=right, Y=forward, Z=up.  export_yup converts to Y-up.
"""

import bpy
import bmesh
import os
import sys
import math
from mathutils import Vector, Color

# Ensure this directory is on the path so we can import skeleton_standard
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from skeleton_standard import (
    build_standard_armature,
    assign_standard_weights,
    parent_meshes_to_armature,
    apply_all_transforms,
    export_character,
    select_only as std_select_only,
)

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'models')
OUTPUT_FILE = os.path.join(OUTPUT_DIR, 'npc-<name>.glb')

# ── Colors (linear RGB) ───────────────────────────────────────

COL_SKIN       = (0.0, 0.0, 0.0, 1.0)  # TODO: Set primary skin color
COL_SKIN_DARK  = (0.0, 0.0, 0.0, 1.0)  # TODO: Set darker skin variant
COL_DETAIL     = (0.0, 0.0, 0.0, 1.0)  # TODO: Set detail/clothing color

# ── Utilities ──────────────────────────────────────────────────

def clean_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for block in bpy.data.meshes:
        bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        bpy.data.materials.remove(block)

def create_material(name, base_color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = False
    mat.diffuse_color = base_color
    return mat

# ── Bone positions ─────────────────────────────────────────────
#
# Define Y-up bone head positions scaled to the creature's height.
# skeleton_standard.py uses these to build the armature.
# Convention: X=right, Y=forward, Z=up (Blender coords).
# Left limbs = positive X, Right limbs = negative X.
#
# Bones you don't need can be omitted — skeleton_standard auto-reparents
# children to the nearest ancestor.

HEIGHT = <height>  # Total character height in Blender units

BONE_POSITIONS = {
    'hips':       Vector((0, 0, HEIGHT * 0.45)),
    'torso':      Vector((0, 0, HEIGHT * 0.60)),
    'neck':       Vector((0, 0, HEIGHT * 0.82)),
    'head':       Vector((0, 0, HEIGHT * 0.88)),
    # Left arm
    'clavicleL':  Vector((0.10, 0, HEIGHT * 0.78)),
    'upperArmL':  Vector((0.18, 0, HEIGHT * 0.76)),
    'lowerArmL':  Vector((0.28, 0, HEIGHT * 0.58)),
    'handL':      Vector((0.34, 0, HEIGHT * 0.44)),
    # Right arm
    'clavicleR':  Vector((-0.10, 0, HEIGHT * 0.78)),
    'upperArmR':  Vector((-0.18, 0, HEIGHT * 0.76)),
    'lowerArmR':  Vector((-0.28, 0, HEIGHT * 0.58)),
    'handR':      Vector((-0.34, 0, HEIGHT * 0.44)),
    # Left leg
    'upperLegL':  Vector((0.08, 0, HEIGHT * 0.42)),
    'lowerLegL':  Vector((0.08, 0, HEIGHT * 0.22)),
    'footL':      Vector((0.08, 0.06, 0.0)),
    # Right leg
    'upperLegR':  Vector((-0.08, 0, HEIGHT * 0.42)),
    'lowerLegR':  Vector((-0.08, 0, HEIGHT * 0.22)),
    'footR':      Vector((-0.08, 0.06, 0.0)),
}

# ── Build body ─────────────────────────────────────────────────

def build_body():
    """
    Create the character's body geometry.
    TODO: Replace with actual body construction.

    Common approaches:
      - Skin modifier: Create an armature of edges, apply Skin modifier,
        set per-vertex radii for limb thickness. See goblin_npc.py.
      - Primitive composition: Combine UV spheres, cylinders, cones.
      - Sculpted mesh: Start from a subdivided cube, sculpt in edit mode.

    Must return a list of mesh objects to be parented to the armature.
    """
    # Placeholder: simple capsule body
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=16, ring_count=8,
        radius=HEIGHT * 0.15,
        location=(0, 0, HEIGHT * 0.55),
    )
    body = bpy.context.active_object
    body.name = '<Name>_Body'

    # Apply vertex colors
    if not body.data.color_attributes:
        body.data.color_attributes.new(name='Col', type='BYTE_COLOR', domain='CORNER')

    return [body]

def build_head():
    """
    Create the character's head.
    TODO: Replace with actual head construction.
    """
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=16, ring_count=12,
        radius=HEIGHT * 0.10,
        location=(0, 0.02, HEIGHT * 0.90),
    )
    head = bpy.context.active_object
    head.name = '<Name>_Head'

    if not head.data.color_attributes:
        head.data.color_attributes.new(name='Col', type='BYTE_COLOR', domain='CORNER')

    return head

# ── Main ───────────────────────────────────────────────────────

def main():
    clean_scene()

    # 1. Build geometry
    body_meshes = build_body()
    head = build_head()
    all_meshes = body_meshes + [head]

    # 2. Build armature from standard skeleton
    armature_obj = build_standard_armature(BONE_POSITIONS)

    # 3. Assign vertex weights
    for mesh in all_meshes:
        assign_standard_weights(mesh, armature_obj, BONE_POSITIONS)

    # 4. Parent meshes to armature
    parent_meshes_to_armature(all_meshes, armature_obj)

    # 5. Apply transforms
    apply_all_transforms(all_meshes + [armature_obj])

    # 6. Export
    export_character(OUTPUT_FILE, [armature_obj] + all_meshes)
    print(f'[<name>_npc] Exported to {OUTPUT_FILE}')

if __name__ == '__main__':
    main()
```

**Replace all placeholders:**
- `<name>` → lowercase hyphenated creature name (e.g. `troll`, `mushroom-man`)
- `<Name>` → PascalCase for variable names (e.g. `Troll`, `MushroomMan`)
- `<height>` → float height in Blender units
- `<Description>` → short creature description
- Fill in `COL_SKIN`, `COL_SKIN_DARK`, `COL_DETAIL` with real linear RGB values
- Implement `build_body()` and `build_head()` with actual geometry

## Step 3: Key Skeleton API Reference

From `blender/scripts/skeleton_standard.py`:

| Function | Purpose |
|----------|---------|
| `build_standard_armature(bone_positions)` | Creates armature with standard 21-bone hierarchy. `bone_positions` is a `dict[str, Vector]`. Bones not in the dict are skipped; children auto-reparent. |
| `assign_standard_weights(mesh, armature, bone_positions)` | Assigns vertex weights based on proximity to bones. |
| `parent_meshes_to_armature(meshes, armature)` | Parents mesh list to armature with Armature modifier. |
| `apply_all_transforms(objects)` | Applies location/rotation/scale on all objects. |
| `export_character(filepath, objects)` | Selects objects and exports as GLB with `export_yup=True`. |

## Step 4: Build and Register

After writing the script, run these commands:

```bash
# Run the Blender script to generate the GLB
blender --background --python blender/scripts/<name>_npc.py

# Regenerate the model manifest
node blender/generate-manifest.mjs
```

If `blender-watch.mjs` is running (`npm run blender:watch`), saving the `.py` file triggers the build automatically.

## Step 5: Verify

1. Check that `public/models/npc-<name>.glb` exists
2. Check that `public/models/manifest.json` includes the new model under `npcs`
3. Launch the game, select the NPC tool (key 3), scroll to the new model type, and place it
4. Verify the idle breathing animation works (all models share the same animation clips)

## Naming Convention

Files must follow these patterns for `generate-manifest.mjs` to categorize them:

| Pattern | Category | Example |
|---------|----------|---------|
| `npc-<body>.glb` | NPC character | `npc-troll.glb` |
| `equip-<slot>-<body>.glb` | Equipment | `equip-chestplate-troll.glb` |
| `prop-<type>.glb` | Static prop | `prop-mushroom-cluster.glb` |

Hyphens in `<body>` are preserved: `npc-goblin-fat.glb` has body id `goblin-fat`.
