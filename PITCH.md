**Tutelary – Dust to Dominion**  
**MVP Game Design Document** 

### 1. Core Fantasy (one-sentence pitch)
In the black cosmic void, players are primordial tutelary spirits. Your glowing cursor constantly drops dust that falls through **3D space** toward a **real, shaded globe** at the origin and accretes into a single **mesh planet** that everyone shares. The more dust the entire room drops, the bigger and more beautiful the shared world becomes. Early players literally birth the world; later players inherit a richer cosmos. You grow your own spirit while helping the planet — from dust speck to god-like tutelary.

Inspired by Super Mario Galaxy’s spherical worlds: **full 3D** presentation — a **lit sphere** in space, orbiting particle shells, and spirits moving around it. **No imported art pipeline**: no level editor, no external character models, no hand-authored textures required — the globe and VFX are **procedural** (generated meshes, shaders, particles). One central growing **3D** planet + other players’ spirits as glowing presences in the void.

### 2. MVP Scope (narrow, weekend-prototype ready)
- Single shared room (10–200+ players via Socket.io).
- One central **3D** planet that starts as a tiny glowing speck and grows into a massive, swirling globe (**mesh radius** scales with shared progress).
- Infinite black space around the planet (**3D camera**: follow / orbit / zoom; feels like a tiny shared solar system).
- Every player starts as **Primordial Dust Spirit**.
- Only two upgrade trees: **Size** (bigger drops, bigger personal aura) and **Complexity** (unlock higher spirit tiers on prestige).
- Passive drop + click-burst core loop.
- Simple kin resonance (same-tier spirits near each other boost drop rate).
- One shared global currency: **Essence** (collected from the planet or by extracting from other players).
- Prestige system for permanent bonuses and spirit-tier ascension.
- Leaderboards: Total Dust Dropped, Largest Personal Contribution, Highest Spirit Tier.

Everything else (infinite flat map, biomes, multiple planets) is post-MVP.

### 3. Visual Style & Tech (100% VFX, procedural 3D — zero imported assets)
- **Stack (MVP target):** **WebGL 2** via **Three.js** (TypeScript). Optional **@react-three/fiber** + **@react-three/drei** if the client uses React for scene graph ergonomics; HUD remains DOM/React overlay above the canvas.
- **Screen start:** Pure black void with faint cosmic mist (**3D particle field** or instanced points).
- **Central planet — real 3D globe:**
  - **Geometry:** sphere (or subdivided icosphere if you later add displacement); **scale** driven by authoritative `totalDust` → radius curve (e.g. `radius ∝ totalDust^0.6` with sane clamps).
  - **Look:** procedural material — emissive crust, rim/fresnel atmosphere, optional normal/noise in shader for “terrain” read without textures.
  - **Accretion:** thousands of **world-space** dust motes: `THREE.Points` / instanced meshes / GPU-friendly batches spiraling onto the surface.
  - **SMG-adjacent vibe:** ring planes, halo glow (post-processing bloom optional), parallax from **multiple 3D layers**, not fake 2D disks.
- **Player spirit:** **3D position** in the play volume (plus on-screen name/tag via HUD or `drei` `<Html>`); trail VFX as world-space particles or ribbon-style strips.
- **Unified VFX primitive:** particles carry position, velocity, life, color, type, alpha in **3D** (cursor trails, falling dust, surface accretion, kin bonds, click bursts).
- **Camera:** Soft follow on your spirit with wheel zoom; pull back to see many spirits orbiting one shared globe.

**Rendering is client-side** for responsiveness. **Server** remains authoritative for economy and anti-cheat: `totalDust`, Essence, validated intents. **Cursor / spirit position** is replicated in **3D** (e.g. `x,y,z` in a shared coordinate space around the planet, quantized for bandwidth). Optional surface density grid can wait; MVP can stay **math + radius** driven.

### 4. Core Loop (the addictive clicker heart)
1. **Move your spirit** in **3D space** around the central globe (input mapped to motion in the void).
2. **Passive Drop:** Your spirit emits dust that arcs through **3D** toward the planet and merges into the globe (falling + accretion VFX).
3. **Click / Drag Burst:** Tap = burst; hold + drag = continuous pour (“painting” the world).
4. **Collect Essence:** Aim at the planet surface (raycast) → extraction beam; passive Essence ticks + active spikes.
5. **Kin Resonance:** Same-tier spirits **close in 3D** show bond VFX and get +drop-rate multiplier.

The planet grows in real time from everyone’s combined drops.

### 5. Progression & Spirit Tiers (incremental fantasy)
- **Currency:** Essence (gained from planet + raids).
- **Upgrade Trees** (clean radial menu, 6–8 options total in MVP):
  - **Mass Path:** bigger passive drop rate, larger personal aura, faster accretion bonus.
  - **Complexity Path:** prestige to unlock next spirit tier (new particle style + ability):
    - Tier 1: Dust (starting — sandy specks)
    - Tier 2: Flowing Water (ripples) / Flickering Fire (embers) / Windy Air (gust)
    - Tier 3: Verdant Growth (leafy particles)
    - Etc...
- Prestige (“Ascend” button): Keep permanent multipliers, restart in same room as higher tier. Early players become literal gods who shaped the planet; new joiners spawn into a living world.

### 6. Multiplayer & Balance
- Socket.io rooms.
- Server-authoritative on `totalDust`, Essence totals, and **3D spirit positions** (compact quantized vectors per tick; size budget similar to prior 2D spec, slightly larger per player for the third axis — still acceptable at MVP scale).
