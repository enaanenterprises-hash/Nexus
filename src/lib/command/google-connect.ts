"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { signIn } from "@/auth"
import { missingOAuthEnv } from "./drivers/oauth"
import { GOOGLE_CONNECTORS, GOOGLE_PENDING_COOKIE } from "./google-grant"

/** Incremental authorization: re-runs Google sign-in asking only for the extra scopes this service needs. */
export async function connectGoogleService(connectorId: string) {
  const manifest = GOOGLE_CONNECTORS.find((m) => m.id === connectorId)
  if (!manifest || manifest.auth.type !== "oauth") redirect("/dashboard?command=error&reason=unknown")
  if (missingOAuthEnv("google").length) redirect(`/dashboard?command=error&service=${connectorId}&reason=config`)
  ;(await cookies()).set(GOOGLE_PENDING_COOKIE, connectorId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" })
  await signIn(
    "google",
    { redirectTo: `/dashboard?command=connected&service=${connectorId}` },
    {
      scope: ["openid", "email", "profile", ...manifest.auth.scopes].join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    },
  )
}
