import { contentAccessFor, respond } from "@/lib/content/access"

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const ctx = await contentAccessFor(request, (await params).kind)
  if ("response" in ctx) return ctx.response
  return respond(async () => ({ collections: await ctx.access.collections() }))
}
