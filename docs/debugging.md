# Debugging

## Goals

Structured logs should answer *who* (`connId`, `playerId`), *what* (`evt`), *where* (`roomId`), *when* (timestamp), and *why* (`msg` or context).

## Log streams

The server fans out to two sinks (Pino multistream):

| Sink | Path | Purpose |
|------|------|---------|
| stdout | TTY | live triage during `pnpm dev:server` |
| file | `.cursor/logs/server.ndjson` | grep, replay, agent inspection |

The file sink is on by default in dev (`LOG_TO_FILE=1`). Override with `LOG_FILE_PATH=...`.

Useful one-liners:

```bash
# Tail the live stream (PowerShell)
Get-Content -Wait .cursor/logs/server.ndjson

# All sim events on one line (ripgrep)
rg '"evt":"(follower|ruin|combat|relic|caravan)' .cursor/logs/server.ndjson
```

## Pino fields

| Field | Meaning |
|------|---------|
| `time` | ISO timestamp |
| `level` | `info`, `warn`, `error`, `debug`, `fatal` |
| `svc` | `rt-room-server` or `rt-room-bots` |
| `roomId` | room id (default room is `default`) |
| `connId` | Socket.io connection id |
| `traceId` | UUID per connection (echoed in `server.welcome`) |
| `playerId` | issued after hello |
| `evt` | short event name |
| `msg` | human-readable string |

## Common events

### Lifecycle

- `logger.ready` — sinks initialised, includes resolved file path
- `server.listening` — HTTP + Socket.io up
- `world.generated` — initial spawn complete (`seed`, `followers`, `ruins`, `relics`)
- `room.loop_started` — tick interval started
- `socket.connected` / `socket.disconnected`
- `player.joined` / `player.resumed` (with `race`)
- `player.disconnected`
- `room.pruned` — soft-disconnects pruned past grace window

### Sim

- `room.tick` — about every 10s: `players`, `caravans`, `attachedFollowers`, `strandedFollowers`, `activatedRuins`, `claimedRelics`, `raceMix`
- `sim.tick_stats` — debug-level counters when something interesting happened
- `follower.rescued` — `playerId`, `followerId`, `kind`, `followerCount`
- `follower.lost` — owner fuel ran out long enough that morale collapsed
- `ruin.activated` — `playerId`, `ruinId`, `spawned`
- `relic.claimed` — `playerId`, `relicId`, `bonus`
- `combat.absorbed` — `winnerId`, `loserId`, `followerId`, `winnerLight`, `loserLight`
- `ghosts.spawned` / `ghosts.despawned` — internal sim ghost lifecycle

### Errors

- `move.invalid`, `roomSettingsPatch.invalid`, `rescue.invalid`, `activateRuin.invalid` — Zod rejected a payload
- `*.rate_limit` — token bucket rejected a message kind

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3001` | HTTP port |
| `HOST` | `0.0.0.0` | bind host |
| `CORS_ORIGIN` | `http://localhost:5173` | Socket.io / Fastify CORS |
| `TICK_HZ` | `12` | snapshot broadcast rate |
| `LOG_LEVEL` | `info` | Pino level |
| `LOG_TO_FILE` | `1` (dev) | NDJSON sink toggle |
| `LOG_FILE_PATH` | `<repo>/.cursor/logs/server.ndjson` | file sink path |
| `WORLD_SEED` | `13371` | initial world spawn seed |
| `GHOSTS_ENABLED` | `1` (dev) | spawn server-side fake caravans |
| `GHOST_COUNT` | `4` | how many ghosts |
| `GHOST_REAL_CAP` | `6` | despawn ghosts above this many real players |
| `DEV_PERSISTENCE` | on in dev | `0`/`false` to disable JSON room saves |
| `DEV_PERSISTENCE_PATH` | `.dev-state/room.json` | persistence file (cwd-relative) |
| `MOVE_RATE_PER_SEC` | `48` | move intent token bucket |
| `ROOM_SETTINGS_RATE_PER_SEC` | `8` | room settings patch bucket |
| `RESCUE_RATE_PER_SEC` | `6` | rescue + activate-ruin bucket |

## Client

`apps/client/src/inputLog.ts` prints **`[rt-room-input]`** lines for notable client-side skips.

`apps/client/src/debug.ts` uses **`[rt-room-client]`** when debug is on.

Enable debug logging:

- `?debug=1` on the client URL, or
- `localStorage.rtRoomDebug=1`

World labels (CSS2D): **T** cycles **off → keywords → full** (default full). Strings in `apps/client/src/worldLabels.ts`. Full key list is under **Esc → Session**.

## Bots

Pino `svc: rt-room-bots`. Each line includes `botId` and `name` (e.g. `BOT_rescuer_03`). Bots also send `bot.welcome` once the server returns the playerId; rescuer/deep-diver behaviors then read snapshots to choose follower / ruin targets.

## HMR

`apps/client/src/main.ts` registers Vite HMR dispose to tear down the scene and socket; the next hot accept reloads the module. `localStorage.rtRoom.resumeToken` lets the server reattach the same player after reconnect.
