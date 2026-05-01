/**
 * ESC panel: edit shared room note (server validates and broadcasts in snapshots).
 */
export interface RoomOptionsOverlay {
  setOpen(open: boolean): void;
  syncRoomNoteFromServer(note: string): void;
  dispose(): void;
}

export function createRoomOptionsOverlay(onApply: (roomNote: string) => void): RoomOptionsOverlay {
  const root = document.createElement('div');
  root.id = 'room-options';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Session');
  root.style.cssText = [
    'display:none',
    'position:fixed',
    'inset:0',
    'z-index:20',
    'align-items:center',
    'justify-content:center',
    'background:rgba(0,0,0,0.55)',
    'backdrop-filter:blur(4px)',
  ].join(';');

  const panel = document.createElement('div');
  panel.style.cssText = [
    'min-width:280px',
    'max-width:90vw',
    'padding:18px 20px',
    'border-radius:12px',
    'background:rgba(12,14,24,0.95)',
    'border:1px solid rgba(120,140,220,0.35)',
    'color:#e8eaff',
    'font:14px/1.45 system-ui,sans-serif',
    'box-shadow:0 12px 40px rgba(0,0,0,0.45)',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'Session';
  title.style.cssText = 'font-weight:600;margin-bottom:10px;font-size:15px';

  const hint = document.createElement('div');
  hint.textContent = 'Room note — everyone sees this after you apply.';
  hint.style.cssText = 'opacity:0.75;margin-bottom:10px;font-size:12px';

  const ta = document.createElement('textarea');
  ta.rows = 3;
  ta.maxLength = 200;
  ta.style.cssText =
    'width:100%;box-sizing:border-box;resize:vertical;border-radius:8px;padding:8px;background:#0c0e18;color:#e8eaff;border:1px solid rgba(120,140,220,0.35)';
  ta.setAttribute('aria-label', 'Room note');

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:14px';

  const apply = document.createElement('button');
  apply.type = 'button';
  apply.textContent = 'Apply';
  apply.style.cssText =
    'padding:8px 16px;border-radius:8px;border:none;background:#5b7cff;color:#fff;font-weight:600;cursor:pointer';

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.style.cssText =
    'padding:8px 14px;border-radius:8px;border:1px solid rgba(120,140,220,0.45);background:transparent;color:#e8eaff;cursor:pointer';

  apply.addEventListener('click', () => {
    onApply(ta.value.trim());
    root.style.display = 'none';
  });
  close.addEventListener('click', () => {
    root.style.display = 'none';
  });

  row.append(close, apply);
  panel.append(title, hint, ta, row);
  root.append(panel);
  document.body.append(root);

  root.addEventListener('click', (e) => {
    if (e.target === root) root.style.display = 'none';
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Escape') return;
    e.preventDefault();
    const isOpen = root.style.display === 'flex';
    if (isOpen) {
      root.style.display = 'none';
    } else {
      root.style.display = 'flex';
      setTimeout(() => ta.focus(), 0);
    }
  };
  window.addEventListener('keydown', onKey);

  return {
    setOpen(open: boolean) {
      root.style.display = open ? 'flex' : 'none';
      if (open) setTimeout(() => ta.focus(), 0);
    },
    syncRoomNoteFromServer(note: string) {
      if (document.activeElement === ta) return;
      ta.value = note;
    },
    dispose() {
      window.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}
