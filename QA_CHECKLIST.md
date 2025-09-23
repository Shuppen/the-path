# QA Checklist · The Path

Use this runbook before sign-off on releases. Track results per target platform.

## Environment

- [ ] Android 14 · Pixel 5 hardware (or equivalent) · Chrome Stable
- [ ] iOS 17 · iPhone 13 hardware (or equivalent) · Safari Mobile
- [ ] Desktop baseline (Chrome / Edge) for regression comparison

## Smoke verification

- [ ] Cold start ≤ 2.5 s on throttled 4G profile (record from navigation start to first interaction)
- [ ] First meaningful paint within 1.8 s on both mobile browsers
- [ ] No critical errors in browser console during load and first interaction

## Interaction & UX

- [ ] Touch targets ≥ 44 × 44 px and respond to tap + long-press without hover dependencies
- [ ] Bottom sheet controls on mobile open, drag, and dismiss with gesture cancellation handling
- [ ] Layout matches responsive spec at `xs`, `sm`, `md`, `lg` breakpoints (see `apps/web/UX_SPEC.md`)
- [ ] Telemetry marquee activates only on overflow and pauses with `prefers-reduced-motion`

## Performance & assets

- [ ] Steady-state canvas animation holds ≥ 60 FPS on both mobile devices
- [ ] JS bundle (compressed) ≤ 150 kB and total mobile download ≤ 8 MB (verify via Chrome Lighthouse & Safari Web Inspector)
- [ ] Scene-specific asset groups ≤ 2 MB each; confirm via network panel grouping

## Regression

- [ ] Execute automated test suite (`pnpm test:ci`)
- [ ] Execute lint + type checks (`pnpm lint`)
- [ ] Capture screenshots/video for both mobile browsers and attach to release notes

