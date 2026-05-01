**Tutelary – Dust to Dominion**  
**MVP Game Design Document**

### 1. Core fantasy (one-sentence pitch)

In the black cosmic void, players are primordial tutelary spirits. Each spirit **spreads essence** (for a dust-tier spirit, that reads as motes falling through **3D space** toward a **real, shaded globe** at the origin). The shared planet’s scale reacts to **everyone’s combined essence spread** in the room, so the world swells as the session accretes activity. You grow your own presence on the sphere while the room’s globe becomes richer — from a speck to a tutelary-scale presence.

Inspired by Super Mario Galaxy’s spherical worlds: **full 3D** — a **lit sphere** in space, orbiting particle shells, and spirits moving around it. **No imported art pipeline**: no level editor, no external character models, no hand-authored textures required — the globe and VFX are **procedural** (generated meshes, shaders, particles). One central **3D** planet + other players’ spirits as glowing presences in the void.

### 2. MVP scope (narrow, weekend-prototype ready)

- Single shared room (10–200+ players via Socket.io).
- One central **3D** planet whose **mesh radius** tracks the **sum of all players’ essence spread** in the room (no separate shared “dust pool” counter).
- Infinite black space around the planet (**3D camera**: follow / orbit / zoom; feels like a tiny shared solar system).
- Every player starts as **Primordial Dust Spirit** (tier names stay flavor for later visual variety).
- **Incremental / clicker core**: passive essence spread drip + **click bursts** that spike spread (server-authoritative).
- Simple kin resonance (same-tier spirits near each other boost spread rate) — post-MVP tuning welcome.
- **One progression stat per player: essence spread** — cumulative “how much of your spirit-stuff you’ve released”; future unlocks hang off this number.
- Leaderboards (when you add them): highest essence spread, highest tier, etc.

Everything else (infinite flat map, biomes, multiple planets) is post-MVP.

### 3. Visual style & tech (100% VFX, procedural 3D — zero imported assets)

- **Stack (MVP target):** **WebGL 2** via **Three.js** (TypeScript). Optional **@react-three/fiber** + **@react-three/drei** if the client uses React for scene graph ergonomics; HUD remains DOM/React overlay above the canvas.
- **Screen start:** Pure black void with faint cosmic mist (**3D particle field** or instanced points).
- **Central planet — real 3D globe:**
  - **Geometry:** sphere (or subdivided icosphere if you later add displacement); **scale** from authoritative **aggregated essence spread → radius** curve (same style as before: gentle exponent + clamps).
  - **Look:** procedural material — emissive crust, rim/fresnel atmosphere, optional normal/noise in shader for “terrain” read without textures.
  - **Accretion VFX:** thousands of **world-space** motes: `THREE.Points` / instanced meshes / GPU-friendly batches spiraling toward the surface.
  - **SMG-adjacent vibe:** ring planes, halo glow (post-processing bloom optional), parallax from **multiple 3D layers**, not fake 2D disks.
- **Player spirit:** **3D position** in the play volume (plus on-screen name/tag via HUD or `drei` `<Html>`); trail VFX as world-space particles or ribbon-style strips.
- **Unified VFX primitive:** particles carry position, velocity, life, color, type, alpha in **3D** (cursor trails, falling motes, bursts, kin bonds).
- **Camera:** Soft follow on your spirit with wheel zoom; pull back to see many spirits orbiting one shared globe.

**Rendering is client-side** for responsiveness. **Server** remains authoritative for **essence spread**, validated intents, and **3D spirit positions** (compact quantized vectors per tick).

### 4. Core loop (incremental heart)

1. **Move your spirit** in **3D space** around the central globe.
2. **Passive spread:** small server-side essence spread drip while you’re in the room.
3. **Click burst:** sends a burst intent; server grants a burst-sized chunk of essence spread and broadcasts burst VFX for others.
4. **Kin resonance (later):** same-tier spirits **close in 3D** show bond VFX and get a spread-rate multiplier.

### 5. Progression (placeholder)

Higher **essence spread** gates future unlocks (shop, cosmetics, spirit-tier visuals, etc.) — specifics TBD in design passes; the MVP only needs the accumulating stat to be real and server-owned.

### 6. Multiplayer & balance

- Socket.io rooms.
- Server-authoritative on **per-player essence spread**, **aggregated planet radius**, and **3D spirit positions** (compact quantized vectors per tick).
