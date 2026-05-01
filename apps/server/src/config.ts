/**
 * Centralized server configuration (read once at boot).
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
  move: {
    ratePerSec: num('MOVE_RATE_PER_SEC', 48),
    burst: num('MOVE_BURST', 96),
  },
  roomSettingsPatch: {
    ratePerSec: num('ROOM_SETTINGS_RATE_PER_SEC', 8),
    burst: num('ROOM_SETTINGS_BURST', 16),
  },
  devPersistence: {
    enabled: bool('DEV_PERSISTENCE', !isProd),
    path: str('DEV_PERSISTENCE_PATH', '.dev-state/room.json'),
    saveIntervalMs: num('DEV_PERSISTENCE_SAVE_MS', 5_000),
    botGraceMs: num('BOT_GRACE_MS', 10_000),
    humanGraceMs: num('HUMAN_GRACE_MS', 60_000),
    pruneIntervalMs: num('PRUNE_INTERVAL_MS', 5_000),
  },
});

export type Config = typeof config;
