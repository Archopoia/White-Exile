/**
 * Pino logger with structured fields and an optional NDJSON file sink.
 *
 * Conventions:
 *   - Always include `evt` (short event name) on lifecycle and intent logs.
 *   - Top-level pinned fields: svc, roomId (if known), connId, playerId.
 *   - Pretty-printed in TTY dev; JSON in prod or when piped.
 *
 * The file sink is opt-in via LOG_TO_FILE=1 so Cursor can grep a single
 * session as `logs/dev.ndjson`.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pino, { type Logger, type LoggerOptions } from 'pino';
import { config } from './config.js';

function buildOptions(): LoggerOptions {
  const base: LoggerOptions = {
    level: config.logLevel,
    base: { svc: 'rt-room-server' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (process.stdout.isTTY && !config.logToFile) {
    return {
      ...base,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: false,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname,svc',
        },
      },
    };
  }
  return base;
}

function buildLogger(): Logger {
  if (!config.logToFile) {
    return pino(buildOptions());
  }

  const filePath = resolve(process.cwd(), config.logFilePath);
  mkdirSync(dirname(filePath), { recursive: true });
  const dest = pino.destination({ dest: filePath, sync: false, mkdir: true });
  return pino(buildOptions(), dest);
}

export const logger = buildLogger();

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
