import "server-only"
import { cookies } from "next/headers"
import { auth } from "@/auth"
import { databaseUrl, ensureCommandSchema, getSql } from "@/lib/db/client"

export const SETUP_DONE_COOKIE = "nexus_setup_done"
export const SETUP_RESUME_COOKIE = "nexus_setup_resume"

export type InitialSetupState = {
  done: boolean
  resumeStep: "name" | "theme" | "apps" | "widgets" | "nodes" | null
}

/** Reads whether the signed-in user completed onboarding and whether OAuth interrupted setup. */
export async function readInitialSetupState(): Promise<InitialSetupState> {
  const cookieStore = await cookies()
  const rawResume = cookieStore.get(SETUP_RESUME_COOKIE)?.value
  const resumeStep =
    rawResume === "name" ||
    rawResume === "theme" ||
    rawResume === "apps" ||
    rawResume === "widgets" ||
    rawResume === "nodes"
      ? rawResume
      : null

  if (!process.env["AUTH_SECRET"]?.trim() && !process.env["NEXTAUTH_SECRET"]?.trim()) {
    return { done: false, resumeStep }
  }
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { done: false, resumeStep }

  if (resumeStep) {
    return { done: false, resumeStep }
  }
  if (cookieStore.get(SETUP_DONE_COOKIE)?.value === userId) {
    return { done: true, resumeStep: null }
  }
  if (!databaseUrl()) return { done: false, resumeStep: null }
  try {
    await ensureCommandSchema()
    const sql = getSql()
    const [row] = await sql`SELECT 1 FROM "nexus_user_setup" WHERE "userId" = ${userId} LIMIT 1`
    return { done: Boolean(row), resumeStep: null }
  } catch {
    return { done: false, resumeStep: null }
  }
}

export async function markUserSetupCompleted(userId: string) {
  if (!databaseUrl()) return
  await ensureCommandSchema()
  const sql = getSql()
  await sql`
    INSERT INTO "nexus_user_setup" ("userId")
    VALUES (${userId})
    ON CONFLICT ("userId") DO UPDATE SET "completedAt" = now()`
}

export async function resetUserSetupCompleted(userId: string) {
  if (!databaseUrl()) return
  await ensureCommandSchema()
  const sql = getSql()
  await sql`DELETE FROM "nexus_user_setup" WHERE "userId" = ${userId}`
}
