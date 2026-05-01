/**
 * Tutelary server entry point.
 *
 * Boots Fastify (HTTP + health), attaches Socket.io, and starts the room
 * tick loop. All authoritative game state lives in apps/server/src/room.ts.
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { logger } from './logger.js';
import { attachSocketServer } from './net.js';

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

  attachSocketServer(app.server);
}

main().catch((err) => {
  logger.fatal({ evt: 'server.fatal', err }, 'fatal startup error');
  process.exit(1);
});
