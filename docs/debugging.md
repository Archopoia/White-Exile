# Debugging

## Goals

Structured logs should answer *who* (`connId`, `playerId`), *what* (`evt`), *where* (`roomId`), *when* (timestamp), and *why* (`msg` or context).

## Server logs (Pino)

| Field | Meaning |
|------|---------|
| `time` | ISO timestamp |
| `level` | `info`, `warn`, `error`, `debug`, `fatal` |
| `svc` | `rt-room-server` |
| `roomId` | room id (default room is `default`) |
| `connId` | Socket.io connection id |
| `traceId` | UUID per connection (also in `server.welcome`) |
| `playerId` | issued after hello |
| `evt` | short event name |
| `msg` | human-readable string |

### Common events

- `server.listening` — HTTP + Socket.io up
- `room.loop_started` — tick interval started
- `socket.connected` / `socket.disconnected`
- `player.joined` / `player.resumed`
- `move.invalid`, `roomSettingsPatch.invalid` — Zod rejected a payload
- `roomSettingsPatch.rate_limit` — token bucket rejected
- `config.updated` — room settings changed (keys listed)
- `room.tick` — about every 10s: `players`, `tick`

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3001` | HTTP port |
| `HOST` | `0.0.0.0` | bind host |
| `CORS_ORIGIN` | `http://localhost:5173` | Socket.io / Fastify CORS |
| `TICK_HZ` | `12` | snapshot broadcast rate |
| `LOG_LEVEL` | `info` | Pino level |
| `DEV_PERSISTENCE` | on in dev | `0` / `false` to disable JSON room saves |
| `DEV_PERSISTENCE_PATH` | `.dev-state/room.json` | persistence file (cwd-relative) |
| `MOVE_RATE_PER_SEC` | `48` | move intent token bucket |
| `ROOM_SETTINGS_RATE_PER_SEC` | `8` | room settings patch bucket |

## Client

`apps/client/src/inputLog.ts` prints **`[rt-room-input]`** lines for notable client-side skips.

`apps/client/src/debug.ts` uses **`[rt-room-client]`** when debug is on.

Enable debug logging:

- `?debug=1` on the client URL, or
- `localStorage.rtRoomDebug=1`

## Bots

Pino `svc: rt-room-bots`. Each line includes `botId` and `name` (e.g. `BOT_wanderer_03`).

## HMR

`apps/client/src/main.ts` registers Vite HMR dispose to tear down the scene and socket; the next hot accept reloads the module. `localStorage.rtRoom.resumeToken` lets the server reattach the same player after reconnect.
