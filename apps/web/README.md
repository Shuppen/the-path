# The Path · Web App

This workspace hosts the Vite + React + Tailwind front-end for The Path. Development commands are executed from the repository root, e.g. `pnpm dev`, `pnpm test`, and `pnpm build`. See the root README for full instructions, mobile guardrails, and review the responsive UX breakdown in [`UX_SPEC.md`](./UX_SPEC.md).

## Canvas performance instrumentation

The canvas pipeline now adapts quality automatically:

- `@the-path/utils` exposes `getDevicePerformanceProfile` and `getViewportMetrics`, which clamp device pixel ratio and enforce a per-tier pixel budget before `resizeCanvasToDisplaySize` runs.
- The game loop (`createGameLoop`) checks the active device tier each frame and throttles rendering on low/medium profiles or when `prefers-reduced-motion` is set.
- `CanvasDiagnosticsOverlay` pairs with `useCanvasPerformanceMonitor` to surface live FPS, frame time, DPR, and tier heuristics directly on the gameplay surface (hidden until the world is ready).

Run `pnpm dev` and inspect the overlay on a mobile emulator to verify target FPS and TTI before shipping changes that touch the renderer or world state.
