import "server-only"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import type { Adapter } from "@auth/core/adapters"
import { ensureAuthSchema, getDb } from "@/lib/db/client"

type AdapterMethod = keyof {
  [K in keyof Adapter as Adapter[K] extends ((...args: never[]) => unknown) | undefined ? K : never]: true
}

let real: Adapter | null = null

async function readyAdapter(): Promise<Adapter> {
  if (!process.env["DATABASE_URL"]?.trim()) {
    throw new Error("DATABASE_URL is not set.")
  }
  await ensureAuthSchema()
  real ??= DrizzleAdapter(getDb())
  return real
}

function defer<K extends AdapterMethod>(name: K): NonNullable<Adapter[K]> {
  const method = async (...args: unknown[]) => {
    const adapter = await readyAdapter()
    const implementation = adapter[name]
    if (typeof implementation !== "function") {
      throw new Error(`Auth adapter cannot run ${name}.`)
    }
    return (implementation as (...received: unknown[]) => unknown).apply(adapter, args)
  }
  return method as NonNullable<Adapter[K]>
}

/**
 * Database adapter that connects only when a method runs, so `next build`
 * does not need DATABASE_URL. The first call also creates the Auth.js tables.
 */
export function createAuthAdapter(): Adapter {
  return {
    createUser: defer("createUser"),
    getUser: defer("getUser"),
    getUserByEmail: defer("getUserByEmail"),
    getUserByAccount: defer("getUserByAccount"),
    updateUser: defer("updateUser"),
    deleteUser: defer("deleteUser"),
    linkAccount: defer("linkAccount"),
    unlinkAccount: defer("unlinkAccount"),
    getAccount: defer("getAccount"),
    createSession: defer("createSession"),
    getSessionAndUser: defer("getSessionAndUser"),
    updateSession: defer("updateSession"),
    deleteSession: defer("deleteSession"),
    createVerificationToken: defer("createVerificationToken"),
    useVerificationToken: defer("useVerificationToken"),
  }
}
