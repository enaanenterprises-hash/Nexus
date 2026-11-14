# Nexus

Personal AI operating environment — a centralized neural network with a modular extension architecture.

## Stack

- **Next.js** (App Router) + **TypeScript**
- **React 19**
- **Tailwind CSS v4**
- In-process typed **extension registry / event bus** (`src/lib/extensions`)

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the marketing landing.
Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard) for the Step 1 interaction dashboard.

```bash
npm run build   # production build
npm run start   # serve production build
```

## Routes

| Route | Surface |
| --- | --- |
| `/` | Landing: animated golden neural network, logo, one-line description, Sign up |
| `/signup` | Sign-up stub (email → continues to the dashboard; no auth yet) |
| `/dashboard` | Main Nexus Interaction Dashboard + Extension Hub |

## What’s shipped

1. **Landing** — procedurally drawn golden neural network on canvas (`src/components/landing/GoldenNetwork.tsx`): bezier filaments pinching through a core and fanning out, flowing particles, gentle sway; static frame under reduced motion.
2. **Living Nexus core** — proactive suggestions + mock intelligent replies (no real LLM required).
3. **Task & life organization** — active tasks, priorities, ongoing context (local mock state).
4. **Extension Hub** — orbital nodes for Studio / Study / Call / Calendar / third-party; **2 free** active slots, additional nodes gated behind a **Pro stub**.
5. **Extension socket** — register → activate → subscribe/emit shared context. See [docs/extensions.md](docs/extensions.md).

Studio, Study, Call, Calendar, and Dev products are **not** implemented — slots / placeholders and the socket only.

## Key paths

| Path | Purpose |
| --- | --- |
| `src/app/page.tsx` | Marketing landing |
| `src/app/dashboard/page.tsx` | Dashboard entry |
| `src/components/landing/` | Landing UI |
| `src/components/dashboard/` | Dashboard UI |
| `src/lib/extensions/` | Registry, bus, Pro gate, slots |
| `src/lib/nexus/mock-brain.ts` | Mock proactive / reply brain |
| `docs/extensions.md` | Extension author contract |

## Freemium stub

Free plan: `FREE_ACTIVE_EXTENSION_SLOTS = 2`. On the dashboard, toggle **Stub: Enable Pro** (calls `setStubPro(true)`) to unlock Pro-tier visual slots for demos. Billing/auth is not wired yet.
