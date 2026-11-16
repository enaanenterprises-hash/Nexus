import { NextResponse } from "next/server"
import { auth } from "@/auth"
import {
  SETUP_DONE_COOKIE,
  SETUP_RESUME_COOKIE,
  markUserSetupCompleted,
  resetUserSetupCompleted,
} from "@/lib/setup/status"

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
}

export async function POST() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    await markUserSetupCompleted(userId)
  } catch (error) {
    console.error("[setup] failed persisting completion", error instanceof Error ? error.message : error)
  }
  const response = NextResponse.json({ ok: true, completed: true })
  response.cookies.set(SETUP_DONE_COOKIE, userId, COOKIE_OPTIONS)
  response.cookies.delete(SETUP_RESUME_COOKIE)
  return response
}

export async function DELETE() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    await resetUserSetupCompleted(userId)
  } catch (error) {
    console.error("[setup] failed resetting completion", error instanceof Error ? error.message : error)
  }
  const response = NextResponse.json({ ok: true, completed: false })
  response.cookies.delete(SETUP_DONE_COOKIE)
  response.cookies.delete(SETUP_RESUME_COOKIE)
  return response
}
