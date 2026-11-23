import "server-only"
import { createHash, randomBytes } from "node:crypto"
import { DriverError, type DriverContext } from "./types"

const env = (...names: string[]) => names.map((n) => process.env[n]?.trim()).find(Boolean) ?? ""

export interface OAuthEnrichResult {
  credentials: Record<string, string>
  settings: Record<string, string>
}

interface OAuthApp {
  /** Absent for Google, which authorizes through Auth.js (incremental scopes on the sign-in client). */
  authorizeUrl?: string
  tokenUrl: string
  clientId: () => string
  clientSecret: () => string
  envNames: string[]
  clientAuth: "body" | "basic"
  clientIdParam?: string
  pkce?: boolean
  scopeSeparator: string
  extraAuthorize?: Record<string, string>
  enrich?: (app: OAuthApp, creds: Record<string, string>) => Promise<OAuthEnrichResult>
}

export const OAUTH_APPS = {
  google: {
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientId: () => env("AUTH_GOOGLE_ID", "GOOGLE_CLIENT_ID"),
    clientSecret: () => env("AUTH_GOOGLE_SECRET", "GOOGLE_CLIENT_SECRET"),
    envNames: ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"],
    clientAuth: "body",
    scopeSeparator: " ",
  },
  strava: {
    authorizeUrl: "https://www.strava.com/oauth/authorize",
    tokenUrl: "https://www.strava.com/oauth/token",
    clientId: () => env("STRAVA_CLIENT_ID"),
    clientSecret: () => env("STRAVA_CLIENT_SECRET"),
    envNames: ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET"],
    clientAuth: "body",
    scopeSeparator: ",",
    extraAuthorize: { approval_prompt: "auto" },
  },
  spotify: {
    authorizeUrl: "https://accounts.spotify.com/authorize",
    tokenUrl: "https://accounts.spotify.com/api/token",
    clientId: () => env("SPOTIFY_CLIENT_ID"),
    clientSecret: () => env("SPOTIFY_CLIENT_SECRET"),
    envNames: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"],
    clientAuth: "basic",
    scopeSeparator: " ",
  },
  tiktok: {
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    clientId: () => env("TIKTOK_CLIENT_KEY"),
    clientSecret: () => env("TIKTOK_CLIENT_SECRET"),
    envNames: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    clientAuth: "body",
    clientIdParam: "client_key",
    pkce: true,
    scopeSeparator: ",",
    enrich: async (_app, creds) => {
      const settings: Record<string, string> = {}
      const nextCreds = { ...creds }
      try {
        const res = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username", {
          headers: { Authorization: `Bearer ${creds["accessToken"]}` },
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        })
        const data = (await res.json().catch(() => ({}))) as {
          data?: { user?: { open_id?: string; display_name?: string; username?: string } }
        }
        const u = data.data?.user
        if (u?.open_id) nextCreds["openId"] = u.open_id
        if (u?.username) settings["accountLabel"] = `@${u.username.replace(/^@/, "")}`
        else if (u?.display_name) settings["accountLabel"] = u.display_name
      } catch {
        // Optional display handle lookup
      }
      return { credentials: nextCreds, settings }
    },
  },
  meta: {
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    clientId: () => env("META_APP_ID", "INSTAGRAM_APP_ID"),
    clientSecret: () => env("META_APP_SECRET", "INSTAGRAM_APP_SECRET"),
    envNames: ["META_APP_ID", "META_APP_SECRET"],
    clientAuth: "body",
    scopeSeparator: ",",
    enrich: async (app, creds) => {
      const nextCreds = { ...creds }
      try {
        const exchangeUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token")
        exchangeUrl.searchParams.set("grant_type", "fb_exchange_token")
        exchangeUrl.searchParams.set("client_id", app.clientId())
        exchangeUrl.searchParams.set("client_secret", app.clientSecret())
        exchangeUrl.searchParams.set("fb_exchange_token", creds["accessToken"] ?? "")
        const longRes = await fetch(exchangeUrl, { cache: "no-store", signal: AbortSignal.timeout(8_000) })
        const longData = (await longRes.json().catch(() => ({}))) as TokenResponse
        if (longRes.ok && longData.access_token) {
          nextCreds["accessToken"] = longData.access_token
          if (longData.expires_in) {
            nextCreds["expiresAt"] = String(Math.floor(Date.now() / 1000) + longData.expires_in)
          }
        }
      } catch {
        // Keep short-lived token if long-lived exchange fails temporarily
      }

      const pagesUrl = new URL("https://graph.facebook.com/v21.0/me/accounts")
      pagesUrl.searchParams.set("fields", "id,name,instagram_business_account{id,username}")
      pagesUrl.searchParams.set("access_token", nextCreds["accessToken"] ?? "")
      const pagesRes = await fetch(pagesUrl, { cache: "no-store", signal: AbortSignal.timeout(10_000) }).catch(() => null)
      const pagesData = pagesRes
        ? ((await pagesRes.json().catch(() => ({}))) as {
            data?: Array<{
              id: string
              name?: string
              instagram_business_account?: { id?: string; username?: string }
            }>
          })
        : {}

      const match = pagesData.data?.find((p) => Boolean(p.instagram_business_account?.id))
      const igAccount = match?.instagram_business_account
      if (!igAccount?.id) {
        throw new DriverError(
          "No Instagram Creator or Business account linked to a Facebook Page was found.",
          "auth",
        )
      }

      nextCreds["igUserId"] = igAccount.id
      const settings: Record<string, string> = {}
      if (igAccount.username) settings["accountLabel"] = `@${igAccount.username.replace(/^@/, "")}`
      else if (match?.name) settings["accountLabel"] = match.name
      return { credentials: nextCreds, settings }
    },
  },
  x: {
    authorizeUrl: "https://x.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    clientId: () => env("X_CLIENT_ID"),
    clientSecret: () => env("X_CLIENT_SECRET"),
    envNames: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
    clientAuth: "basic",
    pkce: true,
    scopeSeparator: " ",
    enrich: async (_app, creds) => {
      const settings: Record<string, string> = {}
      try {
        const res = await fetch("https://api.x.com/2/users/me", {
          headers: { Authorization: `Bearer ${creds["accessToken"]}` },
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        })
        const payload = (await res.json().catch(() => ({}))) as {
          data?: { username?: string; name?: string }
        }
        if (payload.data?.username) settings["accountLabel"] = `@${payload.data.username.replace(/^@/, "")}`
        else if (payload.data?.name) settings["accountLabel"] = payload.data.name
      } catch {
        // Optional handle lookup
      }
      return { credentials: { ...creds }, settings }
    },
  },
  linkedin: {
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    clientId: () => env("LINKEDIN_CLIENT_ID"),
    clientSecret: () => env("LINKEDIN_CLIENT_SECRET"),
    envNames: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    clientAuth: "body",
    scopeSeparator: " ",
    enrich: async (_app, creds) => {
      const settings: Record<string, string> = {}
      const nextCreds = { ...creds }
      try {
        const res = await fetch("https://api.linkedin.com/v2/userinfo", {
          headers: { Authorization: `Bearer ${creds["accessToken"]}` },
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        })
        const me = (await res.json().catch(() => ({}))) as {
          sub?: string
          name?: string
          given_name?: string
        }
        if (me.sub) nextCreds["personUrn"] = `urn:li:person:${me.sub}`
        if (me.name || me.given_name) settings["accountLabel"] = (me.name || me.given_name) ?? ""
      } catch {
        // Optional profile lookup
      }
      return { credentials: nextCreds, settings }
    },
  },
} satisfies Record<string, OAuthApp>

export type OAuthAppId = keyof typeof OAUTH_APPS

export function isOAuthApp(value: string): value is OAuthAppId {
  return Object.hasOwn(OAUTH_APPS, value)
}

export function missingOAuthEnv(app: OAuthAppId): string[] {
  const a: OAuthApp = OAUTH_APPS[app]
  return a.clientId() && a.clientSecret() ? [] : a.envNames
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  return { verifier, challenge }
}

export function authorizeUrl(
  app: OAuthAppId,
  options: { redirectUri: string; state: string; scopes: string[]; codeChallenge?: string },
): string {
  const a: OAuthApp = OAUTH_APPS[app]
  if (!a.authorizeUrl) throw new Error(`${app} authorizes through Auth.js`)
  const params = new URLSearchParams({
    [a.clientIdParam ?? "client_id"]: a.clientId(),
    response_type: "code",
    redirect_uri: options.redirectUri,
    scope: options.scopes.join(a.scopeSeparator),
    state: options.state,
    ...a.extraAuthorize,
  })
  if (options.codeChallenge) {
    params.set("code_challenge", options.codeChallenge)
    params.set("code_challenge_method", "S256")
  }
  return `${a.authorizeUrl}?${params}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  expires_at?: number
  scope?: string
  open_id?: string
}

async function tokenRequest(app: OAuthAppId, body: Record<string, string>): Promise<TokenResponse> {
  const a: OAuthApp = OAUTH_APPS[app]
  const form = new URLSearchParams(body)
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }
  if (a.clientAuth === "basic") headers["authorization"] = `Basic ${Buffer.from(`${a.clientId()}:${a.clientSecret()}`).toString("base64")}`
  else {
    form.set(a.clientIdParam ?? "client_id", a.clientId())
    form.set("client_secret", a.clientSecret())
  }
  const response = await fetch(a.tokenUrl, { method: "POST", headers, body: form, cache: "no-store", signal: AbortSignal.timeout(10_000) }).catch(() => null)
  if (!response) throw new DriverError(`${app} sign-in could not be reached.`, "upstream")
  if (!response.ok) throw new DriverError(`${app} refused the authorization (${response.status}). Reconnect it.`, "auth")
  const data = (await response.json()) as TokenResponse
  if (!data?.access_token) throw new DriverError(`${app} did not return an access token. Reconnect it.`, "auth")
  return data
}

export function credentialsFromTokens(tokens: TokenResponse, previous?: Record<string, string> | null): Record<string, string> {
  const expiresAt = tokens.expires_at ?? (tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : 0)
  return {
    ...(previous ?? {}),
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? previous?.["refreshToken"] ?? "",
    expiresAt: String(expiresAt),
    scope: tokens.scope ?? previous?.["scope"] ?? "",
    ...(tokens.open_id ? { openId: tokens.open_id } : {}),
  }
}

export async function exchangeCode(
  app: OAuthAppId,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
): Promise<Record<string, string>> {
  const payload: Record<string, string> = { grant_type: "authorization_code", code, redirect_uri: redirectUri }
  if (codeVerifier) payload["code_verifier"] = codeVerifier
  return credentialsFromTokens(await tokenRequest(app, payload))
}

export async function exchangeCodeAndEnrich(
  app: OAuthAppId,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
): Promise<OAuthEnrichResult> {
  const credentials = await exchangeCode(app, code, redirectUri, codeVerifier)
  const a: OAuthApp = OAUTH_APPS[app]
  if (a.enrich) return a.enrich(a, credentials)
  return { credentials, settings: {} }
}

/** A valid access token for the connection, refreshed and re-sealed when it is about to expire. */
export async function accessToken(ctx: DriverContext, app: OAuthAppId): Promise<string> {
  const creds = ctx.credentials
  if (!creds?.["accessToken"]) throw new DriverError("Connect this service again.", "auth")
  const expiresAt = Number(creds["expiresAt"] ?? 0)
  if (!expiresAt || expiresAt - 60 > ctx.now.getTime() / 1000) return creds["accessToken"]
  if (!creds["refreshToken"]) throw new DriverError("Access expired. Sign in to this account again.", "auth")
  if (missingOAuthEnv(app).length) throw new DriverError(`Server is missing ${missingOAuthEnv(app).join(", ")}.`, "config")
  const next = credentialsFromTokens(await tokenRequest(app, { grant_type: "refresh_token", refresh_token: creds["refreshToken"] }), creds)
  await ctx.saveCredentials(next)
  ctx.credentials = next
  return next["accessToken"]!
}
