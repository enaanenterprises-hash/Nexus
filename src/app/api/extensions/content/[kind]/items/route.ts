import { contentAccessFor, respond } from "@/lib/content/access"

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const ctx = await contentAccessFor(request, (await params).kind)
  if ("response" in ctx) return ctx.response
  const search = new URL(request.url).searchParams
  const query = {
    collectionId: search.get("collectionId")?.trim() || undefined,
    tag: search.get("tag")?.trim() || undefined,
  }
  return respond(async () => ({ items: await ctx.access.list(query) }))
}
