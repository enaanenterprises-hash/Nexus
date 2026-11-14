"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { signIn } from "@/auth"
import { missingOAuthEnv } from "./drivers/oauth"
import { GOOGLE_CONNECTORS, GOOGLE_PENDING_COOKIE } from "./google-grant"

/**
 * Incremental authorization: re-runs Google sign-in asking only for the extra
 * scopes these services need (one consent screen for several services).
 */
export async function connectGoogleServices(connectorIds: string[]) {
  const manifests = GOOGLE_CONNECTORS.filter((m) => connectorIds.includes(m.id))
  if (manifests.length === 0) redirect("/dashboard?command=error&reason=unknown")
  const ids = manifests.map((m) => m.id).join(",")
  if (missingOAuthEnv("google").length) redirect(`/dashboard?command=error&service=${ids}&reason=config`)
  const scopes = manifests.flatMap((m) => (m.auth.type === "oauth" ? m.auth.scopes : []))
  ;(await cookies()).set(GOOGLE_PENDING_COOKIE, ids, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" })
  await signIn(
    "google",
    { redirectTo: `/dashboard?command=connected&service=${ids}` },
    {
      scope: [...new Set(["openid", "email", "profile", ...scopes])].join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    },
  )
}

export async function connectGoogleService(connectorId: string) {
  await connectGoogleServices([connectorId])
}
