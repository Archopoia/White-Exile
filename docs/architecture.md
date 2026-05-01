# Architecture

## High-level

```mermaid
flowchart LR
  Browser[Human Browser]
  BotProc[Bot Process]
  Fastify[Fastify HTTP and health]
  IO[Socket.io]
  Room[Room State]
  Sim[Tick Loop]
  Shared[packages shared]
  Browser -->|websocket| IO
  BotProc -->|websocket| IO
  Fastify --- IO
  IO --> Room
  Room --> Sim
  Sim --> Room
  Shared -.->|Zod schemas| Browser
  Shared -.->|Zod schemas| IO
  Shared -.->|Zod schemas| BotProc
```

## Authority

The server owns:

- `totalDust` (room-wide cumulative)
- per-player `essence`, `tier`, `position` (clamped to a play volume)
- planet radius (derived each snapshot from `totalDust`)
- burst and extract cooldowns

Clients send **intents** (`cursorMove`, `dropBurst`, `extract`); the server validates payloads with Zod, applies cooldowns and rate limits, and broadcasts authoritative `RoomSnapshot` and event messages. The client never decides essence amounts on its own.

## Wire protocol

The single source of truth lives in [`packages/shared/src/protocol.ts`](../packages/shared/src/protocol.ts):

- `PROTOCOL_VERSION` — bumped on breaking changes; mismatched clients are rejected on hello.
- `EVT.client.*` / `EVT.server.*` — typed event-name constants.
- Zod schemas exported alongside `type X = z.infer<typeof X>`.

```text
client.hello                  -> server.welcome | server.error(protocol_mismatch)
client.intent.cursorMove       (intent only)
client.intent.dropBurst        -> server.event.burst (broadcast) | server.error(rate_limit)
client.intent.extract          -> server.event.essence (private) | server.error(...)
                              <- server.snapshot.roomState (broadcast every tick)
```

## Tick loop

`apps/server/src/net.ts` schedules a `setInterval` at `TICK_HZ` (default 12 Hz). Each tick:

1. `Room.tick()` advances passive dust + essence accumulators.
2. A `RoomSnapshot` is built and broadcast.
3. Every `tickHz * 10` ticks the server emits a `room.tick` log line summarizing `totalDust`, `planetRadius`, and player count for low-frequency observability.

## Rendering (client)

`apps/client/src/scene.ts` runs a Three.js loop:

- Icosphere planet, scaled by `snap.planetRadius`.
- Additive atmosphere shell.
- Starfield (1200 points).
- Pooled dust particles (max 4096) with simple gravity toward origin.
- Local spirit projected onto a play sphere via raycast.
- Remote spirits added/removed from snapshots.

## Repository conventions

- **Always-applied rules**: see [`.cursor/rules/`](../.cursor/rules/).
- **Strict TypeScript**: `noUncheckedIndexedAccess`, no `any`.
- **One canonical name per concept**: `Essence`, `totalDust`, `spiritTier`. Update everywhere on rename (see `migration-and-terminology` agent).
- **No deprecated event aliases** unless the team explicitly approves.
