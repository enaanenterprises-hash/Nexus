import "server-only"
import { auth } from "@/auth"
import { databaseUrl } from "@/lib/db/client"

export function jsonError(status: number, error: string, code?: string) {
  return Response.json({ error, code }, { status, headers: { "cache-control": "no-store" } })
}

export function json<T>(data: T, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "cache-control": "no-store", ...init?.headers } })
}

/** Signed-in user id, or a ready-to-return 401. */
export async function requireUser(): Promise<{ userId: string } | { response: Response }> {
  if (!process.env["AUTH_SECRET"]?.trim() && !process.env["NEXTAUTH_SECRET"]?.trim()) {
    return { response: jsonError(401, "Sign in to use Research.", "unauthorized") }
  }
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { response: jsonError(401, "Sign in to use Research.", "unauthorized") }
  return { userId }
}

/** Library routes need Postgres; reading and searching do not. */
export async function requireLibraryUser(): Promise<{ userId: string } | { response: Response }> {
  const user = await requireUser()
  if ("response" in user) return user
  if (!databaseUrl()) return { response: jsonError(503, "Saving needs DATABASE_URL.", "no_database") }
  return user
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function str(value: unknown, max = 2000): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null
}

export function libraryFailure(error: unknown) {
  console.error("[research] library error", error instanceof Error ? error.message : error)
  return jsonError(500, "Your research library could not be reached.", "db_error")
}
