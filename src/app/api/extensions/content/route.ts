import { listProviders } from "@/lib/content/access"
import { json, requireUser } from "@/lib/research/route-helpers"

/** Content kinds this server can serve, with versions and actions. */
export async function GET() {
  const user = await requireUser()
  if ("response" in user) return user.response
  return json({ kinds: listProviders() })
}
