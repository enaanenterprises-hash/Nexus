---
version: 1
slug: "src-components-dashboard-setupexperience-tsx"
primary_target: "src/components/dashboard/SetupExperience.tsx"
related_targets: []
---

FORM: seed:bc1f77b2f0c68b11 · Editorial Gallery Sheet (.impeccable/mocks/decision/editorial-gallery-sheet.html) · mode: operate · buildPath: code

## Surface & Users

Initial 5-step workspace onboarding experience for solo power users and builders entering Nexus (`src/components/dashboard/SetupExperience.tsx`, `src/components/dashboard/SetupCanvas.tsx`, `src/app/globals.css`). Steps execute sequentially in fixed order (`name`, `theme`, `apps`, `widgets`, `nodes`) between the tapping of the singularity prompt ("Press to get Started") and the final expansion-hold -> collapse-hold -> supernova handoff into `/dashboard`.

## Direction contract

- **Composition & topology**: Centered monochrome **Editorial Gallery Sheet** (`max-width: 720px`) over a calm scrim above the live neural canvas. Replaces boxed numeric step pills (`1 Name`, `2 Theme`) with a clean horizontal `1px` bottom-ruled station tab bar (`Name`, `Theme`, `Apps`, `Widgets`, `Nodes`) with a sharp active underline indicator and baseline `Skip setup` action. Footer anchors `Back` and primary monochrome CTA (`Continue` / `Enter Nexus`).
- **Palette & materials**: Pure monochrome obsidian & gallery contrast—Obsidian Dark (`#000000` canvas, `rgba(11,11,14,0.94)` sheet, `#f4f4f6` ink, `rgba(244,244,246,0.66)` secondary ink, `rgba(255,255,255,0.10)` `1px` structural hairlines) and Gallery Light (`#f7f6f2` canvas, `#ffffff` sheet, `#111113` ink, `rgba(17,17,19,0.66)` secondary ink, `rgba(9,9,11,0.10)` `1px` structural hairlines). All ambient chromatic warmth comes exclusively from the underlying golden singularity (`#f0b54a` / `#b87810`).
- **Typography & density**: Sculptural `Cormorant Garamond` (`--font-display`, `clamp(1.9rem, 3.1vw, 2.35rem)`, weight 400) asks each step's core question directly without eyebrow kickers. Paired with `Manrope` (`--font-manrope`) UI controls, tabular numeric counters, generous inner spacing (`32px` horizontal rhythm), and clean `1px` divided rows/matrices rather than repetitive box-in-box cards.
- **Signature move & interaction**: Every preference change (typing name / switching Dark vs Light / toggling Apps / rearranging 4x2 Widgets / selecting starter Nodes) triggers an immediate subtle kinetic pulse through the golden neural filaments behind the sheet; on `Name`, a live `Cormorant Garamond` greeting preview reflects the typed identity in real time. Finale canvas expansion holds at full screen (~`0.90s`) and holds compressed at the exact dashboard singularity coordinate (~`1.05s`) before exploding into `/dashboard`.

## Craft Floor & Accessibility Commitments

- High-contrast text (`>= 4.5:1` AA across both Dark and Light sheets), visible `:focus-visible` outlines, monochrome scoped `::selection`, `caret-color`, and sheet scrollbar styling.
- Full keyboard operability across station tabs (arrow keys / Tab), Name form submit (`Enter`), Theme radio/toggle cards, and 4x2 widget tile reordering (`Alt+Arrow` or inline controls alongside pointer drag-and-drop).
- Reduced motion respected across sheet transitions and canvas finale fallback timing (`5000ms` non-reduced fallback / `260ms` reduced).
