# Debugging

## Goals

- Every line you read in a terminal or log file should answer: *who* (`connId`, `playerId`), *what* (`evt`), *where* (`svc`, `roomId`), *when* (timestamp), *why* (`msg` or context).
- A single `traceId` correlates a player's session across server, client, and (optionally) bot logs.
- Cursor can grep these files to reason about a session without re-running it.

## Server logs (Pino)

| Field | Meaning |
|------|---------|
| `time` | ISO timestamp |
| `level` | `info`, `warn`, `error`, `debug`, `fatal` |
| `svc` | always `tutelary-server` |
| `roomId` | room (currently always `default`) |
| `connId` | Socket.io connection id |
| `traceId` | UUID minted per connection, echoed in `server.welcome` |
| `playerId` | server-issued id, present after hello |
| `evt` | short event name (e.g. `player.joined`, `dropBurst.invalid`) |
| `msg` | human-readable string |

### Common events

- `server.listening` — boot complete
- `room.loop_started` — tick interval initialized
- `socket.connected` / `socket.disconnected` — raw connection lifecycle
- `player.joined` / `player.left` — post-hello logical lifecycle
- `dropBurst.rate_limit` / `extract.rate_limit` — token bucket rejected an intent
- `intent.dropBurst` / `intent.extract` — **accepted** burst or extract (see `dustAdded`, `essenceGained`, `origin` / `surfacePoint`)
- `intent.dropBurst.denied` / `intent.extract.denied` — server cooldown or other deny (`reason`)
- `intent.dropBurst.ignored` / `intent.extract.ignored` — client sent before hello (`before_hello`)
- `cursorMove.invalid`, `dropBurst.invalid`, `extract.invalid` — Zod parse failed
- `room.tick` — periodic summary every ~10s with `players`, `totalDust`, `planetRadius`

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3001` | HTTP port |
| `HOST` | `0.0.0.0` | bind host |
| `CORS_ORIGIN` | `http://localhost:5173` | allowed origin |
| `TICK_HZ` | `12` | server tick rate |
| `LOG_LEVEL` | `info` | pino level |
| `LOG_TO_FILE` | `0` | when `1`, also write to `LOG_FILE_PATH` (NDJSON) |
| `LOG_FILE_PATH` | `logs/dev.ndjson` | NDJSON sink path |
| `RATE_LIMIT_MSGS_PER_SEC` | `60` | catch-all rate limit |
| `BURST_PER_SEC` / `BURST_COOLDOWN_MS` | 8 / 80 | dropBurst limits |

### Save a session for Cursor

```bash
LOG_TO_FILE=1 LOG_LEVEL=debug pnpm dev:server
```

Then in another terminal run the client and bots normally. The server appends NDJSON to `logs/dev.ndjson`. Reference it from Cursor with `@logs/dev.ndjson` and ask questions like:

- "Which players hit `dropBurst.rate_limit` in the last run?"
- "Did any `cursorMove.invalid` lines appear and what payloads triggered them?"

### Useful greps (PowerShell or bash)

```bash
# All validation failures
rg '"evt":"[a-z]+\.invalid"' logs/dev.ndjson

# All events for a single trace
rg '"traceId":"<paste-id>"' logs/dev.ndjson

# Player join/leave timeline
rg '"evt":"(player\.joined|player\.left)"' logs/dev.ndjson

# Rate limiting hits
rg 'rate_limit' logs/dev.ndjson
```

## Client input log (browser console)

`apps/client/src/inputLog.ts` logs **`[tutelary-input]`** on every Space / E / click and on each `sendBurst` / `sendExtract` (including skips: disconnected or awaiting welcome). Open **DevTools → Console** on the game tab — these lines do **not** appear in the Vite terminal.

## Client debug logger

`apps/client/src/debug.ts` exposes `debugLogger` with a `[tutelary-client]` prefix.

Enable verbose logs by any of:

- `?debug=1` query string
- `localStorage.tutelaryDebug=1`
- `VITE_DEBUG=1` at build time

Logged events include `socket.connect`, `welcome` (with `traceId`), `connection.change`, `input.burst`, `input.extract`, `server.error`. Per-frame events are intentionally throttled.

## Bot logs

Bots use Pino with `svc: tutelary-bots`. Each bot log carries `botId` and `name` (e.g. `BOT_clicker_03`), so:

```bash
# All bots that disconnected
rg '"evt":"bot.disconnected"' <bots-stdout>

# Just one bot's lifecycle
rg '"name":"BOT_clicker_03"' <bots-stdout>
```

Pass `--seed N` to make bot motion reproducible across runs.

## Common pitfalls

- **No snapshots arriving**: check `CORS_ORIGIN` matches the Vite port. Server logs `socket.connected` immediately on TCP, but `player.joined` only after a valid hello.
- **`protocol_mismatch`**: the client and server are on different `PROTOCOL_VERSION`s — rebuild both packages.
- **Bursts feel ignored**: probably hitting `BURST_PER_SEC`. Watch for `dropBurst.rate_limit` warnings.
