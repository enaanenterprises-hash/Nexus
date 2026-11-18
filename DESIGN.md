---
name: Nexus
description: Calm, monochrome obsidian personal AI operating environment anchored by a single hairline of warm singularity gold.
colors:
  singularity-gold: "#f0b54a"
  amber-halo: "#ffd99a"
  gold-tint: "rgba(240, 181, 74, 0.16)"
  gold-ring: "rgba(240, 181, 74, 0.56)"
  coral-alert: "#f0957a"
  signal-destructive: "#f87171"
  signal-success: "#4ade80"
  pitch-black: "#000000"
  matte-obsidian: "#0a0a0c"
  socket-well: "#0b0b0e"
  obsidian-canvas: "#0f0f12"
  obsidian-surface: "#16161a"
  obsidian-elevated: "#1c1c21"
  obsidian-selected: "#24242b"
  obsidian-active-cell: "#2e2e36"
  pure-white: "#ffffff"
  chalk-ink: "#f5f5f7"
  chrome-primary: "#f4f4f6"
  obsidian-on-light: "#09090b"
  silver-secondary: "#d1d1d6"
  ash-muted: "#a1a1a6"
  pewter-meta: "#8e8e95"
  hairline-subtle: "rgba(255, 255, 255, 0.09)"
  border-default: "rgba(255, 255, 255, 0.12)"
  border-strong: "rgba(255, 255, 255, 0.16)"
  gallery-canvas: "#eceae5"
  gallery-surface: "#f5f4f0"
  gallery-ink: "#1a1917"
  gallery-gold: "#9a761c"
typography:
  display:
    fontFamily: "Manrope, -apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif"
    fontSize: "clamp(2.25rem, 4.4vw, 4.5rem)"
    fontWeight: 300
    lineHeight: 1.06
    letterSpacing: "-0.035em"
  display-editorial:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "clamp(1.9rem, 3.2vw, 2.3rem)"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Manrope, -apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif"
    fontSize: "clamp(2rem, 3.6vw, 3rem)"
    fontWeight: 300
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Manrope, -apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif"
    fontSize: "1.375rem"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Manrope, -apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "0em"
  body-compact:
    fontFamily: "Manrope, -apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "-0.005em"
  label:
    fontFamily: "Manrope, -apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "0em"
    fontFeature: "\"tnum\" 1"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  xs: "6px"
  sm: "7px"
  md: "10px"
  lg: "14px"
  xl: "16px"
  2xl: "18px"
  pill: "999px"
spacing:
  2xs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  2xl: "56px"
  section: "80px"
components:
  button-primary:
    backgroundColor: "{colors.chalk-ink}"
    textColor: "{colors.obsidian-on-light}"
    typography: "{typography.body-compact}"
    rounded: "{rounded.pill}"
    padding: "11.5px 23px"
  button-primary-hover:
    backgroundColor: "{colors.pure-white}"
    textColor: "{colors.obsidian-on-light}"
  button-glass:
    backgroundColor: "rgba(255, 255, 255, 0.07)"
    textColor: "{colors.chalk-ink}"
    typography: "{typography.body-compact}"
    rounded: "{rounded.pill}"
    height: "36px"
    padding: "0 18.4px"
  button-glass-hover:
    backgroundColor: "rgba(255, 255, 255, 0.14)"
    textColor: "{colors.chalk-ink}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ash-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "28px"
    padding: "0 10px"
  input-waitlist:
    backgroundColor: "rgba(255, 255, 255, 0.04)"
    textColor: "{colors.chalk-ink}"
    typography: "{typography.body-compact}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
  socket-pill:
    backgroundColor: "{colors.socket-well}"
    textColor: "{colors.silver-secondary}"
    typography: "{typography.body-compact}"
    rounded: "{rounded.pill}"
    padding: "8px 12px"
  socket-pill-selected:
    backgroundColor: "{colors.obsidian-surface}"
    textColor: "{colors.chalk-ink}"
  stage-frame:
    backgroundColor: "{colors.obsidian-canvas}"
    textColor: "{colors.chalk-ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
  widget-tile:
    backgroundColor: "{colors.obsidian-surface}"
    textColor: "{colors.chalk-ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  command-tab-active:
    backgroundColor: "{colors.chrome-primary}"
    textColor: "{colors.obsidian-on-light}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "24px"
    padding: "0 12px"
---

# Design System: Nexus

## Overview

**Creative North Star: "The Obsidian Observatory"**

Nexus is built like a quiet, precision-calibrated personal observatory rather than a noisy software dashboard. Every surface begins from pure pitch black and steps through a tightly controlled monochrome obsidian ramp separated by crisp 1px white hairlines, leaving all ambient energy to the golden singularity core and a sparse vocabulary of warm gold status cues. The product chrome stays deliberately cool and silent until summoned so live data—schedules, mail, multi-track audio waveforms, clean reading prose, and telemetry—takes full priority.

Across both the public landing experience and the authenticated operating environment, information density is disciplined rather than decorative. Editorial bands use asymmetric two-column splits, generous pitch-black breathing room, and hairline-divided ledgers; interactive workspaces compress cleanly into nested obsidian containers with tabular alignment and zero gratuitous chrome. Authenticated dashboard and onboarding flows also carry a Gallery Light counterpart built on warm stone surfaces and charcoal ink with muted bronze-gold accents, preserving identical monochrome restraint in daylight.

Confirmed visual rejections shape every surface: Nexus refuses stacked glowing feature-card showcases, uppercase tracked eyebrow kickers, decorative starbursts or radial halos behind copy, and symmetric three-column icon-heading-paragraph grids.

**Key Characteristics:**
- Neutral obsidian luminance ladder stepping cleanly from pitch black (`#000000`) through matte obsidian (`#0a0a0c`), canvas (`#0f0f12`), surface (`#16161a`), elevated (`#1c1c21`), and active selection (`#24242b`).
- Monochrome chalk-on-obsidian controls paired with strictly rationed Singularity Gold (`#f0b54a`) reserved for the vertical spine hairline, active selection ticks, live status dots, text caret, and focus rings.
- Light-weight `Manrope` (`300`) display typography paired with tabular numerals across all live cockpit readouts, with `Cormorant Garamond` reserved exclusively for ceremonial onboarding prompts.
- Flat-at-rest surfaces delineated by crisp `1px` neutral white hairlines (`rgba(255, 255, 255, 0.09–0.16)`), reserving shadows and backdrop blur solely for floating chrome and drag states.
- Unified Lucide `1.5px` vector stroke iconography and restrained `180ms–260ms` motion choreography honoring `prefers-reduced-motion`.

## Colors

A disciplined pitch-black and neutral obsidian palette accented by one rationed warm gold signal and minimal semantic alerts.

### Primary
- **Singularity Gold** (`#f0b54a`): Primary brand accent (`--land-gold`, `--chart-1`). Reserved strictly for the continuous vertical spine hairline, active left-rail selection indicator, live connector dots, unread message dot, audio playhead, fastest-sector telemetry highlight, text `caret-color`, custom scrollbar thumb (`rgba(240, 181, 74, 0.4)`), and `:focus-visible` outlines.
- **Amber Halo** (`#ffd99a`): Soft warm gold tint (`--land-gold-soft`, `--chart-2`). Used for the hero beta capsule label, footer navigation hover states, prose inline links, and inline code text.
- **Gold Tint** (`rgba(240, 181, 74, 0.16)`): Subtle translucent accent wash (`--accent`). Used for active extension slot rings, highlighted research reader passages (`rgba(240, 181, 74, 0.22)`), and text selection (`rgba(240, 181, 74, 0.3)`).
- **Gold Focus Ring** (`rgba(240, 181, 74, 0.56)`): Translucent focus halo (`--ring`, `--sidebar-ring`) applied to keyboard-focused buttons, waitlist capsules, and dashboard inputs.

### Secondary
- **Coral Alert** (`#f0957a`): Soft warm coral (`--cmd-alert`). Used exclusively for Command warning notices and non-fatal sync alerts.
- **Signal Destructive** (`#f87171`): High-legibility red (`--destructive`). Used for destructive actions, form validation errors, and inline waitlist alert states.
- **Signal Success** (`#4ade80`): Crisp emerald confirmation text paired with `#27c93f` icon fills inside waitlist confirmation banners.

### Neutral
- **Pitch Black** (`#000000`): Root canvas for `html`, `body`, the landing page (`.landing`), the dashboard home backdrop (`.dash`), and primary landing bands.
- **Matte Obsidian** (`#0a0a0c`): Full-bleed recessed band surface used to separate the platform roadmap band from adjacent pitch-black sections.
- **Socket Well** (`#0b0b0e`): Landing `--card` / `--popover` surface and resting fill for unselected ecosystem pills on the horizontal socket rail.
- **Obsidian Canvas** (`#0f0f12`): Primary authenticated workspace background (`:root --background`, `--sidebar`, `.cmd-screen`) and outer frame for the landing workspace stage.
- **Obsidian Surface** (`#16161a`): Standard tile and card surface (`:root --card`) for Command cockpit widgets (Calendar, Gmail, Weather, Formula 1), Studio/Research panels, and selected socket pills.
- **Obsidian Elevated** (`#1c1c21`): Raised popover, tooltip, and contextual menu surface (`:root --popover`).
- **Obsidian Selected** (`#24242b`): Active list-item selection fill (selected Gmail row, active Studio Record/Edit tab); active calendar day buttons step one stop brighter to **Obsidian Active Cell** (`#2e2e36`).
- **Pure White** (`#ffffff`): Hover fill for primary chalk CTA buttons and pressed primary states.
- **Chalk Ink** (`#f5f5f7`): Primary text ink (`--land-ink`, `--foreground`) for display headings, titles, active tab labels, and primary CTA button backgrounds.
- **Chrome Primary** (`#f4f4f6`): Monochrome primary fill (`--primary`) for authenticated Command tabs and active primary chrome controls.
- **Obsidian-on-Light** (`#09090b`): High-contrast dark ink (`--primary-foreground`) set inside `#f5f5f7` and `#f4f4f6` primary controls.
- **Silver Secondary** (`#d1d1d6`): High-legibility secondary ink for unselected socket pills, live connector directory names, and primary inline links.
- **Ash Muted** (`#a1a1a6`): Standard body copy, editorial prose, subheadings, and default footer links (`--land-muted`, `--muted-foreground`).
- **Pewter Meta** (`#8e8e95`): AA-compliant tertiary ink for timestamps, weekday column labels, planned roadmap badges, input placeholders, sample-data disclosure, and footer sign-off copy.
- **Hairline Subtle** (`rgba(255, 255, 255, 0.09)`): Resting divider rule (`--land-hair`) for widget borders (`0.08–0.09`), table column rules (`0.07`), footer dividers, and horizontal editorial separators.
- **Border Default** (`rgba(255, 255, 255, 0.12)`): Structural stroke (`--border`) for the workspace stage shell, waitlist capsule container, and connected horizontal socket track.
- **Border Strong** (`rgba(255, 255, 255, 0.16)`): Emphasized stroke (`--land-line`, `--input`) for frosted header pills, auth inputs, and desktop inactive layer rail ticks.
- **Gallery Light Mode (Authenticated Alternate):** When users select Gallery Light in onboarding or settings (`.dash[data-theme="light"]`), surfaces invert to **Gallery Canvas** (`#eceae5`) and **Gallery Surface** (`#f5f4f0`), text shifts to **Gallery Ink** (`#1a1917`), and accents shift to muted **Gallery Gold** (`#9a761c`) while preserving identical hierarchy and borders (`rgba(26, 25, 23, 0.08–0.14)`).

### Named Rules
**The Singularity Gold Reserve Rule.** Reserve Singularity Gold (`#f0b54a`) strictly for the vertical spine hairline, active selection ticks, live status dots, text caret, and keyboard focus rings—never for full-bleed card fills, primary CTA buttons, or decorative gradients.

**The Monochrome Chrome Rule.** Keep primary buttons, active view tabs, and cockpit controls in crisp chalk-on-obsidian contrast (`#f5f5f7` / `#f4f4f6` with `#09090b` ink) so ambient energy stays anchored to the golden singularity and live telemetry.

**The AA Tertiary Floor Rule.** Use Pewter Meta (`#8e8e95`) as the minimum contrast floor for metadata, timestamps, and planned labels on dark obsidian surfaces; never drop legible copy down to legacy faint gray (`#6e6e73`).

## Typography

**Display Font:** `Manrope` (with `-apple-system, "SF Pro Display", "Helvetica Neue", sans-serif` fallback); `Cormorant Garamond` (with `Georgia, serif` fallback) reserved strictly for ceremonial onboarding prompts.
**Body Font:** `Manrope` (weights `300`, `400`, `500`, `600`, loaded via `next/font/google` as `--font-manrope` / `--font-landing`).
**Label/Mono Font:** `Manrope` with `font-variant-numeric: tabular-nums` for telemetry labels; `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` for inline code and extension capability scopes.

**Character:** Calm, architectural geometric sans-serif restraint. Light-weight (`300`) headlines paired with tight negative tracking give marketing sections an unhurried editorial presence, while `400–500` weights and tabular numerals keep dense workstation readouts razor-aligned without visual bulk.

### Hierarchy
- **Display** (`300`, `clamp(2.25rem, 4.4vw, 4.5rem)`, `1.06` line-height, `-0.035em` tracking): Reserved for the full-viewport hero statement (`max-w-[18ch]`, `text-wrap: balance`).
- **Editorial Display** (`Cormorant Garamond`, `400`, `clamp(1.9rem, 3.2vw, 2.3rem)`, `1.08` line-height, `-0.02em` tracking): Ceremonial onboarding prompt (`"Press to get Started"`) and sequential setup step titles inside the authenticated first-run flow.
- **Headline** (`300`, `clamp(2rem, 3.6vw, 3rem)` to `clamp(2.25rem, 4.4vw, 3.5rem)`, `1.06–1.08` line-height, `-0.03em` to `-0.035em` tracking): Primary section headings across the landing page (`text-wrap: balance`).
- **Title** (`400–500`, `20px–22px`, `1.25` line-height, `-0.02em` tracking): Interactive desktop layer selector labels (`21px`), expandable roadmap step titles (`20px–22px`), and dashboard panel headings (`22px`).
- **Body** (`400`, `15px–16px`, `1.58–1.7` line-height): Narrative paragraphs, design principles, roadmap summaries, and open-beta framing. Keep prose measure constrained to `46ch–60ch`.
- **Compact UI Body** (`400–500`, `13px–14px`, `1.5–1.65` line-height): Cockpit widget headers (`14px–15px`), inbox subjects, reader excerpts, connector directory items, form controls, and footer navigation.
- **Label** (`500`, `11px–12px`, `1.35` line-height, `tabular-nums`): Calendar weekday columns (`11px`), weather hour slots, Formula 1 timing headers, Command date stamp, and status counts.
- **Mono** (`400`, `11.5px–12px`, `1.6–1.7` line-height): Inline documentation code and developer capability diagnostics.

### Named Rules
**The Light-Display Rule.** Set display and section headlines in `Manrope` Light (`300`) with tight negative tracking (`-0.03em` to `-0.035em`) and `text-wrap: balance`; convey hierarchy through scale and negative space rather than heavy bolding.

**The Tabular Telemetry Rule.** Apply `font-variant-numeric: tabular-nums` to every timestamp, calendar grid, weather readout, audio timecode, and race timing column so live numbers never jitter horizontally.

**The No-Eyebrow Rule.** Open every band directly with its balanced headline rather than an uppercase tracked eyebrow or category kicker.

## Layout

Nexus anchors its public architecture around a `1280px` centered frame (`max-w-[1280px]`) wrapped in responsive page gutters: `24px` on mobile (`px-6`), `40px` from `640px` (`sm:px-10`), and `56px` from `1024px` (`lg:px-14`). Closing conversion sections narrow to a `600px` focal column with a `460px` waitlist capsule, while long-form prose pages (`.site-document`) hold a `46rem` (`736px`) reading column.

Every landing band connects along a single centered `1px` vertical golden spine descending directly from the `100svh` hero singularity, bridging bands with `48px–56px` hairline connectors (`h-12` / `h-14`), and terminating cleanly in a `6px` Singularity Gold dot above the closing open-beta call to action.

Below the hero, layouts deliberately avoid symmetric 3-column card grids in favor of purposeful asymmetry and dense editorial directories:
- **Workstation Stage:** Asymmetric `232px` left layer-selector rail beside a fluid `1fr` obsidian cockpit frame (`lg:grid-cols-[232px_minmax(0,1fr)]`, `40px` column gutter); collapses on mobile (`< 1024px`) to a 3-column segmented obsidian bar above the stage.
- **Command Cockpit Preview:** `0.88fr / 1.52fr` split at `>= 1280px` placing the 30-day calendar beside stacked two-pane Gmail (`1fr / 1.02fr`) and paired Weather + Formula 1 telemetry tiles (`12px` gutters throughout). The live authenticated Command overview extends this into a customizable `4×2` draggable widget board.
- **Editorial Splits:** Asymmetric `0.82fr / 1.18fr` philosophy principles, `0.86fr / 1.14fr` interactive roadmap, and `0.72fr / 1.28fr` security specification ledger—each using crisp `1px` horizontal row dividers instead of boxed cards.
- **Connector Index:** Borderless 4-column Swiss directory (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, `40px` gutters) anchored by a top `1px` rule per category.
- **Vertical Rhythm:** Generous section padding (`80px` default, `96px–112px` on desktop) offsets tight `12px–16px` internal cockpit density.

## Elevation & Depth

Nexus is a tonal-layering system, not a shadow-driven system. At rest, surfaces sit completely flat on pitch black (`#000000`) and establish hierarchy strictly through measured luminance steps—matte obsidian (`#0a0a0c`), obsidian canvas (`#0f0f12`), obsidian surface (`#16161a`), elevated popover (`#1c1c21`), and active selection (`#24242b`)—paired with crisp `1px` neutral white hairlines (`rgba(255, 255, 255, 0.08–0.16)`).

Shadows and frosted translucency (`backdrop-filter: blur(12px–20px)`) are reserved exclusively for floating chrome over live canvases (sticky header, frosted signup pill, dashboard voice input, floating `.node-panel` drawer), active drag-and-drop widget interactions, and keyboard focus halos.

### Shadow Vocabulary
- **Waitlist Focus Halo** (`box-shadow: 0 0 0 3px rgba(240, 181, 74, 0.14)`): Applied to `.waitlist-input-group:focus-within` alongside a `rgba(240, 181, 74, 0.55)` border shift.
- **Dashboard Input Focus Halo** (`box-shadow: 0 0 0 4px rgba(240, 181, 74, 0.08)`): Applied to the floating `.dash-input:focus-within` voice/text bar.
- **Widget Hover Lift** (`box-shadow: 0 12px 32px rgba(0, 0, 0, 0.38)`): Applied only on `.cmd-widget--preview:hover` alongside a `-1px` vertical lift and subtle gold border (`rgba(240, 181, 74, 0.38)`).
- **Widget Drop Target** (`box-shadow: 0 0 0 2px rgba(240, 181, 74, 0.34), 0 18px 42px rgba(0, 0, 0, 0.36)`): Active reorder target ring inside the Command `4×2` board.
- **Floating Node Drawer** (`box-shadow: 0 22px 60px rgba(0, 0, 0, 0.45)`): Grounding shadow beneath translucent `.node-panel` overlays (`backdrop-filter: blur(18px)`).
- **Drag Ghost** (`box-shadow: 0 24px 64px rgba(0, 0, 0, 0.52)`): Floating preview while dragging a Command widget tile.

### Named Rules
**The Flat-At-Rest Rule.** Marketing stages, cockpit tiles, and editorial ledgers carry zero drop shadows at rest; separation comes strictly from surface luminance steps and `1px` neutral hairlines.

**The Hairline Over Glow Rule.** Mark structure and boundaries with `1px` translucent white borders (`rgba(255, 255, 255, 0.08–0.16)`) instead of colored ambient halos or outer card glows.

## Shapes

Form language follows nested concentric geometry: larger outer enclosures use gentler corners while nested interactive elements step down tightly in radius so inner and outer edges stay optically parallel.

- **Outer Enclosures (`16px` / `18px`):** Main obsidian workspace stage frame (`16px`), authenticated Command widget cards (`.cmd-widget`, `16px`), and floating dashboard `.node-panel` drawers (`18px`).
- **Standalone Auth Controls (`14px`):** Sign-up inputs (`.landing-input`), full-width auth buttons (`.landing-primary`, `.landing-google`), and waitlist confirmation boxes (`.waitlist-success-box`).
- **Inner Cockpit Tiles (`10px`):** All primary workspace tiles inside the stage (`Calendar`, `Gmail`, `Weather`, `Formula 1`, `Studio`, `Research`, `Sockets`) and the mobile 3-column layer selector bar (`--radius: 0.625rem`).
- **Compact Sub-Controls (`6px` / `7px`):** Calendar day cells (`7px`), Studio Record/Edit tab well (`7px`, inner active tab `5px`), Research search bar (`7px`), and selected inbox rows (`6px`).
- **Full Capsules (`999px`):** Waitlist input/button capsule, hero frosted signup button, beta badge, horizontal socket rail pills, Command view switcher tabs, and dashboard voice chips/inputs.
- **Iconography & Hairlines:** Every UI icon uses Lucide outlines at `1.5px` stroke width (`14px–16px` inline, `28px` hero weather glyph at `1.35px`). Status indicators are crisp geometric dots (`6px` live / unread, `4px` inline surface bullets) rather than filled badges or emoji.

## Components

Interactive surfaces feel calm, matte, and precision-machined—quiet at rest, immediate on hover, and unmistakably outlined in Singularity Gold on keyboard focus.

### Buttons
- **Shape:** Full pill capsule (`999px` radius) for landing conversion CTAs, header pills, and Command utility controls; `14px` radius for stacked authentication form buttons; `16px` (`rounded-2xl`) for base UI buttons.
- **Primary:** Chalk Ink fill (`#f5f5f7`) with Obsidian-on-Light text (`#09090b`), `14px` `Manrope` Medium (`500`), `11.5px 23px` padding (`0.72rem 1.45rem`), zero border.
- **Hover / Focus:** Transitions over `180ms–200ms ease` to Pure White (`#ffffff`). Keyboard focus renders a `2px solid #f0b54a` outline with `2px` offset (or `ring-3` `rgba(240, 181, 74, 0.56)` on Base UI controls).
- **Frosted Glass Header CTA:** Translucent white fill (`rgba(255, 255, 255, 0.07)`), `1px solid rgba(255, 255, 255, 0.16)`, `backdrop-filter: blur(16px)`, `36px` height, `0 18.4px` padding; hovers to `rgba(255, 255, 255, 0.14)` fill and `rgba(255, 255, 255, 0.3)` border.
- **Ghost / Quiet Text Action:** Transparent resting background with Ash Muted (`#a1a1a6`) or Silver Secondary (`#d1d1d6`) ink, shifting cleanly to Chalk Ink (`#f5f5f7`) or Singularity Gold (`#f0b54a`) on hover.

### Chips
- **Style (Socket Ecosystem Pill):** Pill-shaped (`999px`) interactive buttons sitting along a shared horizontal `1px` track (`rgba(255, 255, 255, 0.12)`). Resting fill is Socket Well (`#0b0b0e`) with `1px solid rgba(255, 255, 255, 0.13)`, `8px 12px` padding, `13px` Regular Silver Secondary (`#d1d1d6`) label and muted parenthetical status (`(Live)` in `#a1a1a6`, `(Planned)` in `#8e8e95`).
- **State:** Hover brightens border to `rgba(255, 255, 255, 0.26)` and ink to `#f5f5f7`. Selected state shifts fill to Obsidian Surface (`#16161a`), border to `rgba(240, 181, 74, 0.55)`, and ink to `#f5f5f7`, revealing the socket's one-line architectural summary underneath.
- **Beta Capsule (`.landing-beta`):** Compact `18.4px` (`1.15rem`) pill with `1px solid rgba(240, 181, 74, 0.5)`, transparent background, and Amber Halo (`#ffd99a`) `10px` lowercase text reserved exclusively next to the hero wordmark.

### Cards / Containers
- **Corner Style:** `16px` radius for the outer obsidian stage frame and live `.cmd-widget` dashboard cards; `10px` radius for nested cockpit tiles.
- **Background:** Outer stage uses Obsidian Canvas (`#0f0f12`); nested tiles use Obsidian Surface (`#16161a`); audio track rows step down into `#111115`.
- **Shadow Strategy:** Completely flat at rest (`box-shadow: none`); authenticated preview widgets gain `Widget Hover Lift` (`0 12px 32px rgba(0, 0, 0, 0.38)`) and a `-1px` rise only on hover.
- **Border:** `1px solid rgba(255, 255, 255, 0.12)` on the outer stage frame; `1px solid rgba(255, 255, 255, 0.08–0.09)` on nested tiles and resting Command widgets.
- **Internal Padding:** `12px–16px` on the outer stage (`p-3 sm:p-4`), `14px–16px` inside nested cockpit tiles (`p-3.5` / `p-4`), with `12px` (`gap-3`) grid gutters. Switching layers triggers a `260ms cubic-bezier(0.22, 1, 0.36, 1)` cross-fade and `4px` upward settle (`.lp-stage-panel`), disabled under `prefers-reduced-motion: reduce`.

### Inputs / Fields
- **Style (Waitlist Capsule):** Above `540px`, email field and Chalk Ink submit button dock inside one `999px` capsule (`rgba(255, 255, 255, 0.04)` fill, `1px solid rgba(255, 255, 255, 0.12)` border, `4px` inner padding). Below `540px`, the field and submit button stack vertically (`10.4px` gap) as separate pills. Input text is `14px` Chalk Ink (`#f5f5f7`), placeholder Pewter Meta (`#8e8e95`), and `caret-color` Singularity Gold (`#f0b54a`).
- **Focus:** Transitions over `200ms ease` to `rgba(240, 181, 74, 0.55)` border with `0 0 0 3px rgba(240, 181, 74, 0.14)` focus halo.
- **Error / Success / Disabled:** Error renders an inline `12px`-radius destructive alert (`rgba(239, 68, 68, 0.1)` fill, `rgba(239, 68, 68, 0.3)` border, `#fca5a5` copy). Success replaces the form with a `14px`-radius confirmation box (`rgba(39, 201, 63, 0.1)` fill, `#4ade80` title). Loading disables controls at `0.6` opacity.

### Navigation
- **Asymmetric Layer Rail:** Desktop (`>= 1024px`) displays three unboxed single-line `21px` buttons stacked vertically (`20px` gap). Each carries a `1px × 24px` vertical tick on its left edge: `rgba(255, 255, 255, 0.16)` at rest, `rgba(255, 255, 255, 0.34)` on hover, and solid Singularity Gold (`#f0b54a`) when active (`#f5f5f7` label vs `#8e8e95` inactive). Mobile collapses into a `10px`-radius Obsidian Canvas (`#0f0f12`) 3-column segmented pill bar with `#1d1d23` active cell fill.
- **Command Segmented View Switcher:** Centered `28px`-tall pill track (`border-border/65 bg-card/75 p-0.5`) holding `24px`-tall pill tabs (`12px` Medium). Active tab flips to Chrome Primary (`#f4f4f6`) with Obsidian-on-Light (`#09090b`) ink; inactive tabs stay Ash Muted (`#a1a1a6`).
- **Site Header & Footer:** Hero header floats cleanly with the Nexus wordmark, `in beta` capsule, and frosted `Join waitlist` pill (`px-6 pt-6` scaling to `lg:px-14 sm:pt-8`). Inner documentation pages use a sticky `rgba(0, 0, 0, 0.78)` header with `blur(18px)`. Footer pairs the wordmark and 7 compact links (`14px` `#a1a1a6`, hover `#ffd99a`) above a `1px` hairline (`rgba(255, 255, 255, 0.09)`) and `#8e8e95` sign-off with a Singularity Gold heart icon.

### Singularity Spine
A continuous `1px` vertical axis hairline (`w-px`) descending from the preserved hero singularity straight through the center of the landing composition (`bg-gradient-to-b from-[#f0b54a]/60 via-[#f0b54a]/28 to-white/[0.15]`), reappearing as `48px–56px` quiet bridges between sections, and terminating in an `80px` vertical drop capped by a `6px` Singularity Gold dot (`h-1.5 w-1.5 rounded-full bg-[#f0b54a]`) centered above the closing open-beta heading.

## Do's and Don'ts

### Do:
- **Do** step surfaces cleanly along the obsidian luminance ladder (`#000000` -> `#0a0a0c` -> `#0f0f12` -> `#16161a` -> `#1c1c21`) separated by `1px` translucent white hairlines (`rgba(255, 255, 255, 0.08–0.16)`).
- **Do** follow **The Singularity Gold Reserve Rule**—restrict `#f0b54a` to the vertical spine hairline, active selection ticks, live status dots, text caret, playhead, and `:focus-visible` outlines.
- **Do** keep primary conversion buttons and active segmented tabs in monochrome chalk-on-obsidian contrast (`#f5f5f7` / `#f4f4f6` with `#09090b` ink).
- **Do** set section headlines in `Manrope` Light (`300`) with `-0.03em` to `-0.035em` tracking and `text-wrap: balance`, and apply `tabular-nums` to all clocks, dates, temperatures, and timing tables.
- **Do** use asymmetric split grids (`232px / 1fr`, `0.82fr / 1.18fr`, `0.72fr / 1.28fr`) and hairline-divided rows for editorial and specification sections.
- **Do** maintain Pewter Meta (`#8e8e95`) as the darkest readable metadata ink on black/obsidian surfaces and honor `prefers-reduced-motion: reduce` on every transition or entrance animation.

### Don't:
- **Don't** add uppercase tracked eyebrows or category kickers above headlines; open every band directly with its display or section title.
- **Don't** place ambient radial glows, colored drop shadows, or decorative starbursts behind text, cards, or cockpit frames.
- **Don't** build equal-width 3-column icon-heading-paragraph feature-card grids or invented dollar pricing tier tables.
- **Don't** fill primary buttons, badges, or full cards with solid Singularity Gold (`#f0b54a`)—its restraint is what anchors the hierarchy.
- **Don't** mix multiple icon libraries or emoji glyphs into UI chrome; stay exclusively on Lucide `1.5px` stroke vectors.
- **Don't** use `Cormorant Garamond` inside the dense Command cockpit or marketing landing bands—keep it exclusively within ceremonial onboarding prompts.
