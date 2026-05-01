/**
 * Tutelary server entry point.
 *
 * Boots Fastify (HTTP + health), attaches Socket.io, and starts the room
 * tick loop. All authoritative game state lives in apps/server/src/room.ts.
 *
 * Dev mode also: loads/saves a Room snapshot to `.dev-state/room.json` so
 * `tsx watch` restarts don't wipe accumulated dust / essence / soft-
 * disconnected players awaiting resume.
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { logger } from './logger.js';
import { ROOM_ID, attachSocketServer } from './net.js';
import { loadRoomIfPresent, saveRoom } from './persistence.js';
import { Room } from './room.js';

async function main(): Promise<void> {
  const app = Fastify({ loggerInstance: logger });
  await app.register(cors, { origin: config.corsOrigin });

  app.get('/health', async () => ({
    status: 'ok',
    svc: 'tutelary-server',
    tickHz: config.tickHz,
  }));

  await app.listen({ host: config.host, port: config.port });
  logger.info(
    { evt: 'server.listening', host: config.host, port: config.port, corsOrigin: config.corsOrigin },
    `Tutelary server listening on http://${config.host}:${config.port}`,
  );

  const restored = await loadRoomIfPresent(ROOM_ID);
  const initialRoom = restored ?? new Room(ROOM_ID);
  const { room } = attachSocketServer(app.server, initialRoom);

  // Periodic autosave so a crash loses at most one interval of progress.
  let saveTimer: NodeJS.Timeout | null = null;
  if (config.devPersistence.enabled) {
    saveTimer = setInterval(() => {
      void saveRoom(room);
    }, config.devPersistence.saveIntervalMs);
    logger.info(
      {
        evt: 'persistence.enabled',
        path: config.devPersistence.path,
        saveIntervalMs: config.devPersistence.saveIntervalMs,
      },
      'dev persistence enabled',
    );
  }

  // Graceful shutdown: persist before exit so SIGINT / `tsx watch` restart
  // doesn't drop the last few seconds.
  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ evt: 'server.shutdown', signal }, 'shutting down');
    if (saveTimer) clearInterval(saveTimer);
    try {
      await saveRoom(room);
    } finally {
      await app.close().catch(() => {});
      process.exit(0);
    }
  }
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  // tsx-watch sends SIGUSR2 in some environments; treat the same way.
  process.once('SIGUSR2', () => void shutdown('SIGUSR2'));
}

main().catch((err) => {
  logger.fatal({ evt: 'server.fatal', err }, 'fatal startup error');
  process.exit(1);
});
