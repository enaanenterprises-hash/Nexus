import type { Metadata } from "next"
import { Suspense } from "react"
import { AuthShell } from "@/components/landing/AuthShell"
import { SignupForm } from "@/components/landing/SignupForm"

export const metadata: Metadata = {
  title: "Sign up — Nexus",
  description: "Sign in to Nexus with Google or an email magic link.",
}

export default function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  return (
    <AuthShell>
      <Suspense fallback={<p className="text-[15px] text-[color:var(--land-muted)]">Loading…</p>}>
        <SignupForm searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  )
}
