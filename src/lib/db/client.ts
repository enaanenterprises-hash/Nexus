import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import {
  AUTH_SCHEMA_STATEMENTS,
  COMMAND_SCHEMA_STATEMENTS,
  RESEARCH_SCHEMA_STATEMENTS,
  STUDIO_SCHEMA_STATEMENTS,
  WAITLIST_SCHEMA_STATEMENTS,
} from "./statements"

type Sql = ReturnType<typeof postgres>
type Database = ReturnType<typeof drizzle>

let sql: Sql | undefined
let database: Database | undefined
let schemaReady: Promise<void> | null = null
let researchReady: Promise<void> | null = null
let studioReady: Promise<void> | null = null
let commandReady: Promise<void> | null = null
let waitlistReady: Promise<void> | null = null

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
    // CREATE ... IF NOT EXISTS emits a notice on every boot.
    onnotice: () => {},
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

/** Creates the Research tables (after the Auth.js ones they reference). */
export function ensureResearchSchema() {
  researchReady ??= (async () => {
    await ensureAuthSchema()
    const connection = getSql()
    for (const statement of RESEARCH_SCHEMA_STATEMENTS) {
      await connection.unsafe(statement)
    }
  })().catch((error: unknown) => {
    researchReady = null
    throw error
  })
  return researchReady
}

/** Creates the Command tables (after the Auth.js ones they reference). */
export function ensureCommandSchema() {
  commandReady ??= (async () => {
    await ensureAuthSchema()
    const connection = getSql()
    for (const statement of COMMAND_SCHEMA_STATEMENTS) {
      await connection.unsafe(statement)
    }
  })().catch((error: unknown) => {
    commandReady = null
    throw error
  })
  return commandReady
}

/** Creates the waitlist table if it is missing. */
export function ensureWaitlistSchema() {
  if (!databaseUrl()) return Promise.resolve()
  waitlistReady ??= (async () => {
    const connection = getSql()
    for (const statement of WAITLIST_SCHEMA_STATEMENTS) {
      await connection.unsafe(statement)
    }
  })().catch((error: unknown) => {
    waitlistReady = null
    throw error
  })
  return waitlistReady
}

/** Creates the Recording Studio tables (after the Auth.js tables they reference). */
export function ensureStudioSchema() {
  studioReady ??= (async () => {
    await ensureAuthSchema()
    const connection = getSql()
    for (const statement of STUDIO_SCHEMA_STATEMENTS) {
      await connection.unsafe(statement)
    }
  })().catch((error: unknown) => {
    studioReady = null
    throw error
  })
  return studioReady
}
