# Tutelary Online

Real-time, browser-based shared cosmos: every player is a tutelary spirit dropping dust onto a single 3D globe. See [PITCH.md](PITCH.md) for the design.

## Stack

- TypeScript monorepo (pnpm workspaces).
- Server: Fastify + Socket.io + Pino, authoritative room state.
- Client: Vite + Three.js (WebGL 2), DOM HUD overlay.
- Shared: Zod schemas for the wire protocol and pure math.
- Bots: Node CLI driving real socket.io-client clients with pluggable behaviors.

## Layout

```
apps/
  client/   # Three.js scene, HUD, socket transport
  server/   # Fastify + Socket.io + Pino, authoritative room
packages/
  shared/   # Zod protocol schemas + planet math (single source of truth)
tools/
  bots/     # Pluggable AI clients (wanderer / orbiter / clicker / afk / chaser)
docs/
  architecture.md
  debugging.md
```

## Prerequisites

- Node.js 20+ (tested on 22)
- pnpm 10+ (`npm install -g pnpm`)

## One-time install

```bash
pnpm install
```

## Run a session

```bash
# Terminal 1: server (http://localhost:3001, /health for liveness)
pnpm dev:server

# Terminal 2: client (http://localhost:5173)
pnpm dev:client

# Terminal 3 (optional): a flock of bot players
pnpm dev:bots -- --count 12 --mix wanderer,orbiter,clicker,afk
```

Or run server + client together:

```bash
pnpm dev:all
```

Or server + client + 8 bots:

```bash
pnpm dev:full
```

Open the client URL, move the mouse to drift through the void, click anywhere to drop a dust burst, click on the planet to extract Essence.

## Bots

Bots are real Socket.io clients (not server-injected ghosts), so they exercise the same validation and rate-limiting paths as humans. All bot players are tagged `isBot: true` and have a `BOT_<behavior>_<n>` name for log filtering.

```bash
pnpm dev:bots -- --count 30 --mix wanderer,clicker --seed 42 --tickHz 8
```

CLI options:

- `--count` total bot count (default 8)
- `--mix` comma-separated behaviors: `wanderer,orbiter,clicker,afk,chaser`
- `--seed` deterministic RNG seed (default `Date.now()`)
- `--url` server URL (default `http://localhost:3001`)
- `--tickHz` per-bot tick rate (default 8)
- `--staggerMs` startup spacing (default 120)

## Tests, lint, types

```bash
pnpm typecheck
pnpm test
pnpm lint
```

## Debugging

See [docs/debugging.md](docs/debugging.md) for environment variables, log fields, and example greps you can paste into Cursor.
