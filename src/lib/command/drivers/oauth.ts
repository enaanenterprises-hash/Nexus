import "server-only"
import { DriverError, type DriverContext } from "./types"

const env = (...names: string[]) => names.map((n) => process.env[n]?.trim()).find(Boolean) ?? ""

interface OAuthApp {
  /** Absent for Google, which authorizes through Auth.js (incremental scopes on the sign-in client). */
  authorizeUrl?: string
  tokenUrl: string
  clientId: () => string
  clientSecret: () => string
  envNames: string[]
  clientAuth: "body" | "basic"
  scopeSeparator: string
  extraAuthorize?: Record<string, string>
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
} satisfies Record<string, OAuthApp>

export type OAuthAppId = keyof typeof OAUTH_APPS

export function isOAuthApp(value: string): value is OAuthAppId {
  return Object.hasOwn(OAUTH_APPS, value)
}

export function missingOAuthEnv(app: OAuthAppId): string[] {
  const a: OAuthApp = OAUTH_APPS[app]
  return a.clientId() && a.clientSecret() ? [] : a.envNames
}

export function authorizeUrl(app: OAuthAppId, options: { redirectUri: string; state: string; scopes: string[] }): string {
  const a: OAuthApp = OAUTH_APPS[app]
  if (!a.authorizeUrl) throw new Error(`${app} authorizes through Auth.js`)
  const params = new URLSearchParams({
    client_id: a.clientId(),
    response_type: "code",
    redirect_uri: options.redirectUri,
    scope: options.scopes.join(a.scopeSeparator),
    state: options.state,
    ...a.extraAuthorize,
  })
  return `${a.authorizeUrl}?${params}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  expires_at?: number
  scope?: string
}

async function tokenRequest(app: OAuthAppId, body: Record<string, string>): Promise<TokenResponse> {
  const a: OAuthApp = OAUTH_APPS[app]
  const form = new URLSearchParams(body)
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }
  if (a.clientAuth === "basic") headers["authorization"] = `Basic ${Buffer.from(`${a.clientId()}:${a.clientSecret()}`).toString("base64")}`
  else {
    form.set("client_id", a.clientId())
    form.set("client_secret", a.clientSecret())
  }
  const response = await fetch(a.tokenUrl, { method: "POST", headers, body: form, cache: "no-store", signal: AbortSignal.timeout(10_000) }).catch(() => null)
  if (!response) throw new DriverError(`${app} sign-in could not be reached.`, "upstream")
  if (!response.ok) throw new DriverError(`${app} refused the authorization (${response.status}). Reconnect it.`, "auth")
  return (await response.json()) as TokenResponse
}

export function credentialsFromTokens(tokens: TokenResponse, previous?: Record<string, string> | null): Record<string, string> {
  const expiresAt = tokens.expires_at ?? (tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : 0)
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? previous?.["refreshToken"] ?? "",
    expiresAt: String(expiresAt),
    scope: tokens.scope ?? previous?.["scope"] ?? "",
  }
}

export async function exchangeCode(app: OAuthAppId, code: string, redirectUri: string): Promise<Record<string, string>> {
  return credentialsFromTokens(await tokenRequest(app, { grant_type: "authorization_code", code, redirect_uri: redirectUri }))
}

/** A valid access token for the connection, refreshed and re-sealed when it is about to expire. */
export async function accessToken(ctx: DriverContext, app: OAuthAppId): Promise<string> {
  const creds = ctx.credentials
  if (!creds?.["accessToken"]) throw new DriverError("Connect this service again.", "auth")
  const expiresAt = Number(creds["expiresAt"] ?? 0)
  if (!expiresAt || expiresAt - 60 > ctx.now.getTime() / 1000) return creds["accessToken"]
  if (!creds["refreshToken"]) throw new DriverError("Access expired. Connect this service again.", "auth")
  if (missingOAuthEnv(app).length) throw new DriverError(`Server is missing ${missingOAuthEnv(app).join(", ")}.`, "config")
  const next = credentialsFromTokens(await tokenRequest(app, { grant_type: "refresh_token", refresh_token: creds["refreshToken"] }), creds)
  await ctx.saveCredentials(next)
  ctx.credentials = next
  return next["accessToken"]!
}
