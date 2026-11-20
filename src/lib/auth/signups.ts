import "server-only"
import { databaseUrl, getSql } from "@/lib/db/client"

/**
 * New account creation is closed unless SIGNUPS_OPEN=true.
 * Existing users can still sign in.
 */
export function signupsOpen() {
  return process.env["SIGNUPS_OPEN"]?.trim().toLowerCase() === "true"
}

export async function isExistingUser(email: string | null | undefined) {
  const value = email?.trim().toLowerCase()
  if (!value || !databaseUrl()) return false
  const rows = await getSql()`SELECT 1 FROM "user" WHERE lower("email") = ${value} LIMIT 1`.catch(() => [])
  return rows.length > 0
}

/** Comma-separated ADMIN_EMAILS may view the waitlist. */
export function isAdminEmail(email: string | null | undefined) {
  const value = email?.trim().toLowerCase()
  if (!value) return false
  return (process.env["ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(value)
}
