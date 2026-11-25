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
  `CREATE TABLE IF NOT EXISTS "nexus_user_setup" (
    "userId" text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
    "completedAt" timestamptz NOT NULL DEFAULT now()
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

/**
 * Recording Studio metadata and AI-ready enrichment columns (`transcript`,
 * `summary`, `chapters`), scoped per user. Binary track payloads reside in client
 * IndexedDB or referenced remote object URLs (`tracks[*].audioRef`).
 */
export const STUDIO_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "studio_collection" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "description" text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "studio_collection_userId_idx" ON "studio_collection" ("userId")`,
  `CREATE TABLE IF NOT EXISTS "studio_recording" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "collectionId" text NOT NULL REFERENCES "studio_collection" ("id") ON DELETE CASCADE,
    "title" text NOT NULL,
    "description" text,
    "bpm" integer NOT NULL DEFAULT 120,
    "countInBars" integer NOT NULL DEFAULT 0,
    "durationMs" integer NOT NULL DEFAULT 0,
    "masterGain" double precision NOT NULL DEFAULT 1,
    "peaks" jsonb NOT NULL DEFAULT '[]',
    "tracks" jsonb NOT NULL DEFAULT '[]',
    "markers" jsonb NOT NULL DEFAULT '[]',
    "tags" text[] NOT NULL DEFAULT '{}',
    "transcript" jsonb,
    "summary" jsonb,
    "chapters" jsonb,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "studio_recording_userId_idx" ON "studio_recording" ("userId", "updatedAt" DESC)`,
  `CREATE INDEX IF NOT EXISTS "studio_recording_collectionId_idx" ON "studio_recording" ("collectionId")`,
] as const

/**
 * Cinema video editor projects and collections, scoped per user. Binary media
 * payloads reside in client IndexedDB or same-origin media proxies.
 */
export const CINEMA_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "cinema_collection" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "description" text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "cinema_collection_userId_idx" ON "cinema_collection" ("userId")`,
  `CREATE TABLE IF NOT EXISTS "cinema_project" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "collectionId" text NOT NULL REFERENCES "cinema_collection" ("id") ON DELETE CASCADE,
    "title" text NOT NULL,
    "description" text,
    "aspectRatio" text NOT NULL DEFAULT '16:9',
    "fps" integer NOT NULL DEFAULT 30,
    "width" integer NOT NULL DEFAULT 1920,
    "height" integer NOT NULL DEFAULT 1080,
    "durationMs" integer NOT NULL DEFAULT 0,
    "thumbnailUrl" text,
    "background" jsonb NOT NULL DEFAULT '{}',
    "tracks" jsonb NOT NULL DEFAULT '[]',
    "clips" jsonb NOT NULL DEFAULT '[]',
    "transitions" jsonb NOT NULL DEFAULT '[]',
    "assets" jsonb NOT NULL DEFAULT '[]',
    "markers" jsonb NOT NULL DEFAULT '[]',
    "tags" text[] NOT NULL DEFAULT '{}',
    "notes" jsonb,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "cinema_project_userId_idx" ON "cinema_project" ("userId", "updatedAt" DESC)`,
  `CREATE INDEX IF NOT EXISTS "cinema_project_collectionId_idx" ON "cinema_project" ("collectionId")`,
] as const

/**
 * Optics photo darkroom & tonal grading tables, scoped per user.
 * Stores non-destructive edit stacks, looks, overlays, and project metadata.
 */
export const OPTICS_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "optics_collection" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "description" text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "optics_collection_userId_idx" ON "optics_collection" ("userId", "updatedAt" DESC)`,
  `CREATE TABLE IF NOT EXISTS "optics_project" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "collectionId" text NOT NULL REFERENCES "optics_collection" ("id") ON DELETE CASCADE,
    "title" text NOT NULL,
    "description" text,
    "width" integer NOT NULL DEFAULT 1500,
    "height" integer NOT NULL DEFAULT 1000,
    "source" jsonb NOT NULL DEFAULT '{}',
    "overlays" jsonb NOT NULL DEFAULT '[]',
    "editStack" jsonb NOT NULL DEFAULT '[]',
    "activeLookId" text,
    "matteMode" text NOT NULL DEFAULT 'auto',
    "thumbnailUrl" text,
    "tags" text[] NOT NULL DEFAULT '{}',
    "notes" jsonb,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "optics_project_userId_idx" ON "optics_project" ("userId", "updatedAt" DESC)`,
  `CREATE INDEX IF NOT EXISTS "optics_project_collectionId_idx" ON "optics_project" ("collectionId")`,
] as const

/** Per-user Nexus workspace preferences & wired node sockets, synced via Postgres. */
export const USER_STATE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "nexus_user_state" (
    "userId" text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
    "installedNodes" jsonb NOT NULL DEFAULT '[]',
    "theme" text,
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`,
] as const

/**
 * Command Storage Vault & Social Publish history, scoped per user.
 * Holds videos, Studio mixes, class notes, datasets, and extension payloads.
 */
export const STORAGE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "storage_folder" (
    "id" text NOT NULL,
    "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "parentId" text,
    "description" text,
    "system" boolean NOT NULL DEFAULT false,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "storage_folder_pk" PRIMARY KEY ("userId", "id")
  )`,
  `CREATE TABLE IF NOT EXISTS "storage_item" (
    "id" text NOT NULL,
    "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "folderId" text,
    "name" text NOT NULL,
    "mimeType" text NOT NULL,
    "kind" text NOT NULL,
    "sizeBytes" bigint NOT NULL DEFAULT 0,
    "blobKey" text,
    "remoteUrl" text,
    "thumbnailDataUrl" text,
    "starred" boolean NOT NULL DEFAULT false,
    "tags" text[] NOT NULL DEFAULT '{}',
    "metadata" jsonb NOT NULL DEFAULT '{}',
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "storage_item_pk" PRIMARY KEY ("userId", "id")
  )`,
  `CREATE INDEX IF NOT EXISTS "storage_item_userId_idx" ON "storage_item" ("userId", "updatedAt" DESC)`,
  `CREATE INDEX IF NOT EXISTS "storage_item_folderId_idx" ON "storage_item" ("userId", "folderId")`,
  `CREATE TABLE IF NOT EXISTS "social_publish_job" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "itemId" text,
    "title" text NOT NULL,
    "description" text NOT NULL,
    "hashtags" text NOT NULL DEFAULT '',
    "platforms" jsonb NOT NULL DEFAULT '{}',
    "results" jsonb NOT NULL DEFAULT '[]',
    "createdAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "social_publish_job_userId_idx" ON "social_publish_job" ("userId", "createdAt" DESC)`,
] as const
