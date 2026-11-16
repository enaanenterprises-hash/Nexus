---
version: 1
slug: "src-components-dashboard-setupexperience-tsx"
primary_target: "src/components/dashboard/SetupExperience.tsx"
related_targets:
  - "src/app/globals.css"
---

FORM: seed:bc1f77b2f0c68b11 · Editorial Gallery Sheet (.impeccable/mocks/decision/editorial-gallery-sheet.html) · mode: operate · buildPath: code

## Surface & Users

Initial 5-step workspace onboarding experience for solo power users and builders entering Nexus (`src/components/dashboard/SetupExperience.tsx`, `src/components/dashboard/SetupCanvas.tsx`, `src/app/globals.css`). Steps execute sequentially in fixed order (`name`, `theme`, `apps`, `widgets`, `nodes`) between tapping the singularity prompt (`Press singularity to Continue`, positioned cleanly in the constellation-cleared lower-center negative space) and the final expansion-hold -> collapse-hold -> supernova handoff into `/dashboard`.

## Direction contract

- **Composition & topology**: Centered monochrome **Editorial Gallery Sheet** (`max-width: 720px`) over a calm scrim above the live neural canvas. Uses a horizontal `1px` bottom-ruled station tab bar (`Name`, `Theme`, `Apps`, `Widgets`, `Nodes`) with an active underline indicator and baseline `Skip setup` action. Footer anchors `Back` and primary monochrome CTA (`Continue` / `Enter Nexus`).
- **Palette & materials**: Pure monochrome obsidian & gallery contrast—Obsidian Dark (`#000000` canvas, `rgba(11,11,14,0.94)` sheet, `#f4f4f6` ink, `rgba(244,244,246,0.72)` secondary ink, `rgba(255,255,255,0.12)` structural borders) and Gallery Light (`#f7f6f2` canvas, `rgba(255,255,255,0.97)` sheet, `#111113` ink, `rgba(17,17,19,0.72)` secondary ink, `rgba(9,9,11,0.12)` structural borders). All ambient chromatic warmth comes exclusively from the underlying golden singularity (`#f0b54a` / `#b87810`) and background constellations.
- **Typography & density**: Sculptural `Cormorant Garamond` (`--font-display`, `clamp(1.9rem, 3.2vw, 2.3rem)`, weight 400) asks each step's core question directly without eyebrow kickers. Paired with `Manrope` (`--font-manrope`) UI controls, tabular numeric counters, generous inner spacing (`32px` horizontal rhythm), and structured monochrome card grids.
- **Step choreography & signature interactions**:
  - **Singularity**: `Press singularity to Continue` in `Cormorant Garamond` centered in the lower-center negative space below the pulsing Moffat singularity (`min(calc(var(--setup-core-y, 60svh) + clamp(88px, 12vh, 138px)), calc(100svh - 72px))`).
  - **Step 1 (`Name`)**: Selects one of 8 prompt variations per client visit via `useSyncExternalStore` (zero SSR hydration mismatch). Shows only the prompt question and a clearly bordered input field with an Enter affordance (`Enter ↵`) and inline validation; submitting glides the name upward into a `Welcome, <Name>` banner at the top of Step 2.
  - **Step 2 (`Theme`)**: Welcomes the user by name at the top of the sheet above `"Pick a system theme color"`, presenting interactive Dark and Light preview cards.
  - **Step 3 (`Apps`)**: Presents `"Which applications should Nexus sync with?"` as an App Card Grid led by one full-width unified **Google Workspace** card (`Gmail · Calendar · Tasks · Send`, `N of 4 synced`, `"Connect Google"` / `"Add remaining"`, plus an expandable `"Manage individual apps"` collapsible) followed by 2-column application cards (`Weather`, `Night sky`, `Crypto`, `Formula 1`, `Uptime`, `GitHub`, `Vercel`, `Strava`, `Spotify`, `Telegram`) with inline collapsible configuration forms.
  - **Step 4 (`Widgets`)**: Renders a live miniature 4×2 Command dashboard preview framed in the user's selected Dark or Light theme using shared `WidgetVisualPreview` tiles alongside open grid slots, drag-and-drop and arrow-key reordering, `Suggested`/`Clear` actions, and toggle chips (`1×1` / `2×1`).
  - **Step 5 (`Nodes`)**: Preserves the cohesive 2x2 Editorial monochrome starter node matrix (`FREE_ACTIVE_EXTENSION_SLOTS` cap).

## Craft Floor & Accessibility Commitments

- High-contrast text (`>= 4.5:1` AA across both Dark and Light sheets and preview frames), clearly delineated input borders and focus rings, monochrome scoped `::selection`, `caret-color`, and sheet scrollbar styling.
- Full keyboard operability across station tabs (arrow keys / Tab), Name form submit (`Enter`) with `sr-only` bound `<Label htmlFor>`, Theme toggle cards, Base UI `Collapsible` app configuration drawers, and 4x2 widget tile reordering (`Arrow` keys + `Delete`/`Backspace` alongside pointer drag-and-drop).
- Reduced motion respected across the singularity prompt, name-to-welcome glide, step transitions, and canvas finale fallback timing (`7500ms` non-reduced fallback / `260ms` reduced).
