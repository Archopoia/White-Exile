/**
 * Pino logger.
 *
 * Default behavior in dev:
 *   - Pretty colorized lines on stdout (human triage)
 *   - NDJSON to `.cursor/logs/server.ndjson` (so the agent and the developer
 *     read the same diagnostic stream).
 *
 * Toggle with `LOG_TO_FILE=0` if you only want stdout. Pino's multistream
 * writes to both targets without dropping fields.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import pino, { type Level, type Logger, type LoggerOptions, type StreamEntry } from 'pino';
import { PassThrough } from 'node:stream';
import { config } from './config.js';

function asLevel(level: string): Level {
  const allowed: ReadonlyArray<Level> = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
  return allowed.includes(level as Level) ? (level as Level) : 'info';
}

const baseOptions: LoggerOptions = {
  level: config.logLevel,
  base: { svc: 'rt-room-server' },
  timestamp: pino.stdTimeFunctions.isoTime,
};

function buildLogger(): Logger {
  const level = asLevel(config.logLevel);
  const streams: StreamEntry[] = [];

  if (process.stdout.isTTY) {
    const pretty = pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        singleLine: false,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname,svc',
      },
    });
    streams.push({ level, stream: pretty });
  } else {
    const passthrough = new PassThrough();
    passthrough.pipe(process.stdout);
    streams.push({ level, stream: passthrough });
  }

  if (config.logToFile) {
    mkdirSync(dirname(config.logFilePath), { recursive: true });
    const file = pino.destination({ dest: config.logFilePath, sync: false, mkdir: true });
    streams.push({ level, stream: file });
  }

  return pino(baseOptions, pino.multistream(streams));
}

export const logger = buildLogger();

logger.info(
  {
    evt: 'logger.ready',
    logToFile: config.logToFile,
    logFilePath: config.logToFile ? config.logFilePath : null,
    logLevel: config.logLevel,
  },
  'logger initialised',
);

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
