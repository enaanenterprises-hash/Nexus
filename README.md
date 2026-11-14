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
| `/dashboard` | Main Nexus Interaction Dashboard + Extension Hub (requires a session) |

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
| `src/app/signup/page.tsx` | Sign-in page |
| `src/app/dashboard/page.tsx` | Dashboard entry (session required) |
| `src/auth.ts` | Auth.js config (Google, Resend, database sessions) |
| `src/components/landing/` | Landing UI |
| `src/components/dashboard/` | Dashboard UI (stage, sockets, voice, Today, hub) |
| `src/lib/network/geometry.ts` | Shared math for both network renderers |
| `src/lib/extensions/` | Registry, bus, manifest validation, Pro gate, slots |
| `src/extensions/samples.ts` | Sample extensions built on the public contract |
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
2. Tables are created on the first sign-in attempt. To create them yourself:

```bash
DATABASE_URL="postgresql://…" npm run db:setup
```

Do not commit the URL. `npm run db:setup` only prints a redacted error if the connection fails.
