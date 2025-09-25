# The Path · Web App

This workspace hosts the Vite + React + Tailwind front-end for The Path. Development commands are executed from the repository root, e.g. `pnpm dev`, `pnpm test`, and `pnpm build`. See the root README for full instructions, mobile guardrails, and review the responsive UX breakdown in [`UX_SPEC.md`](./UX_SPEC.md).

## Mobile testing quick start

Use the following commands from the repo root when validating on phones or tablets:

- **Dev server with LAN access:** `pnpm dev -- --host 0.0.0.0 --port 5173`
- **Production preview:**
  ```bash
  pnpm build
  pnpm --filter @the-path/web preview -- --host 0.0.0.0 --port 4173
  ```

Confirm the device can reach the host's LAN IP (e.g. `http://192.168.1.20:5173`). For deeper profiling and QA flows see [`docs/MOBILE_QA_GUIDE.md`](../../docs/MOBILE_QA_GUIDE.md).
