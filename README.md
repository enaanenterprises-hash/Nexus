# Nexus

Personal AI operating environment — a centralized neural network with a modular extension architecture.

## Stack

- **Next.js** (App Router) + **TypeScript**
- **React 19**
- **Tailwind CSS v4**
- **Auth.js** — Google and Resend magic-link sign-in, sessions in Postgres
- In-process typed **extension registry / event bus** (`src/lib/extensions`)

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the marketing landing.
Open [http://localhost:3000/signup](http://localhost:3000/signup) to sign in.
Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard) for the interaction dashboard (signed-in only).

```bash
npm run build   # production build
npm run start   # serve production build
```

## Routes

| Route | Surface |
| --- | --- |
| `/` | Landing: animated golden neural network, logo, one-line description, Sign up |
| `/signup` | Sign in with Google or an email magic link |
| `/signup/verify` | “Check your email” after a magic link is sent |
| `/dashboard` | Network + chat box; left menu opens nodes (Command, Today, Nodes), right rail for quick access (requires a session) |

## What’s shipped

1. **Landing** — procedurally drawn golden neural network on canvas (`src/components/landing/GoldenNetwork.tsx`): bezier filaments pinching through a core and fanning out, flowing particles, gentle sway; static frame under reduced motion.
2. **Dashboard network** — the same golden network, full-bleed and pitch black (`src/components/dashboard/NeuralStage.tsx`). The core reacts to Nexus: sparks converge while it thinks, ripples spread while it speaks.
3. **Talking to Nexus** — one calm voice under the core with word-by-word replies, proactive openers and nudges, and follow-up suggestions (mock brain, no real LLM).
4. **Today** — focus, priorities, and ongoing context. Nexus rewrites it when you ask (organize the day, add or complete tasks, note context).
5. **Decluttered dashboard** — by default only the network and the chat box. The **left menu** opens nodes as full views (Command) or panels (Today, Nodes, each wired-in extension). The **right rail** gives one-tap access to Command and the five sockets.
6. **Extension Hub** — five sockets wired into the core: **2 free**, 3 behind a **Pro stub**, managed from the **Nodes** panel. Studio / Study / Call / Calendar are placeholders; three sample extensions show how a node snaps in.
7. **Nexus Command (core node)** — the cockpit for the outside world, no AI required. Connect real services (weather, night sky, crypto, F1 and uptime with no keys; Google Calendar, Gmail, Gmail sending and Tasks through Google sign-in; GitHub, Vercel and Telegram with tokens; Strava and Spotify with OAuth). Everything lands on one daily timeline with live readings, a Deep work launcher, goals, deliveries and an automation log. Built-in automations connect the services: Deep work books the calendar and starts your playlist, receipts in Gmail become purchases and package trackers, a Strava run checks off your goal. Items are published as typed `command.*` content other extensions can read. See [Nexus Command](#nexus-command).
8. **Research (core node, hidden for now)** — a browser built into Nexus. One address bar for URLs and web search (Brave Search). It has a clean reader (Readability + sanitize, SSRF-guarded fetch), tabs, back/forward, open original, and a live view when the site allows framing. Pages are saved into per-user collections with tags and highlights. Its code, routes and tables stay in place; it is hidden from navigation by `RESEARCH_VISIBLE` in `src/components/dashboard/Dashboard.tsx`.
9. **Extension socket** — validated manifests, slot-aware registry, typed bus, Pro gate, React binding, and **shared content**: typed, versioned content kinds (`research.source`, `command.*`) that extensions read and annotate through `content:<kind>:<action>` capabilities. Bus events that carry content are only delivered to extensions holding the matching capability. See [docs/extensions.md](docs/extensions.md).

Studio, Study, Call, Calendar, and Dev products are **not** implemented — placeholders and the socket only.

## Key paths

| Path | Purpose |
| --- | --- |
| `src/app/page.tsx` | Marketing landing |
| `src/app/signup/page.tsx` | Sign-in page |
| `src/app/dashboard/page.tsx` | Dashboard entry (session required) |
| `src/auth.ts` | Auth.js config (Google, Resend, database sessions) |
| `src/components/landing/` | Landing UI |
| `src/components/dashboard/` | Dashboard UI (stage, menu, rail, voice, Today, hub) |
| `src/components/command/` | Command node UI (Today, Connections, Automations) |
| `src/lib/command/` | Command kinds, automation engine, recipes, timeline, storage, sync, drivers |
| `src/lib/connectors/` | Connector manifests, catalog, credential vault |
| `src/components/research/` | Research node UI (tabs, reader, search, collections) |
| `src/lib/research/` | Reader fetch + extraction, search provider, research storage |
| `src/lib/content/` | Shared content providers and capability checks (server) |
| `src/lib/network/geometry.ts` | Shared math for both network renderers |
| `src/lib/extensions/` | Registry, bus, manifest validation, Pro gate, slots |
| `src/extensions/samples.ts` | Sample extensions built on the public contract (Ledger reads `command.purchase`) |
| `src/lib/nexus/brain.ts` | Mock brain (intents → replies + task actions) |
| `docs/extensions.md` | Extension author contract |

## Freemium stub

Free plan: `FREE_ACTIVE_EXTENSION_SLOTS = 2`, free sockets only. On the dashboard, **Preview Pro** (calls `setStubPro(true)`) opens the Pro sockets; switching back releases anything in them. Billing is not wired yet. Sign-in is.

```bash
npm run smoke   # gate + slot rules smoke test
```

## Authentication

Sign-in is [Auth.js](https://authjs.dev) (NextAuth v5) on the App Router. There is no password.

- **Google** — OAuth. After success the browser goes to `/dashboard`.
- **Email** — magic link via [Resend](https://resend.com). The first verified link creates the user. Later links sign that user in.
- **Sessions** — stored in Postgres (`user`, `account`, `session`, `verificationToken`). The cookie only holds a session id. Sessions are not kept in memory.

The same verified email can use either Google or the magic link and lands on one account. Signed-out visits to `/dashboard` go to `/signup`. The landing **Sign up** button already points there.

If a required variable is missing, the sign-in page says which ones, and nothing is sent or created. Copy `.env.example` to `.env.local` for local work. Set the same names in the Vercel project, then redeploy.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `AUTH_SECRET` | Yes | Signs cookies. Generate with `openssl rand -base64 32`. `NEXTAUTH_SECRET` is also accepted. |
| `AUTH_URL` | Production | Site origin only, no path. Local: `http://localhost:3000`. Production: `https://nexus-pied-pi-49.vercel.app`. Magic links are built from this. |
| `DATABASE_URL` | Yes | Postgres connection string. On Vercel, use the Neon **pooled** URL (host contains `-pooler`). |
| `AUTH_GOOGLE_ID` | For Google | OAuth client id. `GOOGLE_CLIENT_ID` is also accepted. |
| `AUTH_GOOGLE_SECRET` | For Google | OAuth client secret. `GOOGLE_CLIENT_SECRET` is also accepted. |
| `AUTH_RESEND_KEY` | For email | Resend API key with sending access. |
| `EMAIL_FROM` | For email | From address on a domain verified in Resend, for example `Nexus <noreply@yourdomain.com>`. |
| `BRAVE_SEARCH_API_KEY` | For web search | [Brave Search API](https://brave.com/search/api/) key, used server-side by Research. Without it, Research shows a notice and opening addresses still works. |
| `NEXUS_CREDENTIALS_KEY` | Recommended | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts Command connector tokens (AES-256-GCM). Without it the key is derived from `AUTH_SECRET`, so rotating `AUTH_SECRET` would force every token-based service to reconnect. |
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | For Strava | [Strava API application](https://www.strava.com/settings/api). |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | For Spotify | [Spotify app](https://developer.spotify.com/dashboard). Playback control needs Spotify Premium. |

### Google Cloud OAuth

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), configure the OAuth consent screen (External is fine). While the app is in Testing, add the Google account you will sign in with as a test user.
2. Create credentials → **OAuth client ID** → **Web application**.
3. Authorized JavaScript origins:
   - `http://localhost:3000`
   - `https://nexus-pied-pi-49.vercel.app`
4. Authorized redirect URIs (exact, including the path):
   - `http://localhost:3000/api/auth/callback/google`
   - `https://nexus-pied-pi-49.vercel.app/api/auth/callback/google`
5. Put the client id in `AUTH_GOOGLE_ID` and the client secret in `AUTH_GOOGLE_SECRET`.

Preview deployments need their own origin and redirect URI if Google sign-in should work there.

### Resend magic link

1. Create an API key at [resend.com/api-keys](https://resend.com/api-keys) with **Sending access**. Put it in `AUTH_RESEND_KEY`.
2. Verify a domain in Resend (the DNS records Resend shows). `EMAIL_FROM` must use that domain.
3. Until a domain is verified, Resend only delivers mail from `onboarding@resend.dev`, and only to the email address on the Resend account. For a first test: `EMAIL_FROM=Nexus <onboarding@resend.dev>`.

The link in the email expires in 24 hours and returns the person to `/dashboard`.

### Database

Any Postgres works. [Neon](https://neon.tech) is a good fit for the Vercel deployment:

1. Create a project and copy the **pooled** connection string into `DATABASE_URL`.
2. Tables (Auth.js, Research: `research_collection`, `research_source`, `research_highlight`, and Command: `command_connection`, `command_item`, `command_automation_run`, `command_recipe_state`, `command_focus`) are created on first use. To create them yourself:

```bash
DATABASE_URL="postgresql://…" npm run db:setup
```

Do not commit the URL. `npm run db:setup` only prints a redacted error if the connection fails.

## Nexus Command

Command (`dev.nexus.core.command`) connects external services, puts your day on one timeline, and runs deterministic automations between them. It never needs AI. The platform side (connector manifests, `command.*` content kinds, gated bus events, automation engine) is documented in [docs/extensions.md](docs/extensions.md#nexus-command-devnexuscorecommand).

### Services

Only services with a real connection can be connected. The rest are listed under **Planned** in Connections, each with what it needs.

| Service | Auth | What Command gets | Setup |
| --- | --- | --- | --- |
| Weather | none | Current conditions, high/low, next 12 hours | [Open-Meteo](https://open-meteo.com), no key |
| Night sky | none | Sunset, astronomical darkness, moon phase, cloud cover, dark-sky window | Open-Meteo + local astronomy |
| Crypto | none | Prices and 24-hour change for the coins you follow | [CoinGecko](https://www.coingecko.com/en/api), no key |
| Formula 1 | none | Every session of the next Grand Prix weekend | [Jolpica F1](https://github.com/jolpica/jolpica-f1) |
| Uptime | none | Response time of up to 5 public sites | Research's SSRF-guarded fetch |
| Google Calendar | Google sign-in | The next 30 days; Deep work books focus blocks | Google OAuth below |
| Gmail | Google sign-in | The 25 most recent inbox messages from the last week; receipts and tracking numbers detected | Google OAuth below |
| Gmail sending | Google sign-in | Compose and reply from Today. Read access stays on `gmail.readonly` | Google OAuth below |
| Google Tasks | Google sign-in | Open tasks and today's completed ones | Google OAuth below |
| GitHub | token | Review requests, assigned issues, your open PRs, today's pushes | [Fine-grained token](https://github.com/settings/personal-access-tokens/new) with read access to issues, pull requests and metadata |
| Vercel | token | Last 20 deployments; a failed deploy creates a task | [Access token](https://vercel.com/account/settings/tokens), optional team id |
| Telegram alerts | bot token | Automations send alerts here | Create a bot with @BotFather, message it, read your chat id from `getUpdates` |
| Strava | OAuth | Activities from the last 7 days; a run checks off your goal | `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` |
| Spotify | OAuth | Deep work plays your focus playlist and pauses it after | `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`, Premium |

Tokens are sealed with AES-256-GCM before they are stored and are never sent back to the browser.

### Google services (incremental scopes)

Calendar, Gmail, Gmail sending and Tasks reuse the Google sign-in client (`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`). **Continue with Google** re-runs Google sign-in asking only for that service's extra scope (`include_granted_scopes`, offline access), and the grant is stored for that service. Connecting Gmail from Today asks for reading and sending together. In Google Cloud Console:

1. Enable the **Google Calendar API**, **Gmail API** and **Google Tasks API** for the project.
2. On the OAuth consent screen, add these scopes:
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/gmail.readonly` (reading the inbox)
   - `https://www.googleapis.com/auth/gmail.send` (compose and reply — add this one)
   - `https://www.googleapis.com/auth/tasks`
3. No new redirect URI is needed; it is the existing `/api/auth/callback/google`.

`gmail.readonly` is a restricted scope. While the consent screen is in **Testing**, it works for listed test users; publishing to everyone requires Google's verification. `gmail.send` is a sensitive scope and is requested on its own so reading stays read-only.

### Strava and Spotify

Register an app with each provider and set the redirect URI to `{AUTH_URL}/api/command/oauth/strava/callback` or `{AUTH_URL}/api/command/oauth/spotify/callback` (add `http://localhost:3000/...` for local work). Put the client id and secret in the variables above.

### Automations

Deep work, Deep work wrap-up, Receipts → tracker + ledger, Run → goal + recovery, Failed deploy alert, Due-soon guard and F1 session reminder ship built in and can be switched off in **Automations**. A step whose service isn't connected is skipped and logged, never faked.
