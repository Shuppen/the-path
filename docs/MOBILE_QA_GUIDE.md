# Mobile QA & Profiling Guide

This guide expands on the core README to help the QA team exercise the web MVP on real Android and iOS hardware. Follow these checklists alongside [`QA_CHECKLIST.md`](../QA_CHECKLIST.md).

## 1. Device provisioning

### Android (Pixel 5 reference)

1. Enable **Developer options → USB debugging**.
2. Install the Android platform tools (`adb`) on the host machine.
3. Connect over USB and accept the debugging prompt on the device.
4. Confirm the connection and optionally set up port forwarding:
   ```bash
   adb devices
   adb reverse tcp:5173 tcp:5173    # Vite dev server
   adb reverse tcp:4173 tcp:4173    # Vite preview server
   ```
5. Launch Chrome on the device and browse to the host's LAN IP (or `http://localhost:5173` when using `adb reverse`).
6. Open `chrome://inspect` on the host desktop to attach Chrome DevTools for remote inspection.

### iOS (iPhone 13 reference)

1. Enable **Settings → Safari → Advanced → Web Inspector**.
2. Connect the device via USB or ensure both laptop and phone share the same Wi-Fi network.
3. Start the dev/preview server with `--host 0.0.0.0`.
4. On macOS, open Safari → **Develop** menu and select the connected device + page to remote debug.
5. Use the **Timelines** tab to capture CPU, memory, and FPS data during interactions.

## 2. Launching the app on devices

> All commands run from the monorepo root unless stated otherwise.

- **Development build (hot reload):**
  ```bash
  pnpm dev -- --host 0.0.0.0 --port 5173
  ```
- **Production bundle:**
  ```bash
  pnpm build
  pnpm --filter @the-path/web preview -- --host 0.0.0.0 --port 4173
  ```
- Share the host's LAN address (e.g. `http://192.168.1.20:5173`) with the device browser. Use HTTPS tunnelling (e.g. `ngrok`) if corporate policies block plain HTTP.

## 3. Network & performance telemetry

### Time-to-Interactive (TTI) / First Meaningful Paint (FMP)

1. In Chrome DevTools, open the **Performance** panel and start a recording before refreshing the page.
2. Apply the **Fast 3G** throttling profile and mid-tier device emulation to mirror Pixel 5 hardware.
3. Stop the trace after the app becomes interactive; read the **Timings** lane for TTI and FMP values.
4. On iOS, use the Safari **Timelines** recording with the *Network* and *Rendering* instruments enabled.

### Frame rate & input latency

- Enable the **FPS meter** in DevTools (Rendering panel) and verify the canvas loop stays at ≥ 60 FPS.
- Inspect the **Main** thread flame chart for long tasks (> 50 ms) that could introduce jank.
- Use Chrome's **Performance insights** or Safari's **Rendering FPS** to sample pointer latency (pointer event → frame commit).

### Bundle & asset budgets

1. Generate a fresh production build: `pnpm build`.
2. Inspect the output in `apps/web/dist/` (e.g. `ls -lh apps/web/dist/assets`) and capture gzip/brotli sizes via the network inspector during a production preview session.
3. From the device, open the **Network** panel and export the HAR log to confirm:
   - `app.[hash].js` (gzipped) ≤ 150 kB.
   - Total transfer size on first load ≤ 8 MB.
   - Scene-specific asset groups ≤ 2 MB each.

## 4. Functional UX exercises

- Rotate the device (portrait ↔ landscape) and ensure layout matches the responsive spec in `apps/web/UX_SPEC.md`.
- Test touch gestures: tap, long-press, drag on canvas, and bottom sheet interactions.
- Validate accessibility settings: enable **Reduce Motion** and **Increase Contrast** and re-run smoke flows.
- Trigger offline/online transitions using DevTools to confirm graceful handling of network loss.

## 5. Reporting

- Capture screenshots or screen recordings from both Android and iOS sessions.
- Attach exported performance traces (Chrome `.json`, Safari `.webarchive`) to QA tickets.
- Log key metrics (TTI, FPS, bundle size) in the release checklist before sign-off.

For questions or gaps in tooling, flag the issue in the `#the-path-qa` channel with the device model, OS version, and steps to reproduce.
