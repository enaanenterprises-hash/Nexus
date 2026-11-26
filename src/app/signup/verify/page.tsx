import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { AuthShell } from "@/components/landing/AuthShell"
import { readViewer } from "@/lib/auth/viewer"

export const metadata: Metadata = {
  title: "Check your email — Nexus",
}

async function VerifyBody() {
  const viewer = await readViewer()
  if (viewer) redirect("/dashboard")

  return (
    <div className="landing-enter w-full max-w-sm text-center">
      <h1 className="landing-title">Check your email</h1>
      <p className="font-literary mt-3 text-[16px] leading-[1.6] text-[color:var(--land-muted)]">
        We sent a sign-in link. It expires in 24 hours. Open it on this device to reach your
        dashboard.
      </p>
      <Link href="/signup" className="landing-signup mt-8">
        Use a different email
      </Link>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <AuthShell>
      <Suspense fallback={<p className="text-[15px] text-[color:var(--land-muted)]">Loading…</p>}>
        <VerifyBody />
      </Suspense>
    </AuthShell>
  )
}
