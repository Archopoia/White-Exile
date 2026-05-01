/**
 * Always-on input / intent logging (browser DevTools console).
 *
 * Always-on **local** player lines (keys, clicks, skipped intents). Not used
 * for bots or server echo. For verbose client traces, enable `?debug=1` and
 * use `debugLogger`. Server acceptance for **your** session appears in the
 * server terminal at `info` for humans; bots are `debug` only.
 */
export function inputLog(evt: string, data?: Record<string, unknown>): void {
  const line = { evt, t: new Date().toISOString(), ...data };
  console.log('[tutelary-input]', line);
}
