import { databaseUrl } from "@/lib/db/client"
import { json, requireUser } from "@/lib/research/route-helpers"
import { activeSearchProvider } from "@/lib/research/search"
import type { ResearchStatus } from "@/lib/research/types"

export async function GET() {
  const user = await requireUser()
  if ("response" in user) return user.response
  const provider = activeSearchProvider()
  return json<ResearchStatus>({
    search: { configured: Boolean(provider), provider: provider?.label ?? null },
    library: { configured: Boolean(databaseUrl()) },
  })
}
