---
name: setup-engine
description: Confirm or document this repo's engine stack (TypeScript voxel engine, Three.js, Vite, workers, WASM). Use when onboarding or when technical-preferences need filling — not for choosing Godot/Unity/Unreal.
lastReviewed: 2026-03-22
---

# Setup engine (Digging)

This repository **already** uses the custom web voxel engine. Do not run commercial engine selection matrices.

## Steps

1. Read `llms.txt` (Engine Overview, Tech Stack) and `docs/engine/reference-index.md`.
2. Update `.cursor/docs/studio/technical-preferences.md` with concrete budgets and naming conventions for this project (replace remaining `[TO BE CONFIGURED]` lines).
3. If the user asks for version pins, read `package.json` for `three`, `vite`, TypeScript, and Rapier versions; summarize in `technical-preferences.md` or `llms.txt` only when the user wants them documented.
4. For WASM/Rust toolchain questions, point to `wasm/` and `package.json` scripts.

## Out of scope

- Installing Godot, Unity, or Unreal, or generating vendor engine doc trees outside this repo.
