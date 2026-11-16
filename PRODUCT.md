# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Solo power users and builders setting up and running a personal AI operating environment. They want immediate clarity, minimal friction, and a calm command workspace that feels ready within seconds.

## Product Purpose

Nexus unifies a spatial neural interface, voice assistant, live external data feeds, and a customizable 4x2 Command board inside one operating environment so context is shared across tools rather than fragmented in silos. First-run setup bridges a new account from initial arrival to an active, personalized dashboard.

## Operating Context

1. New users sign in (email/password or Google OAuth) and enter the onboarding sequence before unlocking `/dashboard`.
2. Setup opens with a golden Moffat singularity over the canvas ("Press to get Started"), explodes outward into neural rays on tap, and presents five intentional sequential setup steps: **Name**, **Theme**, **Apps**, **Widgets**, and **Nodes**.
3. On completion, the neural field expands to fill the screen, holds briefly at full saturation, collapses back to the exact dashboard singularity coordinate, holds at peak compression, and detonates into the live `/dashboard` workspace (which hosts the Command hub, Overview 4x2 grid, Voice core, Socket switcher, and Extensions).

## Capabilities and Constraints

- Existing Next.js App Router codebase (`next` 16.4.6, `react` 19.3.0, Tailwind CSS v4, PostgreSQL + Drizzle ORM + Auth.js v5).
- Five setup steps (`name`, `theme`, `apps`, `widgets`, `nodes`) are intentionally preserved in sequence and must work cleanly in both Obsidian Dark and Gallery Light themes.
- OAuth app connections (Google services) return cleanly back to the `apps` setup step using session/local resume state.
- Extension nodes on setup are capped by `FREE_ACTIVE_EXTENSION_SLOTS` and currently present sample nodes alongside future installable slots.
- Interactive canvas performance and `prefers-reduced-motion` accessibility must remain crisp without frame drops.

## Brand Commitments

- Name: **Nexus**
- Core visual metaphor: golden singularity & neural web anchored on the exact dashboard core position, paired with monochrome black/white product chrome and surfaces across Dark and Light modes.
- Typography loaded at the root layout: `Cormorant Garamond` (`--font-display`) and `Manrope` (`--font-manrope`).

## Evidence on Hand

- Working Next.js application in `src/` with landing experience (`src/components/landing/`), onboarding flow (`src/components/dashboard/SetupExperience.tsx`, `src/components/dashboard/SetupCanvas.tsx`), dashboard & Command hub (`src/components/dashboard/`, `src/components/command/`), sample extensions (`src/extensions/samples.ts`), and connector catalog (`src/lib/connectors/catalog.ts`).
- `DESIGN.md` has not yet been authored; visual system tokens currently live in `src/app/globals.css`.

## Product Principles

- **Immediate arrival**: Lead from the singularity straight into clear, actionable controls without marketing fluff or onboarding lectures.
- **Monochrome restraint**: Keep setup chrome in crisp monochrome contrast so the golden neural core carries all ambient energy.
- **Intentional pacing**: Give both human decisions and transition choreography deliberate breathing room—all five steps in order, and clear pauses at full neural saturation and singularity compression.
- **Shared state, zero rework**: Changes to theme, connectors, widgets, and nodes persist immediately and carry directly into the first dashboard session.
