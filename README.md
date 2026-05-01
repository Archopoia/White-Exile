# White Exile

Multiplayer survival caravan game in a dead-sun ash/snow world where **light = life** and survival is fundamentally social. See [`PITCH.md`](./PITCH.md) for the design.

This repo is a TypeScript monorepo: one authoritative server room, Socket.io to browsers, internal sim **ghosts** (fake caravans for density), external **bots** (full-protocol players that rescue, merge into caravans, and push deep), Zod wire schemas, dev JSON persistence, resume tokens, and a Three.js client.

## Stack

| Part | Role |
|------|------|
| `apps/server` | Fastify (`/health`), Socket.io, tick loop, world simulation, ghost manager, log fan-out to `.cursor/logs/` |
| `apps/client` | Vite + Three.js — race-tinted flames with shader fire + real shadow-casting torch light, dead-sun sky dome, zone-tinted fog, follower meshes, ruins, relics, HUD |
| `packages/shared` | `PROTOCOL_VERSION`, event names, Zod payloads, race profiles, light & fuel math, zone bands |
| `tools/bots` | `socket.io-client` agents — `rescuer`, `caravan-seeker`, `deep-diver`, plus the original load behaviors |

## Prerequisites

- Node.js 20+
- pnpm 10+ (`npm install -g pnpm`)

## Install

```bash
pnpm install
```

## Run

```bash
# Terminal 1 — API + WebSocket (default http://localhost:3001)
pnpm dev:server

# Terminal 2 — client (default http://localhost:5173)
pnpm dev:client

# Optional — full bot flock running the actual game loop
pnpm dev:bots -- --count 8 --mix rescuer,caravan-seeker,deep-diver,wanderer

# Server + client + bots in one terminal
pnpm dev:full
```

Quick protocol check (server must be running):

```bash
pnpm smoke:net
```

## Client

- **Esc** opens **Session** (tabbed, compact): **graphics quality**, **world labels**, and **dune height** (slider; live preview, commit on release → server `worldConfig.duneHeightScale` for everyone), **display name** (next session), **race** (read-only, server-assigned), plus **Help**. The shared **room note** is **HUD** only (no in-menu editor).
- **T** cycles floating **CSS2D** world labels (**off** → **keywords** → **full**; default **full**). Copy in `apps/client/src/worldLabels.ts`; proximity can surface **R** / **F** on nearby followers and ruins.
- HUD (corners): connection, room note, tick, race, zone, light, caravan, fuel, followers.

There are intentionally **no URL query parameters** for tunables. Per-client choices use the ESC menu and `localStorage`: identity (`rtRoom.displayName`, `rtRoom.resumeToken`, `rtRoom.race`), graphics tier/labels (`rtRoom.fx`, `rtRoomLabelsMode`), distance fog on/off (`rtRoom.fog`), fog strength (`rtRoom.fogMul`), fill lights (`rtRoom.fillMul`), tone exposure (`rtRoom.toneExposure`), sky haze (`rtRoom.skyHazeMul`). **Dune height** and the **room note** are room state (`roomSettingsPatch`); dune scale is authoritative for sim + visuals once applied.

## Bots

```
pnpm dev:bots -- --count <N> --mix <list> --seed <N> --tickHz <N> --staggerMs <N> [--race emberfolk|ashborn|lumen-kin]
```

Behaviors: `wanderer`, `orbiter`, `drifter`, `afk`, `chaser`, `rescuer`, `caravan-seeker`, `deep-diver`. Each bot uses a stable `resumeToken` so dev persistence reattaches the same record after a server restart. `rescuer` and `deep-diver` exercise the rescue and ruin-activation intents.

## Internal sim ghosts

The server can spawn server-side fake caravans (no Socket.io) so a solo client still sees movement. They despawn automatically when real (non-bot) players reach `GHOST_REAL_CAP`. Toggle with `GHOSTS_ENABLED=0`.

## Quality

```bash
pnpm typecheck
pnpm test       # 47 unit tests across shared, server, and bots
pnpm lint
```

## Logs

Server logs are pretty-printed on stdout **and** written as NDJSON to `.cursor/logs/server.ndjson`. Tail or grep that file from any tool (or agent) to see exactly what happened on the server. Set `LOG_TO_FILE=0` to skip the file sink, `LOG_FILE_PATH=...` to relocate it.

See [docs/debugging.md](docs/debugging.md) for log fields, environment variables, and structured event names.

If an old `apps/server/.dev-state/room.json` causes confusing headcount, delete that file while the server is stopped and start again.
