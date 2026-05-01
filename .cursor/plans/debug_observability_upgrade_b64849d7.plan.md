---
name: Debug Observability Upgrade
overview: Implement a unified debug profile, make CursorDebugTransport actionable in runtime, expose a discoverable debug API surface, and standardize correlation metadata across diagnostics channels while keeping HUD supplementary.
todos:
  - id: profile-contract
    content: Add shared debug profile resolution and wire it into Diagnostics, BrowserConsoleBridge, and CursorDebugTransport.
    status: pending
  - id: cursor-transport-fallback
    content: Implement local dev sink fallback and expanded transport status in CursorDebugTransport.
    status: pending
  - id: vite-cursor-sink
    content: Add /api/cursor-debug Vite middleware writing JSONL with correlation data.
    status: pending
  - id: gameapi-discovery
    content: Add gameAPI.debug namespace with describe() and transport/profile introspection controls.
    status: pending
  - id: correlation-standard
    content: Define and propagate canonical correlation metadata across diagnostics, console bridge, runtime diagnostics, and transport.
    status: pending
  - id: hooked-emits
    content: Add low-noise event emission at render, torch scheduler, nav worker, and world init phase hooks.
    status: pending
  - id: validation-pass
    content: Validate profile modes, event noise levels, and correlated sink outputs during dev run.
    status: pending
isProject: false
---

# Debug Observability Upgrade Plan

## Goals

- Add one switch (`cursorDebugProfile=full`) to enable high-signal debug behavior for Cursor debug mode.
- Make transport events useful in real runtime paths (render/torch/nav/world-init) with low noise.
- Expose a machine-readable debug discovery contract via `window.gameAPI.debug.describe()`.
- Standardize correlation metadata (`sessionId`, `runId`, `frame`, `worldSeed`) across logger, console bridge, and transport.
- Keep HUD as visual aid only; structured telemetry remains primary.

## Scope and File Targets

- Core profile + correlation helpers:
  - [D:/Toys/OTHERS/Digging/src/core/Diagnostics.ts](D:/Toys/OTHERS/Digging/src/core/Diagnostics.ts)
  - [D:/Toys/OTHERS/Digging/src/core/BrowserConsoleBridge.ts](D:/Toys/OTHERS/Digging/src/core/BrowserConsoleBridge.ts)
  - [D:/Toys/OTHERS/Digging/src/core/RuntimeDiagnostics.ts](D:/Toys/OTHERS/Digging/src/core/RuntimeDiagnostics.ts)
  - [D:/Toys/OTHERS/Digging/src/core/RuntimeDiagnosticEnvelope.ts](D:/Toys/OTHERS/Digging/src/core/RuntimeDiagnosticEnvelope.ts)
  - [D:/Toys/OTHERS/Digging/src/core/RuntimeConsoleBridgeShared.ts](D:/Toys/OTHERS/Digging/src/core/RuntimeConsoleBridgeShared.ts)
- Transport + dev sink:
  - [D:/Toys/OTHERS/Digging/src/debug/CursorDebugTransport.ts](D:/Toys/OTHERS/Digging/src/debug/CursorDebugTransport.ts)
  - [D:/Toys/OTHERS/Digging/vite.config.ts](D:/Toys/OTHERS/Digging/vite.config.ts)
- API discoverability:
  - [D:/Toys/OTHERS/Digging/src/debug/GameAPITypes.ts](D:/Toys/OTHERS/Digging/src/debug/GameAPITypes.ts)
  - [D:/Toys/OTHERS/Digging/src/debug/GameAPI.ts](D:/Toys/OTHERS/Digging/src/debug/GameAPI.ts)
  - [D:/Toys/OTHERS/Digging/src/debug/DebugAPI.ts](D:/Toys/OTHERS/Digging/src/debug/DebugAPI.ts)
- Event callsites (low-noise hooks):
  - [D:/Toys/OTHERS/Digging/src/core/VibeEngine.ts](D:/Toys/OTHERS/Digging/src/core/VibeEngine.ts)
  - [D:/Toys/OTHERS/Digging/src/core/RenderGateway.ts](D:/Toys/OTHERS/Digging/src/core/RenderGateway.ts)
  - [D:/Toys/OTHERS/Digging/src/torches/TorchLightRuntime.ts](D:/Toys/OTHERS/Digging/src/torches/TorchLightRuntime.ts)
  - [D:/Toys/OTHERS/Digging/src/systems/NavSystem.ts](D:/Toys/OTHERS/Digging/src/systems/NavSystem.ts)
  - [D:/Toys/OTHERS/Digging/src/core/BootPhases.ts](D:/Toys/OTHERS/Digging/src/core/BootPhases.ts)
  - [D:/Toys/OTHERS/Digging/src/core/WorldInit.ts](D:/Toys/OTHERS/Digging/src/core/WorldInit.ts)
  - [D:/Toys/OTHERS/Digging/src/core/world-init/RestoreBoot.ts](D:/Toys/OTHERS/Digging/src/core/world-init/RestoreBoot.ts)

## Implementation Plan

### 1) Introduce a unified debug profile contract

- Add a shared profile resolver (`off|default|full`) read from query/localStorage and optional injected config.
- Wire profile into:
  - `Diagnostics`: `full` enables debug-level logging automatically.
  - `BrowserConsoleBridge`: `full` defaults to verbose/debug/worker/vite mirroring unless explicitly overridden.
  - `CursorDebugTransport`: profile-aware enablement and status reporting.
- Add optional HUD auto-show behavior under `full`, but keep HUD non-authoritative.

### 2) Upgrade CursorDebugTransport with practical fallback + richer status

- Add local dev fallback endpoint (`/api/cursor-debug`) when remote endpoint/session are absent in dev.
- Extend transport status with sink mode (`remote|local-dev-fallback|none`), active profile, and readiness reason.
- Keep queue/backpressure behavior; avoid high-frequency emissions by default.

### 3) Add Vite local cursor-debug sink

- Add middleware similar to diagnostics/runtime sinks in `vite.config.ts`:
  - `POST /api/cursor-debug`
  - append JSONL to `.cursor/implementation/cursor-debug.log`
  - include correlation block in each line
- Keep response contract simple (`{ ok, count }`) and non-blocking.

### 4) Add `window.gameAPI.debug.describe()` discovery API

- Extend `GameAPITypes` with a `debug` namespace contract.
- Implement `createDebugAPI()` in `GameAPI.ts` with:
  - `describe()` => namespaces/method inventory, active profile, transport status, sink capabilities, correlation schema
  - transport controls parity (status/runId/marker/profile access)
- Keep `window.gameDebug` compatibility; avoid breaking existing quick actions.

### 5) Standardize correlation metadata across channels

- Define a canonical correlation shape and include at least:
  - `sessionId`, `runId`, `frame`, `worldSeed`
- Propagate through:
  - diagnostics file entry payloads
  - runtime diagnostic envelopes
  - runtime console bridge entries (including worker relay)
  - cursor debug transport events
- Ensure sinks persist correlation unchanged for cross-log stitching.

### 6) Add low-noise transport emits at proven hooks

- Render/system lifecycle:
  - `VibeEngine.loop`: sampled/frame-threshold events only.
  - `RenderGateway.requestEngineRender`: emit on owner/reason transitions.
- Torch scheduler:
  - piggyback existing throttled snapshot emission in `TorchLightRuntime`.
- Navigation:
  - `NavSystem` worker results (`build-result`, `path-result`) and coalesced invalidation processing.
- World init:
  - `BootPhases.setBootPhase`, `WorldInit` init boundaries, `RestoreBoot` completion checkpoint.
- Use stable hypothesis/location tags and severity levels to keep downstream filtering consistent.

### 7) Validation and rollout checks

- Confirm profile behavior matrix (`off/default/full`) for logger, bridge, transport.
- Confirm no render-loop regressions (sampling + throttling only).
- Verify `gameAPI.debug.describe()` output is deterministic and machine-readable.
- Verify local sink files receive expected correlated events during a play session.

## Data Flow (Post-change)

```mermaid
flowchart LR
  debugProfile[DebugProfileResolver] --> diagnostics[DiagnosticsLogger]
  debugProfile --> consoleBridge[BrowserConsoleBridge]
  debugProfile --> transport[CursorDebugTransport]

  hotHooks[RenderTorchNavWorldHooks] --> transport
  runtimeDiag[RuntimeDiagnostics] --> diagnostics
  runtimeDiag --> consoleBridge

  diagnostics --> diagnosticsSink[/api/diagnostics-log]
  consoleBridge --> runtimeSink[/api/runtime-console]
  transport --> cursorSink[/api/cursor-debug_or_remote]

  diagnosticsSink --> logFiles[.cursor_implementation_logs]
  runtimeSink --> logFiles
  cursorSink --> logFiles
```



## Non-goals

- No removal/rewrite of existing HUD interactions.
- No broad restructuring of gameplay systems.
- No protocol break for existing `window.gameDebug` consumers.

