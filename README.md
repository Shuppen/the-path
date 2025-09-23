# The Path Monorepo

A pnpm-powered monorepo that hosts the **web MVP** for The Path alongside shared TypeScript packages. The web app is built with Vite, React, TypeScript, Tailwind CSS, and Vitest. Shared workspaces expose reusable types and canvas utilities to accelerate future surfaces.

## Repository layout

```
.
├── apps/
│   └── web/        # React + Vite + Tailwind front-end
├── packages/
│   ├── types/      # Shared TypeScript contracts
│   └── utils/      # Canvas + viewport helper utilities
├── eslint.config.js
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Getting started

1. **Install dependencies** (pnpm 10.x):
   ```bash
   pnpm install
   ```

2. **Start local development** (runs the Vite dev server for `apps/web`):
   ```bash
   pnpm dev
   ```
   The Canvas MVP is served at [http://localhost:5173](http://localhost:5173).

3. **Run quality gates**:
   ```bash
   pnpm lint        # ESLint across apps + packages
   pnpm test        # Vitest in watch mode for the web app
   pnpm test:ci     # Vitest in CI mode with coverage report
   pnpm build       # Build all workspace packages and the web bundle
   pnpm clean       # Remove build artefacts across packages and the web app
   ```

4. **Format sources** with Prettier:
   ```bash
   pnpm format
   ```

## Canvas MVP

The initial scene renders a responsive, pointer-reactive lighting effect:

- Resizes automatically via `ResizeObserver` + DPR aware canvas sizing.
- Animation loop + viewport helpers come from `@the-path/utils`.
- Shared type contracts live in `@the-path/types` for consistency.

## Mobile target platform

While the MVP runs on desktop browsers, we actively target modern mobile hardware:

- **Minimum device class**: 5.5" phones with at least 1080 × 2340 logical pixels (3× DPR) and 4 GB RAM.
- **Touch interaction**: Every interactive control must expose a 44 × 44 px touch target, support gesture cancellation, and avoid hover-only affordances.
- **Asset budget**: Ship compressed textures/audio at ≤ 2 MB per scene and cap total downloaded assets at 8 MB on first load.

## Responsive UX specification

The web app has two primary responsive modes:

- **Vertical orientation (phones, < 640 px width)**
  - Canvas docks to the top with a 16:9 aspect crop; navigation and CTA stack below.
  - System status copy collapses into a single-line marquee; advanced toggles move into a bottom sheet opened via a floating FAB.
  - Persistent controls use two columns max; tertiary controls become swipeable chips.
- **Horizontal / tablet mode (≥ 640 px width)**
  - Layout matches the desktop grid with sidebar controls; FAB transforms into a persistent right-rail tray.
  - Auxiliary telemetry panels resume inline rendering with 24 px gutters.

Adaptive breakpoints:

| Breakpoint | Range | Layout guidance |
| ---------- | ----- | --------------- |
| `xs`       | 0 – 479 px | Single-column, stacked controls, marquee status line. |
| `sm`       | 480 – 639 px | Canvas top, dual-column control grid, FAB-triggered secondary panel. |
| `md`       | 640 – 1023 px | Sidebar returns, typography matches desktop scale step. |
| `lg`       | ≥ 1024 px | Desktop layout, multi-panel telemetry enabled. |

For wireframes, refer to `apps/web/UX_SPEC.md`.

## Performance guardrails (MVP)

Mobile cold-start metrics guide development and QA:

| Metric | Target | Notes |
| ------ | ------ | ----- |
| Time-to-Interactive (mid-tier Android) | **≤ 2.5 s** | Measure on Pixel 5 / Chrome with throttled 4G profile. |
| Steady-state frame rate | **60 FPS** | Maintain fluid pointer/touch response under canvas animation load. |
| JS bundle (compressed) | **≤ 150 kB** | Enforce via bundler budgets; monitor route-level code splitting. |
| Total mobile download | **≤ 8 MB** | Includes fonts, textures, audio on first meaningful paint. |

QA must capture these metrics on both Android (Chrome) and iOS (Safari); see `QA_CHECKLIST.md` for the full runbook.

## Next steps

- Expand shared packages with domain types + math helpers.
- Layer UI controls/tests over the Canvas scene.
- Add CI workflows (Lint/Test) and deploy previews.
