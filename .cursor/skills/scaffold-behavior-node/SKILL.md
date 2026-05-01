---
name: scaffold-behavior-node
description: Scaffold a new NodeDef for the visual scripting behavior graph system. Generates a complete node definition with ports, parameters, and execute callback. Use when the user wants to add a new behavior node, scripting node, or says things like "add a SpawnEntity node", "create a timer node", "new dialogue choice node", "make a damage action".
lastReviewed: 2026-03-16
---

# Scaffold a New Behavior Graph Node

Generate a complete NodeDef for the visual scripting system.

## Step 1: Gather Requirements

Ask the user (or infer from context):

1. **Node name** (e.g. "SpawnEntity", "PlaySound", "WaitForSignal") — used for id and label
2. **Category** — one of:
   - `'trigger'` — Event sources (OnInteract, OnDamage, OnProximity)
   - `'action'` — Side effects (PlayAnimation, SpawnEntity, SetProperty)
   - `'condition'` — Logic (Branch, Compare, CheckComponent)
   - `'flow'` — Control flow (Delay, Sequence, Loop)
   - `'dialogue'` — Dialogue (SayLine, ChoiceBranch, ShowSubtitle)
   - `'quest'` — Quest (SetObjective, CheckObjective, CompleteQuest)
   - `'math'` — Math (Add, Multiply, Clamp, Random)
   - `'variable'` — State (GetVariable, SetVariable, HasComponent)
   - `'signal'` — Cross-entity (EmitSignal, OnSignal, Broadcast)
3. **Input ports** — what data/signals does it receive?
4. **Output ports** — what data/signals does it emit?
5. **Parameters** — inline-editable settings (e.g. delay duration, sound name)
6. **What does execute() do?** — the runtime behavior

## Step 2: Port Type Reference

| Port type | Description | Example |
|-----------|-------------|---------|
| `'signal'` | Event trigger (no data, just fires) | OnInteract trigger, Done output |
| `'boolean'` | True/false value | IsAlive check result |
| `'number'` | Numeric value | Health amount, Timer duration |
| `'string'` | Text value | Dialogue line, Entity name |
| `'entity'` | Entity reference by id | Target entity, Actor |
| `'vec3'` | 3-component vector [x, y, z] | Position, Direction |
| `'any'` | Accepts any type | Generic Set Property value |

## Step 3: Create the Node Definition

Add the new node to `src/core/BehaviorGraph.ts` before the `BUILTIN_NODE_DEFS` array.

Use this template:

```typescript
export const <Name>Node: NodeDef = {
  id: '<kebab-case-id>',
  label: '<Human Label>',
  icon: '<emoji>',
  category: '<category>',
  description: '<What this node does in one sentence.>',

  inputs: [
    // Signal inputs (triggers this node to execute):
    // { id: 'trigger', label: 'Trigger', type: 'signal', direction: 'in' },

    // Data inputs (values read during execution):
    // { id: 'target', label: 'Target', type: 'entity', direction: 'in' },
    // { id: 'amount', label: 'Amount', type: 'number', direction: 'in', defaultValue: 10 },
  ],

  outputs: [
    // Signal outputs (fire to trigger downstream nodes):
    // { id: 'done', label: 'Done', type: 'signal', direction: 'out' },

    // Data outputs (values available to downstream nodes):
    // { id: 'result', label: 'Result', type: 'number', direction: 'out' },
  ],

  // Inline parameters (edited on the node card, not via connections):
  params: [
    // Number parameter:
    // { id: 'duration', label: 'Duration (s)', type: 'number', defaultValue: 1.0, min: 0, max: 60, step: 0.1 },

    // String parameter:
    // { id: 'message', label: 'Message', type: 'string', defaultValue: '' },

    // Dropdown parameter:
    // { id: 'mode', label: 'Mode', type: 'dropdown', defaultValue: 'once', options: ['once', 'loop', 'ping-pong'] },

    // Boolean parameter:
    // { id: 'enabled', label: 'Enabled', type: 'boolean', defaultValue: true },
  ],

  execute: (ctx) => {
    // ctx.entityId     — the entity this graph is attached to (null for global)
    // ctx.getInput(id) — read the value of an input port
    // ctx.getParam(id) — read the value of an inline parameter
    // ctx.setOutput(id, value) — set the value of an output port
    // ctx.fireSignal(portId)   — fire a signal output (triggers connected nodes)
    // ctx.getComponentData(entityId, componentId) — read component data
    // ctx.setComponentData(entityId, componentId, key, value) — write component data
    // ctx.emit(event, ...args) — emit an event on the plugin event bus
    // ctx.delay(ms, callback)  — schedule a delayed callback

    // TODO: Implement node logic here
    // Example for an action node:
    //   const target = ctx.getInput<string>('target') ?? ctx.entityId;
    //   const amount = ctx.getParam<number>('amount');
    //   ctx.setComponentData(target, 'stats', 'health', amount);
    //   ctx.fireSignal('done');
  },
};
```

**Replace all placeholders:**
- `<Name>` → PascalCase node name (e.g. `SpawnEntity`)
- `<kebab-case-id>` → kebab-case id (e.g. `spawn-entity`)
- `<emoji>` → appropriate Unicode emoji
- `<category>` → chosen NodeCategory
- Fill in `inputs`, `outputs`, `params` with real port/param definitions
- Implement `execute()` with actual node logic

## Step 4: Register the Node

Add the new node to the `BUILTIN_NODE_DEFS` array in `src/core/BehaviorGraph.ts`:

```typescript
const BUILTIN_NODE_DEFS: NodeDef[] = [
  OnInteractNode,
  OnDamageNode,
  // ... existing nodes ...
  <Name>Node,  // ← add here
];
```

If this is a domain-specific node that should only register when a certain plugin is active, register it separately:

```typescript
// In your plugin file:
import { behaviorGraphRegistry } from '../core/BehaviorGraph.ts';
behaviorGraphRegistry.registerNodeDef(<Name>Node);
```

## Step 5: Common Node Patterns

### Trigger Node (event source — no signal inputs)
```typescript
inputs: [],
outputs: [
  { id: 'trigger', label: 'Trigger', type: 'signal', direction: 'out' },
  { id: 'actor', label: 'Actor', type: 'entity', direction: 'out' },
],
execute: (ctx) => {
  ctx.setOutput('actor', ctx.entityId ?? 'unknown');
  ctx.fireSignal('trigger');
},
```

### Action Node (does something, fires done)
```typescript
inputs: [
  { id: 'trigger', label: 'Trigger', type: 'signal', direction: 'in' },
],
outputs: [
  { id: 'done', label: 'Done', type: 'signal', direction: 'out' },
],
execute: (ctx) => {
  // ... do the action ...
  ctx.fireSignal('done');
},
```

### Condition Node (branches based on a test)
```typescript
inputs: [
  { id: 'trigger', label: 'Check', type: 'signal', direction: 'in' },
  { id: 'value', label: 'Value', type: 'number', direction: 'in' },
],
outputs: [
  { id: 'true', label: 'True', type: 'signal', direction: 'out' },
  { id: 'false', label: 'False', type: 'signal', direction: 'out' },
],
execute: (ctx) => {
  const val = ctx.getInput<number>('value') ?? 0;
  const threshold = ctx.getParam<number>('threshold');
  ctx.fireSignal(val >= threshold ? 'true' : 'false');
},
```

### Delay Node (waits, then continues)
```typescript
inputs: [
  { id: 'trigger', label: 'Start', type: 'signal', direction: 'in' },
],
outputs: [
  { id: 'done', label: 'Done', type: 'signal', direction: 'out' },
],
params: [
  { id: 'duration', label: 'Duration (s)', type: 'number', defaultValue: 1.0, min: 0, max: 60, step: 0.1 },
],
execute: (ctx) => {
  const ms = ctx.getParam<number>('duration') * 1000;
  ctx.delay(ms, () => ctx.fireSignal('done'));
},
```

## Step 6: Verify

1. Launch the game and place an entity (NPC, torch, prop)
2. Look at the entity and press **N** to open the Node Canvas
3. In the left sidebar palette, find the new node under its category
4. Drag it onto the canvas — verify it renders correctly with all ports and parameters
5. Connect it to other nodes — verify connections work (type validation)
6. Edit inline parameters — verify they respond
7. Close and reopen — verify the graph persists
