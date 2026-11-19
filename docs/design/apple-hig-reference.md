# Apple Design & Human Interface Guidelines — Nexus Reference

Source: [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines) (adapted for Nexus's web operating environment and public site).

## Core Foundations
1. **Clarity** — Unambiguous hierarchy, crisp typography at every viewport, precise single-weight iconography, zero decorative noise.
2. **Deference** — Interface chrome defers to user content and the living golden neural core; headers and controls stay translucent, compact, and quiet.
3. **Depth** — Spatial layering communicated through stepped dark-mode elevation (`#000000` → `#0a0a0c` → `#0f0f12` → `#16161a` → `#1c1c21`), hairline edge refraction, and purposeful fluid motion.

## Materials & Liquid Glass (2025–2026 HIG)
- Use translucent frosted/specular glass surfaces (`backdrop-filter: blur(...)` + `1px` specular top/perimeter hairline) **only** for floating navigation chrome, sticky toolbars, modals, and floating action pills.
- Keep flat reading content, product showcases, and prose strictly on solid matte surfaces so legibility never degrades.
- Ensure every translucent bar maintains `>= 4.5:1` foreground text contrast regardless of what scrolls behind it.

## Concentricity & Shape Language
- Calculate nested radii concentrically: `R_inner = R_outer - padding` (e.g., `16px` outer stage frame with `6px–12px` inset → `10px` inner cards → `6px–7px` inner rows/buttons).
- Reserve capsule pills (`999px`) for compact primary actions, segmented controls, and header pills; use geometric rounded rectangles for workspace windows and desktop panels.

## Typography & Dark Mode Standards
- **Body floor**: `15px–17px` (`1.55–1.68` line height), `45ch–68ch` measure.
- **Weight discipline**: Light (`300`) reserved strictly for large display headlines (`>= 32px`); `400–600` for body, labels, and controls.
- **Tabular figures**: `font-variant-numeric: tabular-nums` on every time, date, temperature, metric, and timing row.
- **AA contrast floor**: Primary `#f5f5f7`, secondary `#a1a1a6`, tertiary `#8e8e95` (`>= 4.5:1` on obsidian dark grounds).

## Motion, Ergonomics & Accessibility
- **Timing**: Snappy, spring-inspired exponential ease-out (`220ms–380ms`, `cubic-bezier(0.22, 1, 0.36, 1)`).
- **Reduced Motion**: Always render crisp static frames and disable decorative motion under `@media (prefers-reduced-motion: reduce)`.
- **Touch targets**: Minimum `44px` ergonomic height/target on mobile interactive controls; visible `focus-visible` ring on every keyboard focusable element.
