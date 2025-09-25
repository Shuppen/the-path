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

   > ℹ️  For mobile devices on the same network, expose the dev server by appending Vite flags:
   > ```bash
   > pnpm dev -- --host 0.0.0.0 --port 5173
   > ```

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

5. **Serve a production build** (useful for profiling on devices):
   ```bash
   pnpm build
   pnpm --filter @the-path/web preview -- --host 0.0.0.0 --port 4173
   ```
   The preview server renders the `dist/` bundle at [http://localhost:4173](http://localhost:4173) (or the LAN IP when testing on hardware).

## Mobile device setup

To validate the web MVP on mobile hardware, connect phones to the same network as the host machine and expose the dev/preview server with `--host 0.0.0.0`.

### Android (Chrome)

1. Enable **Developer options** and **USB debugging** on the device.
2. Connect via USB and run `adb devices` to confirm the pairing; forward the Vite port if you prefer a wired workflow:
   ```bash
   adb reverse tcp:5173 tcp:5173        # dev server
   adb reverse tcp:4173 tcp:4173        # preview server
   ```
3. Open Chrome and visit `chrome://inspect` on the host to remote-debug the page. Use the **Sensors** panel to simulate orientation/geo inputs when needed.

### iOS (Safari)

1. Enable **Web Inspector** in *Settings → Safari → Advanced* on the device.
2. Start the dev or preview server with `--host 0.0.0.0` and note the host machine's LAN IP (e.g. `http://192.168.1.20:5173`).
3. Connect the device via USB (or the same Wi-Fi) and open Safari → **Develop** menu on macOS to inspect the page. The **Timelines** and **Rendering** tabs expose FPS and layout shift telemetry.

For extended profiling instructions, see [`docs/MOBILE_QA_GUIDE.md`](./docs/MOBILE_QA_GUIDE.md).

## Canvas MVP

The initial scene renders a responsive, pointer-reactive lighting effect:

- Resizes automatically via `ResizeObserver` + DPR aware canvas sizing.
- Animation loop + viewport helpers come from `@the-path/utils`.
- Shared type contracts live in `@the-path/types` for consistency.

## Audio ingestion & analysis specification

- The web app must accept locally provided audio via both `<input type="file">` selection and drag-and-drop, constrained to OGG, MP3, and WAV containers.
- Uploaded files are handled as `File`/`Blob` objects; the audio analyser must derive its configuration (sample rate, channel count, duration windows, FFT sizing) from the decoded buffer instead of relying on manifest defaults.
- Persistently hosted manifest entries remain supported, but locally uploaded tracks are wrapped in transient metadata that only exists for the active session.

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
| Input latency (pointer-to-frame) | **≤ 50 ms** | Profile via Chrome DevTools or Safari Rendering FPS charts. |

QA must capture these metrics on both Android (Chrome) and iOS (Safari); see `QA_CHECKLIST.md` for the full runbook.

## Next steps

- Expand shared packages with domain types + math helpers.
- Layer UI controls/tests over the Canvas scene.
- Add CI workflows (Lint/Test) and deploy previews.
- Extend `WebAudioAnalysis` to ingest `File`/`Blob` inputs, calibrate analyser nodes to each track's decoded characteristics, and expose decoding errors to the UI.
- Provide a factory for temporary `AudioTrackManifestEntry` objects representing local uploads (generated IDs, empty `src`, derived metadata) so the existing playback UI can operate without hardcoded URLs.
