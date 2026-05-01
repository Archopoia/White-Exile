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
    dustPerBurst: num('DUST_PER_BURST', 1.5),
  },
  passive: {
    dustPerTick: num('PASSIVE_DUST_PER_TICK', 0.05),
    essencePerSec: num('PASSIVE_ESSENCE_PER_SEC', 0.5),
  },
  extract: {
    cooldownMs: num('EXTRACT_COOLDOWN_MS', 250),
    rewardMin: num('EXTRACT_MIN', 1),
    rewardMax: num('EXTRACT_MAX', 4),
  },
});

export type Config = typeof config;
