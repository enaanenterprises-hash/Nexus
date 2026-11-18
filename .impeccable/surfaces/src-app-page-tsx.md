---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/components/landing/LandingPage.tsx","src/components/landing/LandingScenes.tsx"]
---

# Landing Page (`/`) Surface Brief

- **Scope & visitor mode**: Persuade — public landing page below the preserved first-viewport hero (`src/app/page.tsx`).
- **Audience & job**: Solo power users, engineers, creators, and builders deciding whether Nexus is a real, serious personal AI operating environment worth joining in open beta.
- **Primary action**: Join the open-beta waitlist (`WaitlistForm`), with a quiet secondary `Sign in` link (`/signup`) for existing beta users.
- **Proof & content**: Highlight both the real shipped surfaces (obsidian Command `4×2` board with 30-day Google Calendar, split Gmail inbox & reader, Weather Observatory, Formula 1 Pit Wall, Studio Record & Edit DAW + cloud audio sync, Research Brave Search reader, Network ephemeral voice) and the full planned ecosystem scale (deterministic cross-API automations, 5 orbital sockets — Studio, Research, Study, Call, Ledger & Open TypeScript SDK — plus live and planned connectors across communication, engineering, telemetry, and media), with honest open-beta access framing (Core + 2 active sockets free in beta; Pro sockets in preview; no pricing cards or invented dollar tiers) and visible synthetic data disclosure.
- **Hard constraint**: Keep the initial `100svh` hero section in `src/components/landing/LandingPage.tsx` (`GoldenNetwork`, top header `NEXUS in beta` + `Join waitlist`, and `<h1>One intelligence, connecting everything you do.</h1>`) completely untouched.
- **Approved direction comp**: `.impeccable/mocks/decision/singularity-spine.png` (sidecar marked `"approved": true`). Because the user explicitly pinned the first viewport (`100svh` hero) untouched, this comp governs Band 1 directly below the preserved hero (`SingularityStage.tsx`) and is audited visually via full-frame desktop/mobile captures rather than a first-viewport `hero-repro.png` comp-diff gate; no raster plates are added below the hero (all workspace UI below the hero is live interactive HTML/CSS/SVG/Lucide).

## Direction contract

- **THESIS**: Nexus is one calm, extensible obsidian operating environment that replaces twenty disconnected tabs; refuses stacked glowing-card showcases, uppercase eyebrows, decorative starbursts behind text, and equal-width 3-column icon+heading+paragraph feature grids.
- **OWN-WORLD**: Seamless transition from pure pitch black (`#000000`) into Nexus's neutral obsidian surface ramp (`#0a0a0c`, `#0f0f12`, `#16161a`, `#1c1c21`), crisp 1px neutral white hairlines (`rgba(255,255,255,0.08–0.14)`), light-to-medium `Manrope` typography with tabular numerals, single Lucide 1.5px stroke icon vocabulary, themed gold `caret-color`, and `#f0b54a` warm gold reserved strictly for the continuous vertical axis hairline, active selection indicators, and focus states.
- **STORY**: Visitors scroll from the golden hero singularity down a continuous vertical golden axis into a calm single-viewport workstation frame (`Command`, `Studio & Research`, `Modular Sockets`), trace how live and planned connectors and automations scale across their day under strict privacy guarantees (ephemeral voice, AES-256-GCM vault, capability-gated sockets), and reserve a spot in the open beta waitlist.
- **FIRST VIEWPORT**: The initial `100svh` hero stays untouched (`GoldenNetwork` + `"One intelligence, connecting everything you do."` + header `Join waitlist`); immediately below the fold inside one `1440×900` frame, a delicate 1px vertical golden axis descends into `"One room for everything you run"`, an asymmetric single-line left layer rail beside a crisp interactive obsidian Command `4×2` cockpit preview (`November` 30-day calendar, two-pane Gmail with slim icon rail + separate reader card, Weather `11° Toronto` with 5 hourly icons, Formula 1 Las Vegas realistic timing), and a connected horizontal socket rail (`Studio`, `Research`, `Study`, `Call`, `Ledger`, `Open SDK`) with quiet `Join waitlist | Sign in` links and visible sample-data disclosure.
- **FORM**: Singularity Spine (list position 3 of 6, dealt lead); `seed:68de601d5ad3ae23`.
- **FINISH**: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
