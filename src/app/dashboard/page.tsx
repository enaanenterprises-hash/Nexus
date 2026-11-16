import { Suspense } from "react"
import { redirect } from "next/navigation"
import { Dashboard } from "@/components/dashboard/Dashboard"
import { NexusMark } from "@/components/landing/NexusLogo"
import { readViewer } from "@/lib/auth/viewer"

function DashboardFallback() {
  return (
    <div className="dash flex min-h-[100svh] flex-1 flex-col">
      <header className="flex h-14 w-[52px] items-center justify-center">
        <NexusMark className="h-5 w-auto" />
      </header>
    </div>
  )
}

async function DashboardGate() {
  const viewer = await readViewer()
  if (!viewer) redirect("/signup?callbackUrl=/dashboard")
  return <Dashboard viewer={viewer} />
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardGate />
    </Suspense>
  )
}
