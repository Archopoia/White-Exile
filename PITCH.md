> **WHITE EXILE** — a multiplayer survival caravan game in a dead-sun ash/snow world where *light = life*, and survival is fundamentally social.
---

# 🎮 WHITE EXILE — GAME DESIGN DOCUMENT (MVP)

---

# 1. HIGH CONCEPT

A real-time multiplayer survival world set in an endless **ash-snow dune wasteland under a dead sky**.

Players form **wandering caravans** composed of:

* other players (same race or mixed encounters)
* NPC “Wanderers” (rescued survivors)
* shared light sources (core survival mechanic)

### Core truth:

> You survive by being near others.
> You expand by bringing light deeper into darkness.
> You collapse when isolated.

---

# 2. CORE PILLARS

### 🌑 1. Light = Everything

Single unified resource:

* warmth
* visibility
* safety
* follower stability
* exploration range

---

### 🧑‍🤝‍🧑 2. Social survival is physical, not abstract

No buffs, no percentages:

* proximity increases shared light radius
* caravans physically merge into larger glowing clusters
* isolation visibly deteriorates survival state

---

### 🌍 3. The world pushes back

* fog / ash reduces visibility
* colder/darker = more dangerous
* deeper zones contain better rewards but require larger caravans

---

### ⚔️ 4. Emergent conflict, not scripted PvP

* caravans compete for light dominance
* stronger light absorbs weaker groups
* NPCs are physically transferred via encounter outcomes

---

# 3. WORLD SYSTEM

## 🌍 Procedural Environment

* Endless 3D **ash/snow dune terrain**
* Generated in chunks around players (server authoritative seed)
* Fog volume increases with distance from light sources
* Ruins, relics, and abandoned caravans spawn in deeper zones

### Biome gradient:

| Zone          | Description                                            |
| ------------- | ------------------------------------------------------ |
| Safe Ashlands | visible, low fog, sparse resources                     |
| Grey Dunes    | moderate fog, survival pressure begins                 |
| Deep Ash      | near-zero visibility, high-value loot                  |
| Dead Zones    | extreme darkness, relic clusters, strong caravans only |

---

# 4. PLAYER SYSTEM

## 🧍 Player Entity

Each player is:

* a **caravan core**
* emits a **light field radius**
* controls movement + follower AI

### Stats (minimal):

* Light Radius
* Fuel (light stamina)
* Followers count
* Carry capacity

---

## 🧑‍🤝‍🧑 Followers (NPC SYSTEM)

Followers are **physical units**, not abstract stats.

### Types:

* Wanderers (rescued humans)
* Beasts (carry capacity)
* Lantern-bearers (extend light radius slightly)

### Acquisition:

1. **Rescue**

   * found in fog zones
   * visible only when light reaches them

2. **Ruins activation**

   * restore light structure → spawn group of followers

3. **Combat absorption**

   * defeated caravan → survivors become neutral → can be absorbed

---

### Behavior:

* stay inside caravan light radius
* panic and scatter if light drops too low
* physically follow leader caravan core

---

# 5. LIGHT SYSTEM (CORE MECHANIC)

## 🔥 Light Field Simulation

Each caravan emits a **dynamic light radius field**:

### Light formula (conceptual):

* base light = player + followers
* overlap = additive but with diminishing returns
* decay = distance from caravan center

### Effects:

* inside light → safe, visible, stable followers
* edge of light → fog distortion, reduced movement speed
* outside light → disorientation + follower loss

---

## 🌫️ Fog System (inverse light)

Fog is:

* world volume shader
* server-controlled density map

Fog increases:

* with distance from caravans
* in deeper zones
* during storms

Fog decreases:

* inside caravan light fields

---

# 6. CARAVAN SYSTEM (SOCIAL CORE)

## 🧑‍🤝‍🧑 Caravan Formation

Players automatically merge when:

* light fields overlap
* proximity sustained for X seconds

No UI needed.

### Result:

* followers merge into one group
* light fields combine
* movement becomes shared cluster

---

## 💔 Caravan Splitting

If player moves away:

* their light separates
* followers gradually drift back to stronger light source
* small caravans are unstable in deep zones

---

## ⚖️ Caravan Strength

Determined physically:

* number of players
* number of followers
* total light intensity

---

# 7. RACE SYSTEM

## 🎭 Races = visual + mechanical identity layer

Each race defines:

* light color (visual identity)
* follower style
* slight light behavior modifier

### Example:

* Emberfolk → warm, stable light, slower decay
* Ashborn → weak base light, stronger deep-zone resistance
* Lumen Kin → larger radius, but faster decay alone

---

## 🤝 Race Interaction

* same race → full light sharing efficiency
* different race → partial efficiency (e.g. 70%)
* encourages clustering but allows cross-race caravans

---

# 8. WORLD PROGRESSION (WHY GO DEEPER)

## 🔥 Deep Zones contain:

### 1. Lost caravans (mass follower gain)

* entire NPC groups frozen in fog
* require coordinated light to rescue

### 2. Relic light sources

* permanently increase caravan light radius
* rare progression upgrades

### 3. Rival caravans (player-driven risk)

* larger groups
* fight over light control zones

### 4. Ancient structures

* amplify light temporarily
* act as strategic hubs

---

# 9. COMBAT (VERY SIMPLE, EMERGENT)

No HP bars.

### Resolution rule:

* stronger light field **dominates space**
* weaker caravan enters “fog compression state”

Outcome:

* survivors scatter into fog
* winner absorbs survivors if they reach them in light radius

Combat = **spatial light dominance**

---

# 10. VIRAL LOOP (CORE DESIGN INTENT)

### Alone:

* low visibility
* slow movement
* follower instability
* survival pressure

### With others:

* shared light expands world
* safer exploration
* more followers rescued
* faster progression

### With many:

* caravans become mobile cities of light
* deep zones unlocked
* rare relic farming

---

# 11. SERVER ARCHITECTURE (YOUR EXISTING STACK INTEGRATION)

## 🧠 Authoritative Simulation

* Node.js server runs fixed tick loop
* all light/fog/follower logic simulated server-side
* clients receive snapshots only

---

## 🔌 WebSocket Real-Time Layer

* Socket.io or WS-based channel
* handshake includes:

  * protocol version
  * resume token
  * display name
  * race selection

---

## 🔁 Resume System

* persistent player identity
* short grace window reconnect restores caravan state
* followers persist if server memory still active

---

## ⚙️ Live Config System

Server broadcasts:

* fog density
* global light decay tuning
* spawn rates
* deep zone thresholds

All synced across clients.

---

## 🤖 Bot Systems

### 1. Internal simulation bots

* fake caravans for density
* help world feel alive

### 2. External bot clients

* full protocol participants
* useful for stress testing caravans and fog interactions

---

## 📊 Observability

* structured logs:

  * caravan ID
  * light radius
  * follower count
  * zone position
* periodic world state summaries
* trace IDs tied to player sessions

---

## ❤️ Health endpoint

* tick rate
* active caravans
* fog state
* version compatibility

---

# 12. CLIENT (3D DUNE EXPLORATION)

## 🎮 Rendering

* third-person camera above caravan
* procedural dune terrain (chunk streamed)
* fog volume shader driven by server state
* dynamic light radius shader (core visual hook)

---

## HUD (minimal)

* single light ring indicator
* follower count (optional)
* direction compass (very subtle)

No menus required for MVP loop.

---

# 13. MVP CORE LOOP (SINGLE SENTENCE)

> Move through an endless ash-snow desert where your light is your life; gather lost followers and fuel, merge with other caravans to expand your shared light radius, and push deeper into darkness where only large groups can survive and uncover relics—while isolation steadily dissolves your world into fog.



Got it — here is the **pragmatic product version of the design intent**, focused purely on:

* virality mechanics (why people invite friends)
* first-session hook (why it feels good instantly)
* retention loops (why they come back)
* accessibility (why it’s understandable in 10 seconds)
* multiplayer dependency (why more players = better game, not just “different”)

No abstraction. Just **product reality + player psychology + system behavior**.

---

# ❄️🔥 CORE PRODUCT GOAL (WHAT THIS GAME IS OPTIMIZED FOR)

> A player should *instantly understand*:
>
> “I survive alone… but I can only really progress if I bring others.”

Not through explanation — through **felt gameplay constraint**.

---

# 🎮 1. FIRST 30 SECONDS EXPERIENCE (CRITICAL VIRAL HOOK)

### What happens when you join alone:

* You spawn in a dark ash/snow desert
* You have a **small light radius**
* Fog closes in quickly outside your light
* Movement feels slightly unstable outside safe light

### Immediate discovery (no tutorial needed):

* You find a stranded NPC → it joins you
* Your light gets slightly bigger
* You feel safer instantly

Then:

* You walk 20–30 seconds further
* Fog gets thicker
* Your follower starts struggling if you're alone
* You see a distant **moving light cluster (another player caravan)**

### Your brain conclusion in <1 minute:

> “I should not be alone here.”

This is the core onboarding.

---

# 🧲 2. WHY PLAYERS INVITE FRIENDS (NOT OPTIONAL — MECHANICAL NEED)

This is the key virality design:

## ❗ The world is intentionally tuned so solo play is *suboptimal but possible*

### Alone:

* small light radius
* slow exploration
* follower loss risk
* cannot reach deep zones
* resources are limited

### With 2–3 friends:

* light radius expands noticeably
* fog becomes navigable
* followers stabilize
* exploration becomes faster

### With 5+ friends:

* new zones become accessible
* you can push into “deep fog” areas
* you can fight other caravans effectively

---

## 💡 So invitation behavior is NOT social — it is practical:

Players literally feel:

> “I cannot go further alone. I need people.”

---

# 🔥 3. CORE GAME LOOP (WHAT PLAYERS DO EVERY SESSION)

### Step 1 — Spawn alone or in small group

* weak light bubble
* fog pressure

### Step 2 — Collect followers (NPCs)

* rescue stranded figures
* they physically follow you
* increase light stability

### Step 3 — Encounter other players

* light bubbles overlap
* caravans merge naturally
* no menus, no invites

### Step 4 — Group becomes stronger caravan

* movement improves
* visibility increases
* deeper zones unlock

### Step 5 — Push into darkness for rewards

* better loot
* more NPCs
* rival caravans

### Step 6 — Risk separation

* going alone becomes risky again
* loop resets

---

# 🧠 4. WHY THE GAME IS ADDICTIVE (CONCRETE LOOPS)

## LOOP A — “Light Expansion Loop”

* get follower → light grows → explore further → find more followers → repeat

## LOOP B — “Safety Dependency Loop”

* alone → stress → find group → relief → stronger group → deeper push → split risk

## LOOP C — “Exploration Reward Loop”

* deeper zones = more NPCs + relics + danger
* creates push-pull tension

---

# 🧑‍🤝‍🧑 5. MULTIPLAYER IS NOT A FEATURE — IT IS A FORCE MULTIPLIER

### Key rule:

> Every additional player physically increases the “safe playable world radius.”

So:

* 1 player → small playable area
* 3 players → noticeably larger playable area
* 10 players → dramatically expanded world access

This is not UI logic — it is **fog + light simulation logic**

---

# ⚔️ 6. VIRALITY ENGINE (WHY PEOPLE SHARE IT)

Players share the game because:

## 1. “We can go further if you join”

* literal mechanical truth

## 2. “We are losing light without you”

* absence is felt in gameplay immediately

## 3. “Our caravan got bigger when you joined”

* visible change in world state

## 4. “We unlocked a new zone together”

* group achievement is spatial and visual, not abstract

---

# 🌫️ 7. WHY THE WORLD DESIGN SUPPORTS THIS

The ash/snow + dead sun world is not aesthetic — it enforces:

* low visibility → dependency on light fields
* isolation fear → fog encroachment
* group safety → shared visibility bubble
* exploration tension → unknown beyond light

So the environment literally says:

> “Stay together or lose perception of the world.”

---

# 🧍 8. PLAYER PROGRESSION (SIMPLE AND ADDICTIVE)

No XP. No skill trees.

Only:

## You grow by:

* collecting NPC followers
* surviving longer in cold zones
* merging with other caravans

### Growth is visible:

* bigger caravan cluster
* larger light radius
* more followers physically on screen

So progression feels like:

> “My presence in the world is growing.”

---

# 🌍 9. WHY PLAYERS STAY LONG TERM

Because:

## 1. The world literally expands with group size

## 2. New zones require cooperation to reach

## 3. Solo play becomes naturally limited

## 4. Group play feels like unlocking geography, not stats

## 5. Caravans become persistent social identity units

---

# 💥 FINAL PRODUCT SUMMARY (VERY IMPORTANT)

This game is designed so that:

### ✔ A player can understand it in 10 seconds:

> “I’m in a frozen dark world, I need light to survive, and I get stronger when I stay with others.”

### ✔ A player enjoys it alone:

* exploration
* follower collection
* survival tension

### ✔ A player is significantly stronger with friends:

* bigger light radius
* safer exploration
* access to deeper zones

### ✔ A player naturally invites others:

> not because of rewards — but because **the world becomes playable in new ways when they do**

---

