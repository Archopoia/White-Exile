---
name: hybrid-light-scheduler
overview: "Implement a scoped hybrid approach: keep Three.js as the sole renderer and add Rust/WASM only for torch light scheduling and deterministic frame-budget selection. Add a dedicated scope/track markdown checklist to prevent migration creep."
todos:
  - id: scope-doc
    content: Create a scope lock file (docs/engine/WasmLightSchedulerScope.md) with in-scope, out-of-scope, acceptance criteria, and a completion checklist.
    status: completed
  - id: three-render-lock
    content: Ensure render path remains Three.js-only and add an explicit guardrail flag/assert preventing accidental Rust render-path activation.
    status: completed
  - id: wasm-scheduler-contract
    content: Define JS<->WASM scheduler contract (typed arrays/struct layout) for light candidates, camera, and budgets; include stable id/index mapping.
    status: completed
  - id: rust-scheduler-core
    content: Implement Rust scheduler function(s) in wasm/src for active-light and shadow-caster selection with deterministic tie-breaking.
    status: completed
  - id: bridge-wrapper
    content: Add TypeScript wrapper module around WasmBridge for scheduler init/call/fallback and output validation.
    status: completed
  - id: torch-integration
    content: Integrate scheduler into torch update flow (TorchFrameUpdate/TorchLightRuntime) while keeping existing Three point-light lifecycle and pool appliers.
    status: completed
  - id: budget-planner
    content: Add deterministic per-frame budget caps (activations/toggles/deferred queue) in JS policy layer; optionally move planner scoring to WASM if needed.
    status: completed
  - id: startup-incremental
    content: Refactor light pool/shadow warmup to incremental startup behavior with strict frame budgets and no large boot spikes.
    status: completed
  - id: diagnostics-metrics
    content: Add diagnostics and perf metrics for startup-to-interactive, pipeline compiles/frame, shadow churn/frame, and p95/p99 frame time in torch-heavy scenes.
    status: completed
  - id: tests-and-rollout
    content: Add regression checks + feature flag rollout plan with fallback to pure JS scheduler and success thresholds.
    status: completed
isProject: false
---

# Hybrid Three.js + WASM Light Scheduler Plan

## Objective

Keep Three.js as the only render path and use Rust/WASM exclusively for torch light scheduling policy (selection/ranking/budgeting). This targets startup and frame hitches from light pool/shadow decisions without reopening renderer-parity scope.

## Scope Lock (Must Ship First)

- Add a tracking doc: [D:/Toys/OTHERS/Digging/docs/engine/WasmLightSchedulerScope.md](D:/Toys/OTHERS/Digging/docs/engine/WasmLightSchedulerScope.md)
- Include:
  - In scope: candidate scoring/sorting, active light picks, shadow caster picks, deterministic frame budgets.
  - Out of scope: any Rust draw path, post-processing parity, ghost-preview renderer work, material/shader rewrites.
  - Acceptance checklist and measurable thresholds.

## Current Integration Points

- Render loop remains Three-driven via [D:/Toys/OTHERS/Digging/src/core/VibeEngine.ts](D:/Toys/OTHERS/Digging/src/core/VibeEngine.ts) -> [D:/Toys/OTHERS/Digging/src/core/RenderGateway.ts](D:/Toys/OTHERS/Digging/src/core/RenderGateway.ts) -> `renderPostProcessingFrame(...)`/`renderer.render(...)`.
- Torch hot path and candidate generation: [D:/Toys/OTHERS/Digging/src/torches/TorchFrameUpdate.ts](D:/Toys/OTHERS/Digging/src/torches/TorchFrameUpdate.ts).
- Pool lifecycle + assignment/shadow toggles: [D:/Toys/OTHERS/Digging/src/systems/PointLightPoolRuntime.ts](D:/Toys/OTHERS/Digging/src/systems/PointLightPoolRuntime.ts) and [D:/Toys/OTHERS/Digging/src/torches/TorchLightRuntime.ts](D:/Toys/OTHERS/Digging/src/torches/TorchLightRuntime.ts).
- Existing WASM loader/fallback pattern to reuse: [D:/Toys/OTHERS/Digging/src/wasm/WasmBridge.ts](D:/Toys/OTHERS/Digging/src/wasm/WasmBridge.ts).
- Existing perf reporting channel to extend: [D:/Toys/OTHERS/Digging/src/core/PerformanceMonitor.ts](D:/Toys/OTHERS/Digging/src/core/PerformanceMonitor.ts).

## Dataflow Design

```mermaid
flowchart LR
  torchFrameUpdate[TorchFrameUpdate] --> candidatePack[PackLightCandidates]
  candidatePack --> wasmScheduler[WasmLightScheduler]
  wasmScheduler --> selectedIndices[SelectedActiveAndShadowIndices]
  selectedIndices --> jsApply[PointLightPoolRuntimeApply]
  jsApply --> threeLights[ThreePointLightsLifecycle]
  threeLights --> renderGateway[RenderGatewayThreeOnly]
```

## Implementation Phases

### Phase 1: Scope guardrails + contract

- Add `WasmLightSchedulerScope.md` and commit guardrails/checklist.
- Add explicit runtime guard/assert that rendering remains Three-only.
- Define scheduler payload schema:
  - candidate arrays (position/intensity/range/flags/id/index)
  - camera vector/frustum hints
  - budgets (`maxLights`, `maxShadowLights`, `maxNewActivationsPerFrame`, `maxShadowTogglesPerFrame`)
- Define deterministic ordering rules for ties (stable id/index).

### Phase 2: Rust scheduler core + TS wrapper

- In [D:/Toys/OTHERS/Digging/wasm/src/lib.rs](D:/Toys/OTHERS/Digging/wasm/src/lib.rs), expose scheduler entrypoint(s) via wasm-bindgen.
- Implement scoring/ranking and selection output arrays:
  - active light indices
  - shadow caster indices
  - optional importance scores for diagnostics.
- Add TS wrapper module (new `src/wasm/WasmLightScheduler.ts`) that:
  - initializes through `WasmBridge`
  - validates returned indices
  - falls back to JS selection when WASM unavailable.

### Phase 3: Torch/runtime integration (no rendering migration)

- Integrate scheduler call in [D:/Toys/OTHERS/Digging/src/torches/TorchFrameUpdate.ts](D:/Toys/OTHERS/Digging/src/torches/TorchFrameUpdate.ts) or [D:/Toys/OTHERS/Digging/src/torches/TorchLightRuntime.ts](D:/Toys/OTHERS/Digging/src/torches/TorchLightRuntime.ts) where candidates are already built.
- Keep existing pool functions as executors:
  - `ensurePointLightPoolCapacity(...)`
  - `applyPointLightPool(...)`
  - `updatePointLightShadowPool(...)`
- Ensure JS still owns all `THREE.PointLight` objects and shadow map lifecycle.

### Phase 4: Deterministic budget planner + incremental startup

- Add strict per-frame caps for:
  - new light activations
  - cast-shadow toggles
  - optional deferred queue drain.
- Update warmup/startup so pool growth and shadow enablement are incremental and budgeted.
- Keep prewarm but enforce frame-sliced behavior to avoid startup spikes.

### Phase 5: Diagnostics, rollout, and completion gates

- Extend diagnostics/perf snapshots with:
  - startup-to-interactive duration
  - pipeline compiles per frame (or warmup compile events)
  - shadow caster churn per frame
  - p95/p99 frame time in torch-heavy scenes.
- Add feature flag (`wasmLightScheduler`) with quick rollback to JS scheduler.
- Complete scope checklist and verify no out-of-scope files/areas were changed.

## Key File Targets

- [D:/Toys/OTHERS/Digging/docs/engine/WasmLightSchedulerScope.md](D:/Toys/OTHERS/Digging/docs/engine/WasmLightSchedulerScope.md) (new)
- [D:/Toys/OTHERS/Digging/wasm/src/lib.rs](D:/Toys/OTHERS/Digging/wasm/src/lib.rs)
- [D:/Toys/OTHERS/Digging/src/wasm/WasmBridge.ts](D:/Toys/OTHERS/Digging/src/wasm/WasmBridge.ts)
- `src/wasm/WasmLightScheduler.ts` (new)
- [D:/Toys/OTHERS/Digging/src/torches/TorchFrameUpdate.ts](D:/Toys/OTHERS/Digging/src/torches/TorchFrameUpdate.ts)
- [D:/Toys/OTHERS/Digging/src/torches/TorchLightRuntime.ts](D:/Toys/OTHERS/Digging/src/torches/TorchLightRuntime.ts)
- [D:/Toys/OTHERS/Digging/src/systems/PointLightPoolRuntime.ts](D:/Toys/OTHERS/Digging/src/systems/PointLightPoolRuntime.ts)
- [D:/Toys/OTHERS/Digging/src/core/PerformanceMonitor.ts](D:/Toys/OTHERS/Digging/src/core/PerformanceMonitor.ts)

## Success Criteria

- Three.js remains the only rendering path.
- WASM scheduler deterministically selects active/shadow lights with stable behavior.
- Startup hitch from torch/light pool path is materially reduced.
- Torch-heavy scenes show lower p95/p99 spikes without visual regressions.
- Scope checklist is fully checked with no renderer-parity drift.