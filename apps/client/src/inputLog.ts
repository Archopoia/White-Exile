/**
 * Always-on input / intent logging (browser DevTools console).
 *
 * Unlike `debugLogger`, this is not gated by `?debug=1` — it exists so you can
 * confirm keys and clicks fired even when the server is quiet or the socket
 * is not ready yet. Server-side acceptance still appears in the **terminal**
 * running `pnpm dev:server` (Pino `intent.*` lines).
 */
export function inputLog(evt: string, data?: Record<string, unknown>): void {
  const line = { evt, t: new Date().toISOString(), ...data };
  console.log('[tutelary-input]', line);
}
