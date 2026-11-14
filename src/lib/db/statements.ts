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
