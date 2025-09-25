# Migration Guide

## Setup & Run

1. Install dependencies once:
   ```bash
   pnpm install
   ```
2. Launch the web client in portrait rhythm-runner mode:
   ```bash
   pnpm --filter web dev
   ```
   The canvas now renders in 9:16 with four vertical lanes, swipe controls, and roguelike upgrade prompts.
3. Run automated checks:
   ```bash
   pnpm --filter web test
   ```

## Key Changes

- Touch input uses horizontal swipes (`-1/0/1`) and tap hit-zone detection with adjustable calibration.
- World FSM tracks Track/Endless modes, lane obstacles, fever meter, combo multipliers, and roguelike upgrade loops.
- Results screen surfaces post-run upgrade choices; Settings screen exposes audio/input offset calibration.
- Meta progress (XP, unlocks, upgrades) persists locally via deterministic PRNG seeds.
