Run an explicit browser playtest when the user asks for it.

## Preconditions

1. Confirm playtesting was explicitly requested by the user.
2. Check for a running `npm run dev`; if missing, start it and wait for Vite ready on port 3000.

## Procedure

1. Navigate to `http://localhost:3000`.
2. Snapshot the main menu.
3. Click `Continue` (if save exists) or `Create`, then `Start Create`.
4. Wait until loading text `Generating` is gone.
5. Enter game with hidden AI control:
   - `AI Enter Game` (`#ai-enter-game`)
6. Capture observations:
   - Use top tab `HUD` to view debug overlay.
   - Use top tab `Dump` to emit state to console.
   - Take targeted screenshot(s) when requested.
7. If menu interaction is needed mid-test:
   - Use `AI Open Menu` (`#ai-open-menu`)
   - Re-enter with `AI Enter Game`.
8. Summarize findings focused on user’s requested feature.

## Input Reference

### Movement
| Key | Action |
|---|---|
| `W/A/S/D` | Move |
| `Space` / `Shift` | Up / Down |
| `Control` (hold) | Faster movement |

### Common Interaction
| Key | Action |
|---|---|
| Left click | Primary tool action |
| Right click | Secondary tool action |
| Scroll | Cycle current category item |
| `Ctrl+Scroll` | Brush size |
| `E` | Inspect |
| `Escape` | Open menu / release lock (manual fallback) |

### Debug/Editor Toggles
| Key or UI | Action |
|---|---|
| Top tab `HUD` | Toggle debug HUD |
| Top tab `Dump` | Dump structured state to console |
| `L` | Lighting mode |
| `G` | Gizmos |
| `H` | History panel |
| `N` | Node canvas |
| `M` | Mute |

## Reporting Template

- Requested feature tested:
- Result (pass/fail/mixed):
- Visual or behavior notes:
- HUD/console evidence:
- Repro steps for issues:
