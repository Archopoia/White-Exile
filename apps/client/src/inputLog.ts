/**
 * Dev-only structured console lines (grep-friendly).
 */
export function inputLog(line: string, detail?: Record<string, unknown>): void {
  if (detail && Object.keys(detail).length > 0) {
    console.log('[rt-room-input]', line, detail);
  } else {
    console.log('[rt-room-input]', line);
  }
}
