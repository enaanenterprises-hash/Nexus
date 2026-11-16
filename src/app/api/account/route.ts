import { NextResponse } from "next/server"
import { auth, signOut } from "@/auth"
import { databaseUrl, ensureAuthSchema, getSql } from "@/lib/db/client"
import { SETUP_DONE_COOKIE, SETUP_RESUME_COOKIE } from "@/lib/setup/status"

const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  SETUP_DONE_COOKIE,
  SETUP_RESUME_COOKIE,
  "command_google_pending",
  "command_oauth_state",
] as const

export async function DELETE() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: "Sign in to delete your account." }, { status: 401 })
  }
  if (!databaseUrl()) {
    return NextResponse.json({ error: "Account storage is not configured." }, { status: 503 })
  }

  try {
    await ensureAuthSchema()
    const sql = getSql()
    await sql`DELETE FROM "user" WHERE "id" = ${userId}`
  } catch (error) {
    console.error("[account] delete failed", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Could not delete your account right now." }, { status: 500 })
  }

  try {
    await signOut({ redirect: false })
  } catch {
    // Database session row is already cascade-deleted; cookie expiration below clears client state.
  }

  const response = NextResponse.json({ ok: true, deleted: true })
  for (const name of SESSION_COOKIE_NAMES) {
    response.cookies.delete(name)
  }
  return response
}
