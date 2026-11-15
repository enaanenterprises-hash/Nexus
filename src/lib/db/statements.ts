/**
 * Auth.js tables for `@auth/drizzle-adapter` 1.11.3 (Postgres defaults).
 * Quoted camelCase identifiers match the column names Drizzle sends.
 * Run via `npm run db:setup`, and again automatically on the first sign-in.
 */
export const AUTH_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "user" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text,
    "email" text,
    "emailVerified" timestamp,
    "image" text,
    CONSTRAINT "user_email_unique" UNIQUE ("email")
  )`,
  `CREATE TABLE IF NOT EXISTS "account" (
    "userId" text NOT NULL,
    "type" text NOT NULL,
    "provider" text NOT NULL,
    "providerAccountId" text NOT NULL,
    "refresh_token" text,
    "access_token" text,
    "expires_at" integer,
    "token_type" text,
    "scope" text,
    "id_token" text,
    "session_state" text,
    CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY ("provider", "providerAccountId"),
    CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "session" (
    "sessionToken" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL,
    "expires" timestamp NOT NULL,
    CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "verificationToken" (
    "identifier" text NOT NULL,
    "token" text NOT NULL,
    "expires" timestamp NOT NULL,
    CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY ("identifier", "token")
  )`,
] as const

/**
 * Research node storage, owned per user next to the Auth.js tables.
 * `summary`, `notes` and `lean` stay NULL until an analyzer fills them
 * (see `src/lib/research/analyzers.ts`).
 */
export const RESEARCH_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "research_collection" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "description" text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "research_collection_userId_idx" ON "research_collection" ("userId")`,
  `CREATE TABLE IF NOT EXISTS "research_source" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "collectionId" text NOT NULL REFERENCES "research_collection" ("id") ON DELETE CASCADE,
    "url" text NOT NULL,
    "canonicalUrl" text,
    "title" text NOT NULL,
    "siteName" text,
    "author" text,
    "publishedAt" text,
    "excerpt" text,
    "lang" text,
    "imageUrl" text,
    "contentHtml" text NOT NULL,
    "textContent" text NOT NULL,
    "wordCount" integer NOT NULL DEFAULT 0,
    "tags" text[] NOT NULL DEFAULT '{}',
    "summary" jsonb,
    "notes" jsonb,
    "lean" jsonb,
    "fetchedAt" timestamptz NOT NULL,
    "savedAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "research_source_collection_url_unique" UNIQUE ("collectionId", "url")
  )`,
  `CREATE INDEX IF NOT EXISTS "research_source_userId_idx" ON "research_source" ("userId")`,
  `CREATE TABLE IF NOT EXISTS "research_highlight" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "sourceId" text NOT NULL REFERENCES "research_source" ("id") ON DELETE CASCADE,
    "quote" text NOT NULL,
    "prefix" text NOT NULL DEFAULT '',
    "suffix" text NOT NULL DEFAULT '',
    "note" text,
    "createdAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "research_highlight_sourceId_idx" ON "research_highlight" ("sourceId")`,
] as const

/**
 * Nexus Command storage. `credentials` holds AES-256-GCM ciphertext from
 * `src/lib/connectors/vault.ts`; it is never returned to the browser.
 */
export const COMMAND_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "command_connection" (
    "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "connectorId" text NOT NULL,
    "status" text NOT NULL DEFAULT 'ok',
    "credentials" text,
    "settings" jsonb NOT NULL DEFAULT '{}',
    "lastSyncAt" timestamptz,
    "lastError" text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "command_connection_pk" PRIMARY KEY ("userId", "connectorId")
  )`,
  `CREATE TABLE IF NOT EXISTS "command_item" (
    "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "id" text NOT NULL,
    "kind" text NOT NULL,
    "connectorId" text NOT NULL,
    "origin" text NOT NULL,
    "title" text NOT NULL,
    "data" jsonb NOT NULL,
    "occursAt" timestamptz,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "command_item_pk" PRIMARY KEY ("userId", "id")
  )`,
  `CREATE INDEX IF NOT EXISTS "command_item_kind_idx" ON "command_item" ("userId", "kind")`,
  `CREATE INDEX IF NOT EXISTS "command_item_occurs_idx" ON "command_item" ("userId", "occursAt")`,
  `CREATE TABLE IF NOT EXISTS "command_automation_run" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "recipeId" text NOT NULL,
    "recipeName" text NOT NULL,
    "trigger" text NOT NULL,
    "triggerItemId" text,
    "status" text NOT NULL,
    "steps" jsonb NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "command_automation_run_user_idx" ON "command_automation_run" ("userId", "createdAt" DESC)`,
  `CREATE INDEX IF NOT EXISTS "command_automation_run_trigger_idx" ON "command_automation_run" ("userId", "recipeId", "triggerItemId")`,
  `CREATE TABLE IF NOT EXISTS "command_recipe_state" (
    "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "recipeId" text NOT NULL,
    "enabled" boolean NOT NULL,
    CONSTRAINT "command_recipe_state_pk" PRIMARY KEY ("userId", "recipeId")
  )`,
  `CREATE TABLE IF NOT EXISTS "command_focus" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "title" text NOT NULL,
    "targetItemId" text,
    "minutes" integer NOT NULL,
    "startedAt" timestamptz NOT NULL,
    "endsAt" timestamptz NOT NULL,
    "endedAt" timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS "command_focus_user_idx" ON "command_focus" ("userId", "startedAt" DESC)`,
  `CREATE TABLE IF NOT EXISTS "command_overview" (
    "userId" text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
    "widgets" jsonb NOT NULL DEFAULT '[]'
  )`,
] as const

/** Waitlist storage for prospective users. */
export const WAITLIST_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "waitlist" (
    "id" text PRIMARY KEY NOT NULL,
    "email" text NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "waitlist_email_unique" UNIQUE ("email")
  )`,
  `CREATE INDEX IF NOT EXISTS "waitlist_email_idx" ON "waitlist" ("email")`,
] as const
