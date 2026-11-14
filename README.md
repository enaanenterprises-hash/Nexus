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
2. **Dashboard network** — the same golden network, full-bleed and pitch black (`src/components/dashboard/NeuralStage.tsx`). The core reacts to Nexus: sparks converge while it thinks, ripples spread while it speaks.
3. **Talking to Nexus** — one calm voice under the core with word-by-word replies, proactive openers and nudges, and follow-up suggestions (mock brain, no real LLM).
4. **Today** — focus, priorities, and ongoing context. Nexus rewrites it when you ask (organize the day, add or complete tasks, note context).
5. **Extension Hub** — five sockets on an arc wired into the core: **2 free**, 3 behind a **Pro stub**. Studio / Study / Call / Calendar are placeholders; three sample extensions show how a node snaps in.
6. **Extension socket** — validated manifests, slot-aware registry, typed bus, Pro gate, React binding. See [docs/extensions.md](docs/extensions.md).

Studio, Study, Call, Calendar, and Dev products are **not** implemented — placeholders and the socket only.

## Key paths

| Path | Purpose |
| --- | --- |
| `src/app/page.tsx` | Marketing landing |
| `src/app/dashboard/page.tsx` | Dashboard entry |
| `src/components/landing/` | Landing UI |
| `src/components/dashboard/` | Dashboard UI (stage, sockets, voice, Today, hub) |
| `src/lib/network/geometry.ts` | Shared math for both network renderers |
| `src/lib/extensions/` | Registry, bus, manifest validation, Pro gate, slots |
| `src/extensions/samples.ts` | Sample extensions built on the public contract |
| `src/lib/nexus/brain.ts` | Mock brain (intents → replies + task actions) |
| `docs/extensions.md` | Extension author contract |

## Freemium stub

Free plan: `FREE_ACTIVE_EXTENSION_SLOTS = 2`, free sockets only. On the dashboard, **Preview Pro** (calls `setStubPro(true)`) opens the Pro sockets; switching back releases anything in them. Billing/auth is not wired yet.

```bash
npm run smoke   # gate + slot rules smoke test
```
