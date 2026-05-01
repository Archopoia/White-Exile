Run a browser or device playtest **only** when the user explicitly asked for playtesting.

## Preconditions

1. Confirm the user requested playtesting (see `.cursor/rules/ai-playtesting.mdc`).
2. Start the project’s dev server using **its** documented command (often `npm run dev`). Use the URL and port from README or console output — do not assume a fixed port.

## Procedure (adapt to the project)

1. Open the running build URL.
2. Capture the initial screen state (snapshot or screenshot as appropriate).
3. Navigate to the gameplay or feature under test using the project’s real menu flow.
4. Wait for loading or generation steps to finish before judging behavior.
5. If the project documents **automation hooks** (hidden buttons, query params, debug routes), use those instead of simulating pointer-lock or fragile canvas clicks.
6. Record observations: expected vs actual, console errors, performance notes.
7. Summarize against the user’s question.

## Controls

Document **project-specific** controls in README or `docs/` — do not treat the table below as canonical unless the game matches it.

| Input | Typical action (examples only) |
|---|---|
| `W/A/S/D` | Character movement |
| `Space` | Jump or ascend |
| `Escape` | Menu / pause |
| Mouse | Look / interact |

## Reporting template

- Feature or bug under test:
- Result (pass / fail / mixed):
- Notes (visual, UX, performance):
- Evidence (logs, screenshots if requested):
