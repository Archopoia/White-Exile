/**
 * Server entry: Fastify (HTTP + health), Socket.io, authoritative room tick.
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { PROTOCOL_VERSION } from '@realtime-room/shared';
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
    svc: 'rt-room-server',
    tickHz: config.tickHz,
    protocolVersion: PROTOCOL_VERSION,
  }));

  await app.listen({ host: config.host, port: config.port });
  logger.info(
    { evt: 'server.listening', host: config.host, port: config.port, corsOrigin: config.corsOrigin },
    `server listening on http://${config.host}:${config.port}`,
  );

  const restored = await loadRoomIfPresent(ROOM_ID);
  const initialRoom = restored ?? new Room(ROOM_ID);
  const { room } = attachSocketServer(app.server, initialRoom);

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
  process.once('SIGUSR2', () => void shutdown('SIGUSR2'));
}

main().catch((err) => {
  logger.fatal({ evt: 'server.fatal', err }, 'fatal startup error');
  process.exit(1);
});
