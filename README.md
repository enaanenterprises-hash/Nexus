# Nexus

Personal AI operating environment — a centralized neural network with a modular extension architecture.

**Step 1** ships the Main Nexus Interaction Dashboard and the foundational extension network socket. Studio, Study, Call, and Calendar are visual slots only (not implemented yet).

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

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # production build
npm run start   # serve production build
```

## What’s in Step 1

1. **Living Nexus core** — proactive suggestions + mock intelligent replies (no real LLM required).
2. **Task & life organization** — active tasks, priorities, ongoing context (local mock state).
3. **Extension Hub** — orbital nodes for Studio / Study / Call / Calendar / third-party; **2 free** active slots, additional nodes gated behind a **Pro stub**.
4. **Extension socket** — register → activate → subscribe/emit shared context. See [docs/extensions.md](docs/extensions.md).

## Key paths

| Path | Purpose |
| --- | --- |
| `src/app/page.tsx` | Dashboard entry |
| `src/components/dashboard/` | UI: core, hub, tasks, field |
| `src/lib/extensions/` | Registry, bus, Pro gate, slots |
| `src/lib/nexus/mock-brain.ts` | Mock proactive / reply brain |
| `docs/extensions.md` | Extension author contract |

## Freemium stub

Free plan: `FREE_ACTIVE_EXTENSION_SLOTS = 2`. Toggle **Stub: Enable Pro** on the dashboard (calls `setStubPro(true)`) to unlock Pro-tier visual slots for demos. Billing/auth is not wired yet.
