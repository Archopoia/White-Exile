---
name: scaffold-simulation-worker
description: Scaffold a new Web Worker with optional WASM acceleration for the voxel cave engine. Generates a Worker entry point, shared types file, and host-side dispatch code. Use when the user wants to add a new off-thread simulation, background computation, or says things like "add a physics worker", "create erosion simulation", "new off-thread system", "move this to a worker".
lastReviewed: 2026-03-16
---

# Scaffold a New Simulation Worker

Generate a Web Worker with WASM-optional acceleration for off-main-thread computation.

Workers in this engine follow a strict pattern: typed message passing, health-check ping/pong, WASM-first with TypeScript fallback, and ArrayBuffer transfer for zero-copy data.

## Step 1: Gather Requirements

Ask the user (or infer from context):

1. **Simulation name** (e.g. "Erosion", "Heat", "Wind") — used for file naming
2. **Input data** — what does the worker receive each tick? (world block data, density fields, custom arrays)
3. **Output data** — what does the worker return? (diffs, new arrays, computed values)
4. **Needs WASM?** Heavy inner loops (>10K iterations) benefit from Rust WASM. Light simulations can be TypeScript-only.
5. **Tick frequency** — how often does the host dispatch? (every frame, fixed interval like 50ms, on-demand)

## Step 2: Create the Types File

Create `src/systems/<Name>WorkerTypes.ts`:

```typescript
/**
 * <Name>WorkerTypes.ts
 *
 * Shared message types for communication between the main thread
 * (<Name>System) and the <name> simulation Web Worker.
 */

// ── Request (Main -> Worker) ───────────────────────────────────

export interface <Name>TickRequest {
  type: 'tick';
  /** Flat block-type array (transferred, zero-copy). */
  worldData: Uint8Array;
  /** World dimensions. */
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  // TODO: Add simulation-specific input fields
}

// ── Response (Worker -> Main) ──────────────────────────────────

export interface <Name>Change {
  x: number;
  y: number;
  z: number;
  // TODO: Define what changed (newType, newValue, etc.)
  newType: number;
}

export interface <Name>TickResponse {
  type: 'result';
  /** All voxel positions that changed. */
  changes: <Name>Change[];
  /** True if no changes occurred (simulation has settled). */
  settled: boolean;
  // TODO: Add simulation-specific output fields
}
```

## Step 3: Create the Worker Entry Point

Create `src/systems/<Name>Worker.ts`:

```typescript
/**
 * <Name>Worker.ts
 *
 * Web Worker entry point for off-main-thread <name> simulation.
 *
 * Receives a snapshot of world data each tick, runs the simulation
 * (WASM-first, TS fallback), and posts back a diff of changes.
 *
 * No Three.js imports — all work uses raw typed arrays.
 */

import { VoxelDataMutableView } from '../meshing/IVoxelReader.ts';
import { initWasm, getWasm } from '../wasm/WasmBridge.ts';
import type {
  <Name>TickRequest,
  <Name>TickResponse,
  <Name>Change,
} from './<Name>WorkerTypes.ts';

// ── Initialise WASM at worker startup ─────────────────────────
initWasm();

// ── Message handler ───────────────────────────────────────────

self.onmessage = (e: MessageEvent<<Name>TickRequest & { __ping?: boolean }>) => {
  // Health-check ping: echo back immediately
  if (e.data && e.data.__ping) {
    (self as unknown as Worker).postMessage({ __ping: true });
    return;
  }

  const req = e.data;
  if (req.type === 'tick') {
    // Try WASM path first; fall back to TS if unavailable
    if (!handleTickWasm(req)) {
      handleTickTS(req);
    }
  }
};

// ── WASM tick handler ─────────────────────────────────────────

function handleTickWasm(req: <Name>TickRequest): boolean {
  const wasm = getWasm();
  if (!wasm) return false;

  try {
    // TODO: Call WASM function, e.g.:
    // const resultPtr = wasm.simulate_<name>(
    //   req.worldData, req.sizeX, req.sizeY, req.sizeZ
    // );
    // Parse WASM output into <Name>Change[]

    // Placeholder: fall through to TS
    return false;
  } catch {
    return false;
  }
}

// ── TypeScript fallback tick handler ──────────────────────────

function handleTickTS(req: <Name>TickRequest): void {
  const emptyWater = new Uint8Array(req.worldData.length);
  const view = new VoxelDataMutableView(
    req.worldData, emptyWater,
    req.sizeX, req.sizeY, req.sizeZ,
  );

  // TODO: Implement simulation logic here.
  // Use view.getBlock(x, y, z) and view.setBlock(x, y, z, type).
  // Track changes in an array.
  const changes: <Name>Change[] = [];

  const response: <Name>TickResponse = {
    type: 'result',
    changes,
    settled: changes.length === 0,
  };

  (self as unknown as Worker).postMessage(response);
}
```

### If WASM is not needed

Remove the `initWasm()` / `getWasm()` imports and the `handleTickWasm` function. Just use the TS handler directly:

```typescript
self.onmessage = (e: MessageEvent<<Name>TickRequest & { __ping?: boolean }>) => {
  if (e.data && e.data.__ping) {
    (self as unknown as Worker).postMessage({ __ping: true });
    return;
  }
  if (e.data.type === 'tick') handleTickTS(e.data);
};
```

## Step 4: Add Host-Side Worker Dispatch

In your system file (`src/systems/<Name>System.ts`), add the worker management code.

### Worker construction

```typescript
import <Name>WorkerConstructor from './<Name>Worker.ts?worker';
import type { <Name>TickRequest, <Name>TickResponse } from './<Name>WorkerTypes.ts';
import { markDirty } from '../core/AutoSaveIntent.ts';

let worker: Worker | null = null;
let workerHealthy = false;
let workerBusy = false;

function initWorker(): void {
  try {
    worker = new <Name>WorkerConstructor();
  } catch (err) {
    console.warn('[<Name>System] Failed to create worker:', err);
    return;
  }

  worker.onmessage = (e: MessageEvent<<Name>TickResponse & { __ping?: boolean }>) => {
    // Health-check pong
    if (e.data && (e.data as any).__ping) {
      if (!workerHealthy) {
        workerHealthy = true;
        console.log('[<Name>System] Web Worker active — async simulation enabled.');
      }
      return;
    }

    if (e.data.type === 'result') {
      workerBusy = false;
      applyResults(e.data);
    }
  };

  // Send health-check ping
  worker.postMessage({ __ping: true });

  // Timeout: fall back to synchronous if no pong
  setTimeout(() => {
    if (!workerHealthy) {
      console.warn('[<Name>System] Worker did not respond — using synchronous fallback.');
      worker?.terminate();
      worker = null;
    }
  }, 3000);
}
```

### Dispatching a tick

```typescript
function dispatchWorkerTick(world: VoxelWorld): void {
  if (!worker || !workerHealthy || workerBusy) return;
  workerBusy = true;

  // CRITICAL: .slice() creates an owned copy.
  // toFlatData() caches its result, and postMessage with transfer
  // detaches the ArrayBuffer. Without the copy, the next tick would
  // return the cached (detached) buffer -> DataCloneError.
  const worldData = world.toFlatData().slice();

  const request: <Name>TickRequest = {
    type: 'tick',
    worldData,
    sizeX: world.sizeX,
    sizeY: world.sizeY,
    sizeZ: world.sizeZ,
  };

  // Transfer worldData buffer (zero-copy to worker)
  worker.postMessage(request, [worldData.buffer]);
}
```

### Applying results

```typescript
function applyResults(response: <Name>TickResponse): void {
  if (response.settled) return;

  const world = editorState.voxelWorld;
  if (!world) return;

  for (const change of response.changes) {
    world.setBlock(change.x, change.y, change.z, change.newType);
  }

  // Trigger mesh rebuild for affected area
  // editorState.terrainSurfaceRenderer?.rebuildNear(cx, cy, cz, radius);

  markDirty('system', '<name>-worker-results');
}
```

### HMR: terminate and recreate worker

```typescript
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    worker?.terminate();
    worker = null;
    // ... other state
  });
}
```

## Step 5: Adding a Rust WASM Function (Optional)

If your simulation needs WASM acceleration:

1. Add a new function in `wasm/src/lib.rs` (or a new `wasm/src/<name>.rs` module):

```rust
#[wasm_bindgen]
pub fn simulate_<name>(
    world_data: &mut [u8],
    size_x: u32, size_y: u32, size_z: u32,
) -> Box<[u32]> {
    // Return packed change data: [x, y, z, newType, x, y, z, newType, ...]
    let mut changes = Vec::new();
    // TODO: Implement simulation
    changes.into_boxed_slice()
}
```

2. Build: `npm run wasm:build`
3. The function is auto-available via `getWasm()` in the worker.

## Step 6: Critical Rules

### ArrayBuffer Transfer (Prevent DataCloneError)

**Always `.slice()` cached arrays before transfer.** `VoxelWorld.toFlatData()` and `toFlatWaterLevel()` cache their results. `postMessage` with transferables detaches the ArrayBuffer. Without `.slice()`, the next tick returns a detached buffer.

```typescript
// CORRECT:
const worldData = world.toFlatData().slice();
worker.postMessage(request, [worldData.buffer]);

// WRONG (will throw DataCloneError on second tick):
const worldData = world.toFlatData();
worker.postMessage(request, [worldData.buffer]);
```

### No Three.js in Workers

Workers must never import Three.js. Use `VoxelDataMutableView` for voxel access and raw typed arrays for all data.

### Health-Check Pattern

Every worker must respond to `{ __ping: true }` with `{ __ping: true }`. The host waits up to 3 seconds. If no pong, the worker is terminated and the system falls back to synchronous execution.

### Request IDs and stale-response guards

Use monotonically increasing request IDs in tick messages. Ignore responses that do not
match the latest in-flight request, and apply timeout/recovery guards for hung requests.

### Busy Flag

Only dispatch a tick when `workerBusy === false`. The worker processes one tick at a time. If the host dispatches faster than the worker can consume, ticks are skipped (not queued).

## Step 7: Verify

1. Launch the game — check console for `[<Name>System] Web Worker active` message
2. Trigger the simulation (terrain edit, toggle, etc.)
3. Verify changes appear in the world
4. Check console for absence of `DataCloneError`
5. Check that disabling the plugin pauses the simulation
6. Save and reload — verify state persists
7. Make a code change — verify HMR recreates the worker cleanly (no duplicate handlers or stuck `workerBusy`)

