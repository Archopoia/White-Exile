/**
 * Client debug logger. Opt in: ?debug=1 or localStorage.rtRoomDebug=1
 */
import { inputLog } from './inputLog.js';

function debugEnabled(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('debug');
    if (q === '1' || q === 'true') return true;
    if (window.localStorage.getItem('rtRoomDebug') === '1') return true;
  } catch {
    /* ignore */
  }
  return false;
}

const PREFIX = '[rt-room-client]';

export const debugLogger = {
  debug(msg: string, data?: Record<string, unknown>) {
    if (!debugEnabled()) return;
    inputLog(`${PREFIX} ${msg}`, data ?? {});
  },
  info(msg: string, data?: Record<string, unknown>) {
    if (!debugEnabled()) return;
    inputLog(`${PREFIX} ${msg}`, data ?? {});
  },
  warn(msg: string, data?: Record<string, unknown>) {
    console.warn(PREFIX, msg, data ?? {});
  },
  error(msg: string, data?: Record<string, unknown>) {
    console.error(PREFIX, msg, data ?? {});
  },
};
