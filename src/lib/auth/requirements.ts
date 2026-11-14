import "server-only"

/** Dynamic lookup so Next.js does not inline these at build time. */
function env(name: string) {
  return process.env[name]?.trim() ?? ""
}

export function authSecret() {
  return env("AUTH_SECRET") || env("NEXTAUTH_SECRET")
}

export function googleClientId() {
  return env("AUTH_GOOGLE_ID") || env("GOOGLE_CLIENT_ID")
}

export function googleClientSecret() {
  return env("AUTH_GOOGLE_SECRET") || env("GOOGLE_CLIENT_SECRET")
}

export function resendKey() {
  return env("AUTH_RESEND_KEY")
}

export function emailFrom() {
  return env("EMAIL_FROM")
}

export function missingSharedConfig() {
  const missing: string[] = []
  if (!authSecret()) missing.push("AUTH_SECRET")
  if (!env("DATABASE_URL")) missing.push("DATABASE_URL")
  return missing
}

export function missingGoogleConfig() {
  const missing = missingSharedConfig()
  if (!googleClientId()) missing.push("AUTH_GOOGLE_ID")
  if (!googleClientSecret()) missing.push("AUTH_GOOGLE_SECRET")
  return missing
}

export function missingEmailConfig() {
  const missing = missingSharedConfig()
  if (!resendKey()) missing.push("AUTH_RESEND_KEY")
  if (!emailFrom()) missing.push("EMAIL_FROM")
  return missing
}
