import { contentAccessFor, respond } from "@/lib/content/access"

export async function GET(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params
  const ctx = await contentAccessFor(request, kind)
  if ("response" in ctx) return ctx.response
  return respond(async () => ({ item: await ctx.access.get(id) }))
}
