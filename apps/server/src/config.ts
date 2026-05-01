/**
 * Centralized server configuration (read once at boot).
 *
 * Log defaults intentionally point inside the workspace `.cursor/logs/` folder
 * so the agent and the developer share the exact same diagnostic stream.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** Repo root resolved from this file's location at boot (apps/server/src/config.ts). */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const DEFAULT_LOG_FILE = resolve(REPO_ROOT, '.cursor', 'logs', 'server.ndjson');

export const config = Object.freeze({
  host: str('HOST', '0.0.0.0'),
  port: num('PORT', 3001),
  corsOrigin: str('CORS_ORIGIN', 'http://localhost:5173'),
  tickHz: num('TICK_HZ', 12),
  logLevel: str('LOG_LEVEL', 'info'),
  /** Always on by default in dev so the agent can read failures without env tweaks. */
  logToFile: bool('LOG_TO_FILE', !isProd),
  logFilePath: str('LOG_FILE_PATH', DEFAULT_LOG_FILE),
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
  rescue: {
    ratePerSec: num('RESCUE_RATE_PER_SEC', 6),
    burst: num('RESCUE_BURST', 12),
  },
  devPersistence: {
    enabled: bool('DEV_PERSISTENCE', !isProd),
    path: str('DEV_PERSISTENCE_PATH', '.dev-state/room.json'),
    saveIntervalMs: num('DEV_PERSISTENCE_SAVE_MS', 5_000),
    botGraceMs: num('BOT_GRACE_MS', 10_000),
    humanGraceMs: num('HUMAN_GRACE_MS', 60_000),
    pruneIntervalMs: num('PRUNE_INTERVAL_MS', 5_000),
  },
  ghosts: {
    enabled: bool('GHOSTS_ENABLED', !isProd),
    count: num('GHOST_COUNT', 4),
    seed: num('GHOST_SEED', 4242),
    /** Above this many real (non-bot) players, ghosts despawn. */
    realPlayerCap: num('GHOST_REAL_CAP', 6),
  },
  worldSeed: num('WORLD_SEED', 13371),
});

export type Config = typeof config;
