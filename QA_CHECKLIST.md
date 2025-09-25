# QA Checklist · The Path

Use this runbook before sign-off on releases. Track results per target platform.

## Environment

- [ ] Android 14 · Pixel 5 hardware (or equivalent) · Chrome Stable
- [ ] iOS 17 · iPhone 13 hardware (or equivalent) · Safari Mobile
- [ ] Desktop baseline (Chrome / Edge) for regression comparison
- [ ] Remote debugging tooling prepared (`chrome://inspect`, Safari Develop menu, `adb`)

## Smoke verification

- [ ] Cold start ≤ 2.5 s on throttled 4G profile (record from navigation start to first interaction)
- [ ] First meaningful paint within 1.8 s on both mobile browsers
- [ ] No critical errors in browser console during load and first interaction
- [ ] Production bundle served via `pnpm --filter @the-path/web preview -- --host 0.0.0.0` for metrics parity

## Interaction & UX

- [ ] Touch targets ≥ 44 × 44 px and respond to tap + long-press without hover dependencies
- [ ] Bottom sheet controls on mobile open, drag, and dismiss with gesture cancellation handling
- [ ] Layout matches responsive spec at `xs`, `sm`, `md`, `lg` breakpoints (see `apps/web/UX_SPEC.md`)
- [ ] Telemetry marquee activates only on overflow and pauses with `prefers-reduced-motion`
- [ ] Orientation changes (portrait ↔ landscape) maintain state and avoid layout jumps
- [ ] Canvas gestures (drag, multi-touch) remain smooth with no accidental navigation/back gestures
- [ ] Accessibility toggles (Reduce Motion, Increase Contrast) retain legibility and disable non-essential animations

## Performance & assets

- [ ] Steady-state canvas animation holds ≥ 60 FPS on both mobile devices
- [ ] Pointer input latency ≤ 50 ms (inspect Performance traces for long tasks)
- [ ] JS bundle (compressed) ≤ 150 kB and total mobile download ≤ 8 MB (verify via Chrome Lighthouse & Safari Web Inspector)
- [ ] Scene-specific asset groups ≤ 2 MB each; confirm via network panel grouping
- [ ] Record TTI, FMP, FPS, and bundle size values in release notes with links to traces/HAR exports

## Regression

- [ ] Execute automated test suite (`pnpm test:ci`)
- [ ] Execute lint + type checks (`pnpm lint`)
- [ ] Capture screenshots/video for both mobile browsers and attach to release notes
- [ ] Archive performance traces (Chrome `.json`, Safari `.webarchive`) in QA folder for the release

