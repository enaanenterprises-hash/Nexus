import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { AUTH_SCHEMA_STATEMENTS } from "./statements"

type Sql = ReturnType<typeof postgres>
type Database = ReturnType<typeof drizzle>

let sql: Sql | undefined
let database: Database | undefined
let schemaReady: Promise<void> | null = null

export function databaseUrl() {
  const url = process.env["DATABASE_URL"]?.trim()
  return url ? url : undefined
}

function sslFor(url: string): false | "require" {
  return /localhost|127\.0\.0\.1/.test(url) ? false : "require"
}

export function getSql() {
  const url = databaseUrl()
  if (!url) throw new Error("DATABASE_URL is not set.")
  sql ??= postgres(url, {
    max: 1,
    prepare: false,
    ssl: sslFor(url),
    idle_timeout: 20,
    connect_timeout: 10,
  })
  return sql
}

export function getDb() {
  database ??= drizzle(getSql())
  return database
}

/** Creates Auth.js tables if they are missing. Safe to call more than once. */
export function ensureAuthSchema() {
  if (!databaseUrl()) return Promise.reject(new Error("DATABASE_URL is not set."))
  schemaReady ??= (async () => {
    const connection = getSql()
    for (const statement of AUTH_SCHEMA_STATEMENTS) {
      await connection.unsafe(statement)
    }
  })().catch((error: unknown) => {
    schemaReady = null
    throw error
  })
  return schemaReady
}
