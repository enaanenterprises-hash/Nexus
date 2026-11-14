import { Suspense } from "react"
import { redirect } from "next/navigation"
import { Dashboard } from "@/components/dashboard/Dashboard"
import { NexusLogo } from "@/components/landing/NexusLogo"
import { readViewer } from "@/lib/auth/viewer"

function DashboardFallback() {
  return (
    <div className="dash flex min-h-[100svh] flex-1 flex-col">
      <header className="flex items-center px-6 pt-6 sm:px-10">
        <NexusLogo className="h-[13px] w-auto sm:h-[15px]" />
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
