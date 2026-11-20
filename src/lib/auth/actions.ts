"use server"

import { AuthError } from "next-auth"
import { unstable_rethrow } from "next/navigation"
import { redirect } from "next/navigation"
import { signIn, signOut } from "@/auth"
import { safeCallback, signupErrorPath } from "@/lib/auth/callback"
import { missingEmailConfig, missingGoogleConfig } from "@/lib/auth/requirements"
import { isExistingUser, signupsOpen } from "@/lib/auth/signups"
import { ensureAuthSchema } from "@/lib/db/client"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function logAuthError(label: string, error: unknown) {
  const raw = error instanceof Error ? error.message : String(error)
  const safe = raw.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-database-url]")
  console.error(label, safe)
}

async function prepareDatabase(callbackUrl: string) {
  try {
    await ensureAuthSchema()
  } catch (error) {
    unstable_rethrow(error)
    logAuthError("Auth schema setup failed", error)
    redirect(signupErrorPath("Database", callbackUrl))
  }
}

async function startProvider(
  provider: "google" | "resend",
  callbackUrl: string,
  extra?: { email: string },
) {
  try {
    await signIn(provider, { ...extra, redirectTo: callbackUrl })
  } catch (error) {
    unstable_rethrow(error)
    if (error instanceof AuthError) {
      logAuthError(`Sign-in failed (${error.type})`, error)
      redirect(signupErrorPath(error.type, callbackUrl))
    }
    throw error
  }
}

export async function signInWithGoogle(formData: FormData) {
  const callbackUrl = safeCallback(String(formData.get("callbackUrl") ?? ""))
  const missing = missingGoogleConfig()
  if (missing.length > 0) {
    redirect(`${signupErrorPath("MissingConfig", callbackUrl)}&need=${missing.join(",")}`)
  }
  await prepareDatabase(callbackUrl)
  await startProvider("google", callbackUrl)
}

export async function signInWithEmail(formData: FormData) {
  const callbackUrl = safeCallback(String(formData.get("callbackUrl") ?? ""))
  const email = String(formData.get("email") ?? "").trim()
  if (!email) redirect(signupErrorPath("EmailRequired", callbackUrl))
  if (!EMAIL.test(email)) redirect(signupErrorPath("EmailInvalid", callbackUrl))
  const missing = missingEmailConfig()
  if (missing.length > 0) {
    redirect(`${signupErrorPath("MissingConfig", callbackUrl)}&need=${missing.join(",")}`)
  }
  await prepareDatabase(callbackUrl)
  if (!signupsOpen() && !(await isExistingUser(email))) {
    redirect(signupErrorPath("SignupsClosed", callbackUrl))
  }
  await startProvider("resend", callbackUrl, { email })
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" })
}
