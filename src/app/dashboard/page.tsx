import { Suspense } from "react"
import { redirect } from "next/navigation"
import { Dashboard } from "@/components/dashboard/Dashboard"
import { NexusMark } from "@/components/landing/NexusLogo"
import { firstParam } from "@/lib/auth/callback"
import { readViewer } from "@/lib/auth/viewer"
import { getConnector } from "@/lib/connectors/catalog"
import { readInitialSetupState } from "@/lib/setup/status"

const OAUTH_ERRORS: Record<string, string> = {
  config: "That service isn't set up on the server yet.",
  denied: "Access was not granted.",
  state: "The sign-in expired. Try connecting again.",
  exchange: "The service didn't accept the sign-in. Try again.",
  unknown: "Unknown service.",
}

function DashboardFallback() {
  return (
    <div className="dash flex min-h-[100svh] flex-1 flex-col">
      <header className="flex h-16 w-[76px] items-center justify-center">
        <NexusMark className="h-7 w-auto" />
      </header>
    </div>
  )
}

async function DashboardGate({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [viewer, setup, params] = await Promise.all([
    readViewer(),
    readInitialSetupState(),
    searchParams,
  ])
  if (!viewer) redirect("/signup?callbackUrl=/dashboard")

  const outcome = firstParam(params.command)
  let initialOauthNotice: { ok: boolean; text: string } | null = null
  if (outcome && (!setup.done || setup.resumeStep)) {
    const ids = (firstParam(params.service) ?? "").split(",").filter(Boolean)
    const name = ids.length ? ids.map((id) => getConnector(id)?.name ?? id).join(" and ") : "The service"
    const reason = firstParam(params.reason) ?? ""
    initialOauthNotice = {
      ok: outcome === "connected",
      text:
        outcome === "connected"
          ? `${name} is connected.`
          : `${name} couldn't connect. ${OAUTH_ERRORS[reason] ?? ""}`.trim(),
    }
  }

  return (
    <Dashboard
      viewer={viewer}
      initialSetupDone={setup.done}
      initialSetupStep={setup.resumeStep ?? (initialOauthNotice ? "apps" : null)}
      initialOauthNotice={initialOauthNotice}
    />
  )
}

export default function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardGate searchParams={searchParams} />
    </Suspense>
  )
}
