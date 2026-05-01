/**
 * Lightweight client-side debug logger.
 *
 * Disabled by default; opt in via `?debug=1`, `localStorage.tutelaryDebug=1`,
 * or `VITE_DEBUG=1`. When disabled, only **errors** print; info/warn/debug are
 * suppressed so the console stays readable while `[tutelary-input]` covers
 * local player actions.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

function readFlag(): boolean {
  if (import.meta.env.VITE_DEBUG === '1') return true;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') return true;
    if (window.localStorage.getItem('tutelaryDebug') === '1') return true;
  } catch {
    /* ignore: SSR or restricted access */
  }
  return false;
}

const enabled = readFlag();
const PREFIX = '[tutelary-client]';

function emit(level: Level, evt: string, data?: Record<string, unknown>): void {
  // Quiet by default: only errors always print. Opt in for info/warn/debug.
  if (!enabled && level !== 'error') return;
  const payload = data ? { evt, ...data } : { evt };
  switch (level) {
    case 'error':
      console.error(PREFIX, payload);
      break;
    case 'warn':
      console.warn(PREFIX, payload);
      break;
    case 'info':
      console.info(PREFIX, payload);
      break;
    default:
      console.log(PREFIX, payload);
  }
}

export const debugLogger = {
  enabled,
  debug: (evt: string, data?: Record<string, unknown>) => emit('debug', evt, data),
  info: (evt: string, data?: Record<string, unknown>) => emit('info', evt, data),
  warn: (evt: string, data?: Record<string, unknown>) => emit('warn', evt, data),
  error: (evt: string, data?: Record<string, unknown>) => emit('error', evt, data),
};
