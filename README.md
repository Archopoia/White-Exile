# White Exile

TypeScript monorepo: **one authoritative room**, Socket.io to browsers and tooling, **Zod** wire schemas in `packages/shared`, optional **headless bots**, **dev JSON persistence** for the room, **resume tokens**, and a **minimal Three.js** client (move intents + ESC session panel for a shared room note).

The stack is a focused multiplayer foundation you can grow into full simulation and UI for **White Exile**.

## Stack

| Part        | Role |
|------------|------|
| `apps/server` | Fastify (`/health`), Socket.io, tick loop, rate limits |
| `apps/client` | Vite, Three.js grid + avatars, DOM HUD |
| `packages/shared` | `PROTOCOL_VERSION`, event names, Zod payloads |
| `tools/bots` | `socket.io-client` load clients |

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

# Optional — bot flock
pnpm dev:bots -- --count 12 --mix wanderer,orbiter,drifter,afk
```

Combined:

```bash
pnpm dev:all
pnpm dev:full
```

Quick protocol check (server must be running):

```bash
pnpm smoke:net
```

## Client

- Click the canvas to focus, then **WASD**, **Space** / **Shift** for vertical motion. Move intents stream to the server; positions are clamped to a shared volume.
- **ESC** toggles the session panel: **Room note** is stored in authoritative `RoomSettings` and appears in every client’s HUD after **Apply**.

Display name and resume token are stored under `localStorage` keys `rtRoom.displayName` and `rtRoom.resumeToken`.

## Bots

CLI flags: `--count`, `--mix` (`wanderer`, `orbiter`, `drifter`, `afk`, `chaser`), `--seed`, `--url`, `--tickHz`, `--staggerMs`. Each bot uses a stable `resumeToken` so dev persistence can reattach the same record after a server restart.

## Quality

```bash
pnpm typecheck
pnpm test
pnpm lint
```

## Debugging

See [docs/debugging.md](docs/debugging.md) for log fields and environment variables.

If an old `apps/server/.dev-state/room.json` causes confusing headcount, delete that file while the server is stopped and start again.
