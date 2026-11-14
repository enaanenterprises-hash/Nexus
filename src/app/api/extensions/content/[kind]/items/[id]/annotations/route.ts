import { contentAccessFor, respond } from "@/lib/content/access"
import { readJson } from "@/lib/research/route-helpers"

export async function PUT(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params
  const ctx = await contentAccessFor(request, kind)
  if ("response" in ctx) return ctx.response
  const body = await readJson(request)
  return respond(async () => ({ item: await ctx.access.annotate(id, body) }))
}
