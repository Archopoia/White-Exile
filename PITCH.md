**Tutelary – Dust to Dominion**  
**MVP Game Design Document** 

### 1. Core Fantasy (one-sentence pitch)
In the black cosmic void, players are primordial tutelary spirits. Your glowing cursor constantly drops dust that falls toward the center of the screen and accretes into a single growing 3D planet globe. The more dust the entire room drops, the bigger and more beautiful the shared planet becomes. Early players literally birth the world; later players inherit a richer cosmos. You grow your own spirit while helping the planet — from dust speck to god-like tutelary.

Inspired by Super Mario Galaxy’s spherical gravity worlds but stripped to pure VFX: everything is particles, trails, and glowing accretion aside from the planet. No sprites, no 3D models, no level editor — just one central growing globe + floating cursors around it that can parse through the glove as in SMG.

### 2. MVP Scope (narrow, weekend-prototype ready)
- Single shared room (10–200+ players via Socket.io).
- One central planet that starts as a tiny glowing speck and grows into a massive, swirling globe.
- Infinite black space around the planet (camera follows your cursor with soft zoom).
- Every player starts as **Primordial Dust Spirit**.
- Only two upgrade trees: **Size** (bigger drops, bigger personal aura) and **Complexity** (unlock higher spirit tiers on prestige).
- Passive drop + click-burst core loop.
- Simple kin resonance (same-tier spirits near each other boost drop rate).
- One shared global currency: **Essence** (collected from the planet or by extracting from other players).
- Prestige system for permanent bonuses and spirit-tier ascension.
- Leaderboards: Total Dust Dropped, Largest Personal Contribution, Highest Spirit Tier.

Everything else (infinite flat map, biomes, multiple planets) is post-MVP.

### 3. Visual Style & Tech (100% VFX, zero assets)
- **Screen start**: Pure black void with faint cosmic mist particles.
- **Central Planet**: A single growing “3D globe” simulated in 2D Canvas (or light WebGL for extra glow):
  - Base: expanding circle with radial gradient (dark core → glowing crust).
  - Accretion: thousands of tiny dust particles orbit and slowly spiral inward, stacking on the surface.
  - Growth: planet radius = totalDustDropped ^ 0.6 (smooth, visible from tiny speck to screen-filling world).
  - Super-Mario-Galaxy vibe: subtle parallax layers of orbiting particle rings, soft “atmosphere” glow, and height-shaded dust piles that look like craters/mountains when zoomed in.
- **Player Cursor**: Your spirit = glowing core orb + name tag + constant particle trail of your current matter type (dust = sandy specks, later tiers = leafy wisps, water ripples, etc.).
- **All effects**: One unified Particle class (position, velocity, life, color, type, alpha). Handles:
  - Cursor trails
  - Dropped dust raining toward planet center
  - Accretion spirals on the globe
  - Kin resonance bonds (flowing energy rivers between nearby same-tier cursors)
  - Burst explosions on clicks
- **Camera**: Soft follow on your cursor with mouse-wheel zoom. When zoomed out you see the whole room as dozens of glowing cursors orbiting the shared planet like a tiny galaxy.

All rendering is client-side for instant juicy feedback. Server only tracks: cursor positions, totalDust, per-player Essence, and a tiny density grid for the planet surface (optional for MVP — can be pure math).

### 4. Core Loop (the addictive clicker heart)
1. **Move your cursor** freely in the black space around the central planet.
2. **Passive Drop**: Every frame your spirit automatically emits 1–3 dust/matter particles that arc downward toward the planet center and merge into the globe (visible falling + accretion VFX).
3. **Click / Drag Burst**: 
   - Tap = instant burst of your matter raining down.
   - Hold + drag = heavy continuous pour (feels like painting the planet into existence).
4. **Collect Essence**: Click anywhere on the planet surface → extraction beam pulls glowing essence back to you (shared planet gives everyone passive Essence ticks, but active clicks give big spikes).
5. **Kin Resonance**: Same-tier spirits close to each other create visible flowing bonds — everyone in the cluster gets +drop-rate multiplier (the “together we are stronger” payoff).

The planet grows in real time from everyone’s combined drops.

### 5. Progression & Spirit Tiers (incremental fantasy)
- **Currency**: Essence (gained from planet + raids).
- **Upgrade Trees** (clean radial menu, 6–8 options total in MVP):
  - **Mass Path**: bigger passive drop rate, larger personal aura, faster accretion bonus.
  - **Complexity Path**: prestige to unlock next spirit tier (new particle style + ability):
    - Tier 1: Dust (starting — sandy specks)
    - Tier 2: Flowing Water (ripples) / Flickering Fire (embers) / Windy Air (gust)
    - Tier 3: Verdant Growth (leafy particles)
    - Etc...
- Prestige (“Ascend” button): Keep permanent multipliers, restart in same room as higher tier. Early players become literal gods who shaped the planet; new joiners spawn into a living world.

### 6. Multiplayer & Balance
- Socket.io rooms.
- Server-authoritative on totalDust, Essence totals, and cursor positions (only 10–20 bytes per player per tick).

