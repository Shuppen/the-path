# The Path · Responsive UX Spec

This document expands on the README to describe the responsive behaviour the front-end should implement.

## Layout modes

### Vertical orientation (`xs`, `sm` breakpoints)

```
┌──────────────────────────────┐
│ Canvas (16:9 crop, top dock) │
├───────────────┬──────────────┤
│ Primary CTA   │ Status pill  │
├───────────────┴──────────────┤
│ Swipeable telemetry chips    │
├──────────────────────────────┤
│ FAB → bottom sheet controls  │
└──────────────────────────────┘
```

- Header actions collapse into a single CTA row under the canvas.
- Status copy becomes a horizontally scrolling marquee when text overflows.
- Advanced controls live inside the bottom sheet; expose drag handle + swipe dismissal.

### Horizontal / tablet orientation (`md`, `lg` breakpoints)

```
┌───────────────┬──────────────────────────────┐
│ Sidebar tray  │ Canvas (full-height)          │
│ • Primary CTA │ ┌──────────────┬────────────┐ │
│ • Toggles     │ │ Telemetry A  │ Telemetry B│ │
│ • Filters     │ └──────────────┴────────────┘ │
└───────────────┴──────────────────────────────┘
```

- Sidebar tray persists on the left with 24 px gutters between panels.
- Telemetry cards return to a two-column grid; chips expand into full cards.
- FAB becomes a persistent icon button in the sidebar header.

## Breakpoint behaviour

| Breakpoint | Width range | Canvas | Navigation | Telemetry |
| ---------- | ----------- | ------ | ---------- | --------- |
| `xs` | 0 – 479 px | Top-docked, 16:9 | Single CTA row, icon-only overflow menu | Swipeable chips, single-line stats |
| `sm` | 480 – 639 px | Top-docked, 18:9 | Two CTA buttons, sticky bottom FAB | Chips with contextual popovers |
| `md` | 640 – 1023 px | Left-aligned, 4:3 | Sidebar tray reappears | Two-column cards, inline sparklines |
| `lg` | ≥ 1024 px | Center stage, responsive | Desktop nav & secondary rail | Three-column telemetry grid |

## Motion & performance

- Limit canvas animation work to ≤ 6 ms per frame on mid-tier mobile GPUs.
- Defer non-essential telemetry rendering until after first interaction on `xs`/`sm`.
- Respect `prefers-reduced-motion`; disable marquee + parallax in that mode.

