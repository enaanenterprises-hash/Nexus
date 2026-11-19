<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Design Skills & Standards

Whenever designing, redesigning, building, auditing, or polishing any UI surface in Nexus, proactively load and apply all relevant installed design skills in `.agent/skills/` alongside project design references:

- **Core design & anti-slop skills**: `impeccable`, `unslop`, `taste-skill` (`design-taste-frontend`, including existing-project redesign workflow), `minimalist-ui`, `frontend-design`, `ui-ux-pro-max` (and companion `uipro-*` skills), `brandkit`, `full-output-enforcement`, `apple-hig`, `find-skills`, and `superpowers-*`.
- **Canonical project design docs**: Read `PRODUCT.md`, `DESIGN.md` (plus `.impeccable/design.json`), and `docs/design/apple-hig-reference.md` before writing UI code.
- **Craft standards**: Follow Apple Human Interface Guidelines (Clarity, Deference, Depth, concentric radii, Liquid Glass reserved strictly for floating chrome, AA contrast >= 4.5:1, tabular numerals, `44px` ergonomic touch targets, spring/ease-out motion with `prefers-reduced-motion` support), avoid AI-slop defaults (no uppercase tracked eyebrows, no decorative glow halos, no generic 3-column icon-card grids, no fabricated metrics), and visually verify builds in a real browser across desktop and mobile before finishing.
