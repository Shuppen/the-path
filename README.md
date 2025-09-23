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
   pnpm clean       # Remove build artefacts via package-level scripts
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

## Performance guardrails (MVP)

| Metric | Target | Notes |
| ------ | ------ | ----- |
| Time-to-Interactive | **≤ 100 ms** | Lean dependency footprint, lazy canvas work until first frame. |
| Frame rate | **60 FPS** | Animation loop & drawing budget tuned for fluid pointer response. |
| Bundle size | **≤ 150 kB JS** | Tree-shakeable utilities and Tailwind JIT keep the initial bundle compact. |

## Next steps

- Expand shared packages with domain types + math helpers.
- Layer UI controls/tests over the Canvas scene.
- Add CI workflows (Lint/Test) and deploy previews.
