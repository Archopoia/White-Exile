/**
 * One-shot: connect, hello, wait for welcome + one snapshot, exit 0.
 * Run with the server up: pnpm smoke:net
 */
import { io as ioc } from 'socket.io-client';
import {
  EVT,
  PROTOCOL_VERSION,
  RoomSnapshotSchema,
  ServerWelcomeSchema,
} from '@realtime-room/shared';

const url = process.env.SERVER_URL ?? 'http://localhost:3001';

const socket = ioc(url, { transports: ['websocket'], timeout: 5_000 });

function fail(msg: string): never {
  console.error('[smoke-net]', msg);
  socket.disconnect();
  process.exit(1);
}

socket.on('connect', () => {
  socket.emit(EVT.client.hello, {
    protocolVersion: PROTOCOL_VERSION,
    displayName: 'smoke',
    isBot: true,
    race: 'emberfolk',
  });
});

socket.on(EVT.server.welcome, (raw: unknown) => {
  const w = ServerWelcomeSchema.safeParse(raw);
  if (!w.success) fail('invalid welcome');
});

socket.on(EVT.server.snapshot, (raw: unknown) => {
  const s = RoomSnapshotSchema.safeParse(raw);
  if (!s.success) fail('invalid snapshot');
  const snap = s.data;
  if (snap === undefined) fail('invalid snapshot');
  console.log('[smoke-net] ok', {
    players: snap.players.length,
    tick: snap.tick,
    followers: snap.followers.length,
    ruins: snap.ruins.length,
    relics: snap.relics.length,
    caravans: snap.caravans.length,
  });
  socket.disconnect();
  process.exit(0);
});

socket.on(EVT.server.error, () => fail('server error'));

setTimeout(() => fail('timeout waiting for snapshot'), 8_000);
