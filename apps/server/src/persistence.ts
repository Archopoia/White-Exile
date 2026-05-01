/**
 * Dev-only room persistence: JSON snapshot under config.devPersistence.path.
 * Disabled in production unless explicitly enabled.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { config } from './config.js';
import { logger } from './logger.js';
import { Room, type RoomData } from './room.js';

function absolutePath(): string {
  return resolve(process.cwd(), config.devPersistence.path);
}

export async function loadRoomIfPresent(roomId: string): Promise<Room | null> {
  if (!config.devPersistence.enabled) return null;
  const path = absolutePath();
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as RoomData;
    if (!parsed || typeof parsed !== 'object' || parsed.id !== roomId) return null;
    const room = Room.restore(parsed);
    logger.info(
      {
        evt: 'persistence.loaded',
        path,
        records: room.totalRecords(),
      },
      'restored room from dev state',
    );
    return room;
  } catch (err) {
    logger.warn({ evt: 'persistence.load_failed', path, err }, 'could not load dev state');
    return null;
  }
}

export async function saveRoom(room: Room): Promise<void> {
  if (!config.devPersistence.enabled) return;
  const path = absolutePath();
  try {
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    const data = JSON.stringify(room.serialize(), null, 2);
    await writeFile(tmp, data, 'utf8');
    await rename(tmp, path);
  } catch (err) {
    logger.warn({ evt: 'persistence.save_failed', path, err }, 'could not save dev state');
  }
}
