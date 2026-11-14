import "server-only"
import { connection } from "next/server"
import { auth } from "@/auth"
import type { Viewer } from "./types"

export type { Viewer }

export async function readViewer(): Promise<Viewer | null> {
  // Always wait for the request. A build without AUTH_SECRET must not freeze
  // the signed-out redirect into a static page.
  await connection()
  if (!process.env["AUTH_SECRET"]?.trim() && !process.env["NEXTAUTH_SECRET"]?.trim()) {
    return null
  }
  const session = await auth()
  const user = session?.user
  if (!user) return null
  return {
    name: user.name ?? null,
    email: user.email ?? null,
  }
}
