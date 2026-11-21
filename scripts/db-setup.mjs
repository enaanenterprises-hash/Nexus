/**
 * Create Auth.js, Research and Command tables in DATABASE_URL.
 * Run: npm run db:setup
 */
import postgres from "postgres"
import {
  AUTH_SCHEMA_STATEMENTS,
  CINEMA_SCHEMA_STATEMENTS,
  COMMAND_SCHEMA_STATEMENTS,
  RESEARCH_SCHEMA_STATEMENTS,
  STUDIO_SCHEMA_STATEMENTS,
  USER_STATE_SCHEMA_STATEMENTS,
  WAITLIST_SCHEMA_STATEMENTS,
} from "../src/lib/db/statements.ts"

const url = process.env.DATABASE_URL?.trim()
if (!url) {
  console.error("DATABASE_URL is not set.")
  process.exit(1)
}

const ssl = /localhost|127\.0\.0\.1/.test(url) ? false : "require"
const sql = postgres(url, { max: 1, prepare: false, ssl, connect_timeout: 10 })

try {
  for (const statement of [
    ...AUTH_SCHEMA_STATEMENTS,
    ...RESEARCH_SCHEMA_STATEMENTS,
    ...STUDIO_SCHEMA_STATEMENTS,
    ...CINEMA_SCHEMA_STATEMENTS,
    ...COMMAND_SCHEMA_STATEMENTS,
    ...USER_STATE_SCHEMA_STATEMENTS,
    ...WAITLIST_SCHEMA_STATEMENTS,
  ]) {
    await sql.unsafe(statement)
  }
  console.log("Auth, Research, Studio, Cinema, Command, User State and Waitlist tables are ready.")
} catch (error) {
  const raw = error instanceof Error ? error.message : String(error)
  console.error(raw.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-database-url]"))
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
