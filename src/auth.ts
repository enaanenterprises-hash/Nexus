import "server-only"
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Resend from "next-auth/providers/resend"
import { createAuthAdapter } from "@/lib/auth/adapter"
import {
  authSecret,
  emailFrom,
  googleClientId,
  googleClientSecret,
  resendKey,
} from "@/lib/auth/requirements"

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: createAuthAdapter(),
  session: { strategy: "database" },
  trustHost: true,
  secret: authSecret() || undefined,
  callbacks: {
    // The default callback drops the id; per-user data (Research) needs it.
    session: ({ session, user }) => ({ ...session, user: { ...session.user, id: user.id } }),
  },
  pages: {
    signIn: "/signup",
    verifyRequest: "/signup/verify",
    error: "/signup",
  },
  providers: [
    Google({
      clientId: googleClientId() || undefined,
      clientSecret: googleClientSecret() || undefined,
      // Both Google and the magic link prove the same email address.
      allowDangerousEmailAccountLinking: true,
    }),
    Resend({
      apiKey: resendKey() || undefined,
      from: emailFrom() || undefined,
      async sendVerificationRequest({ identifier, url, provider }) {
        const apiKey = provider.apiKey
        const from = provider.from
        if (!apiKey || !from || from.includes("authjs.dev")) {
          throw new Error("Email sign-in is not configured. Set AUTH_RESEND_KEY and EMAIL_FROM.")
        }
        const safeUrl = escapeHtml(url)
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: identifier,
            subject: "Sign in to Nexus",
            text: `Sign in to Nexus\n\n${url}\n\nThis link expires in 24 hours. If you did not ask for it, you can ignore this email.`,
            html: `<p>Sign in to Nexus.</p><p><a href="${safeUrl}">Finish signing in</a></p><p>This link expires in 24 hours. If you did not ask for it, you can ignore this email.</p>`,
          }),
        })
        if (!response.ok) {
          const detail = await response.text()
          throw new Error(`Resend rejected the sign-in email (${response.status}). ${detail}`)
        }
      },
    }),
  ],
}))
