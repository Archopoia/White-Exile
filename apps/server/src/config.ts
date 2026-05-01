/**
 * Centralized server configuration.
 *
 * Read-once-at-boot: every other module imports the frozen `config` object.
 * Avoid scattering process.env access through hot paths.
 */

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.length > 0 ? raw : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

const isProd = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';

export const config = Object.freeze({
  host: str('HOST', '0.0.0.0'),
  port: num('PORT', 3001),
  corsOrigin: str('CORS_ORIGIN', 'http://localhost:5173'),
  tickHz: num('TICK_HZ', 12),
  logLevel: str('LOG_LEVEL', 'info'),
  logToFile: bool('LOG_TO_FILE', false),
  logFilePath: str('LOG_FILE_PATH', 'logs/dev.ndjson'),
  rateLimitMessagesPerSec: num('RATE_LIMIT_MSGS_PER_SEC', 60),
  rateLimitBurst: num('RATE_LIMIT_BURST', 30),
  bursts: {
    perSec: num('BURST_PER_SEC', 8),
    cooldownMs: num('BURST_COOLDOWN_MS', 80),
    essenceSpreadPerBurst: num('BURST_ESSENCE_SPREAD', 1.5),
  },
  passive: {
    essenceSpreadPerSec: num('PASSIVE_ESSENCE_SPREAD_PER_SEC', 1.1),
  },
  /**
   * Dev-only: persist the Room across `tsx watch` restarts so iterating on
   * server code doesn't wipe player records / soft-disconnected slots. Off
   * automatically in production (or set `DEV_PERSISTENCE=0` to force off).
   */
  devPersistence: {
    enabled: bool('DEV_PERSISTENCE', !isProd),
    path: str('DEV_PERSISTENCE_PATH', 'apps/server/.dev-state/room.json'),
    saveIntervalMs: num('DEV_PERSISTENCE_SAVE_MS', 5_000),
    /** How long to hold a soft-disconnected record before pruning it. */
    botGraceMs: num('BOT_GRACE_MS', 10_000),
    humanGraceMs: num('HUMAN_GRACE_MS', 60_000),
    pruneIntervalMs: num('PRUNE_INTERVAL_MS', 5_000),
  },
});

export type Config = typeof config;
