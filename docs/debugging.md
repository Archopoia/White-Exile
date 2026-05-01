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
- `dropBurst.rate_limit` — token bucket rejected a burst intent
- `intent.dropBurst` — **accepted** burst for **human** clients at `info`; bot traffic uses `debug` only (set `LOG_LEVEL=debug` to see bots)
- `intent.dropBurst.denied` — server cooldown or other deny (`reason`)
- `intent.dropBurst.ignored` — client sent before hello (`before_hello`)
- `cursorMove.invalid`, `dropBurst.invalid` — Zod parse failed
- `room.tick` — periodic summary every ~10s with `players`, `essenceSpreadSum`, `planetRadius`

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
| `BURST_ESSENCE_SPREAD` | `1.5` | burst adds `BURST_ESSENCE_SPREAD * (0.5 + 0.5 * intensity)` to `essenceSpread` |
| `PASSIVE_ESSENCE_SPREAD_PER_SEC` | `1.1` | passive essence spread per second while connected |
| `DEV_PERSISTENCE` | `1` (off in `NODE_ENV=production`) | persist Room JSON across `tsx watch` restarts |
| `DEV_PERSISTENCE_PATH` | `.dev-state/room.json` (relative to server cwd) | persisted room file |
| `DEV_PERSISTENCE_SAVE_MS` | `5000` | autosave interval |
| `BOT_GRACE_MS` / `HUMAN_GRACE_MS` | 10000 / 60000 | how long a soft-disconnected record waits for resume |
| `PRUNE_INTERVAL_MS` | `5000` | sweep cadence for pruning expired soft-disconnects |

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

`apps/client/src/inputLog.ts` logs **`[tutelary-input]`** on click and on each `sendBurst` (including skips: disconnected or awaiting welcome). Open **DevTools → Console** on the game tab — these lines do **not** appear in the Vite terminal.

## Client debug logger

`apps/client/src/debug.ts` exposes `debugLogger` with a `[tutelary-client]` prefix. When debug mode is **off**, only **errors** print — `info`/`warn`/`debug` are suppressed so the console is not flooded during normal play.

Enable verbose logs by any of:

- `?debug=1` query string
- `localStorage.tutelaryDebug=1`
- `VITE_DEBUG=1` at build time

Logged events include `socket.connect`, `welcome` (with `traceId`), `connection.change`, `server.error`. Per-frame events are intentionally throttled.

## Bot logs

Bots use Pino with `svc: tutelary-bots`. Each bot log carries `botId` and `name` (e.g. `BOT_clicker_03`), so:

```bash
# All bots that disconnected
rg '"evt":"bot.disconnected"' <bots-stdout>

# Just one bot's lifecycle
rg '"name":"BOT_clicker_03"' <bots-stdout>
```

Pass `--seed N` to make bot motion reproducible across runs.

## Hot-reload friendly dev loop

In dev (`NODE_ENV !== 'production'`), three layers cooperate so iterating doesn't reset the world:

1. **Server dev persistence** — Room state (player records + essence spread) autosaves to `.dev-state/room.json` under the server package (i.e. `apps/server/.dev-state/room.json` from the repo root) every `DEV_PERSISTENCE_SAVE_MS` and on shutdown. Loaded on next boot.
2. **Soft disconnect + resume token** — when a client (or bot) disconnects, its record stays in `disconnected: true` for `BOT_GRACE_MS` / `HUMAN_GRACE_MS`. A reconnecting client passes `resumeToken` (echoed in `server.welcome`) to re-attach instead of getting a fresh record. Watch for `player.resumed` vs `player.joined` in server logs.
3. **Client Vite HMR** — `apps/client/src/main.ts` self-accepts via `import.meta.hot.accept(...)`. Saving `scene.ts` / `hud.ts` / `net.ts` etc. swaps the running game in place; the socket reconnects with the cached `resumeToken` from `localStorage.tutelary.resumeToken` and the server reattaches you. Watch the browser console for `[tutelary-input] hmr.dispose` / `hmr.accepted`.

To wipe the dev world (start fresh): stop the server and delete `apps/server/.dev-state/room.json` (or whatever `DEV_PERSISTENCE_PATH` points at). To force-disable persistence even in dev: `DEV_PERSISTENCE=0 pnpm dev:server`.

Bots already pass a stable `resumeToken` of `bot-<seed>-<botId>`, so server restarts re-attach the same bot records (no ghost flicker waiting for GC).

## Common pitfalls

- **No snapshots arriving**: check `CORS_ORIGIN` matches the Vite port. Server logs `socket.connected` immediately on TCP, but `player.joined` only after a valid hello.
- **`protocol_mismatch`**: the client and server are on different `PROTOCOL_VERSION`s — rebuild both packages.
- **Bursts feel ignored**: probably hitting `BURST_PER_SEC`. Watch for `dropBurst.rate_limit` warnings.
- **HMR keeps doing full reload**: another module imported by `main.ts` is throwing during init. Check the Vite terminal for the underlying error; the next HMR cycle will succeed once it's clean.
