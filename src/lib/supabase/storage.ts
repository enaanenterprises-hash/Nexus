import "server-only";

const DEFAULT_STUDIO_BUCKET = "nexus-studio-audio";
const SAFE_KEY_RE = /^[a-zA-Z0-9._-]{1,160}$/;

let bucketReady: Promise<void> | null = null;

function supabaseUrl(): string {
  const url =
    process.env["SUPABASE_URL"]?.trim() ||
    process.env["NEXT_PUBLIC_SUPABASE_URL"]?.trim() ||
    "";
  return url.replace(/\/+$/, "");
}

function serviceRoleKey(): string {
  return (
    process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim() ||
    process.env["SUPABASE_SECRET_KEY"]?.trim() ||
    ""
  );
}

export function studioAudioBucket(): string {
  return process.env["SUPABASE_STUDIO_BUCKET"]?.trim() || DEFAULT_STUDIO_BUCKET;
}

export function isSupabaseStorageConfigured(): boolean {
  return Boolean(supabaseUrl() && serviceRoleKey());
}

export function sanitizeAudioObjectKey(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed || !SAFE_KEY_RE.test(trimmed)) return null;
  if (trimmed === "." || trimmed === ".." || trimmed.includes("..")) return null;
  return trimmed;
}

function objectPathForUser(userId: string, key: string): string {
  const safeUser = encodeURIComponent(userId.replace(/[^a-zA-Z0-9._-]/g, "_"));
  return `${safeUser}/${encodeURIComponent(key)}`;
}

function authHeaders(extra?: Record<string, string>): HeadersInit {
  const key = serviceRoleKey();
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    ...extra,
  };
}

/** Ensures the private Studio audio bucket exists in Supabase Storage. */
export async function ensureStudioAudioBucket(): Promise<void> {
  if (!isSupabaseStorageConfigured()) {
    throw new Error("Supabase Storage is not configured.");
  }
  bucketReady ??= (async () => {
    const base = supabaseUrl();
    const bucket = encodeURIComponent(studioAudioBucket());
    const probe = await fetch(`${base}/storage/v1/bucket/${bucket}`, {
      headers: authHeaders(),
      cache: "no-store",
    });
    if (probe.ok) return;

    const create = await fetch(`${base}/storage/v1/bucket`, {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        id: studioAudioBucket(),
        name: studioAudioBucket(),
        public: false,
        file_size_limit: 52_428_800,
      }),
    });
    if (!create.ok && create.status !== 409) {
      const detail = await create.text().catch(() => "");
      throw new Error(`Could not create Supabase Storage bucket (${create.status}): ${detail}`);
    }
  })().catch((err: unknown) => {
    bucketReady = null;
    throw err;
  });
  return bucketReady;
}

export async function createSignedUploadTarget(
  userId: string,
  key: string,
): Promise<{ signedUrl: string; token: string; objectPath: string }> {
  await ensureStudioAudioBucket();
  const base = supabaseUrl();
  const bucket = encodeURIComponent(studioAudioBucket());
  const objectPath = objectPathForUser(userId, key);

  const res = await fetch(`${base}/storage/v1/object/upload/sign/${bucket}/${objectPath}`, {
    method: "POST",
    headers: authHeaders({
      "content-type": "application/json",
      "x-upsert": "true",
    }),
    body: "{}",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Supabase signed upload failed (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as { url?: string; token?: string };
  if (!data.url) {
    throw new Error("Supabase signed upload did not return a URL.");
  }
  const signedUrl = data.url.startsWith("http")
    ? data.url
    : `${base}/storage/v1${data.url.startsWith("/") ? "" : "/"}${data.url}`;
  return { signedUrl, token: data.token ?? "", objectPath };
}

export async function uploadStudioAudioObject(
  userId: string,
  key: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<void> {
  await ensureStudioAudioBucket();
  const base = supabaseUrl();
  const bucket = encodeURIComponent(studioAudioBucket());
  const objectPath = objectPathForUser(userId, key);

  const res = await fetch(`${base}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: authHeaders({
      "content-type": contentType || "audio/webm",
      "x-upsert": "true",
    }),
    body: bytes,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Supabase upload failed (${res.status}): ${detail}`);
  }
}

export async function createSignedDownloadUrl(
  userId: string,
  key: string,
  expiresIn = 300,
): Promise<string | null> {
  if (!isSupabaseStorageConfigured()) return null;
  const base = supabaseUrl();
  const bucket = encodeURIComponent(studioAudioBucket());
  const objectPath = objectPathForUser(userId, key);

  const res = await fetch(`${base}/storage/v1/object/sign/${bucket}/${objectPath}`, {
    method: "POST",
    headers: authHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { signedURL?: string; signedUrl?: string };
  const raw = data.signedURL || data.signedUrl;
  if (!raw) return null;
  return raw.startsWith("http")
    ? raw
    : `${base}/storage/v1${raw.startsWith("/") ? "" : "/"}${raw}`;
}

export async function deleteStudioAudioObject(userId: string, key: string): Promise<void> {
  if (!isSupabaseStorageConfigured()) return;
  const base = supabaseUrl();
  const bucket = encodeURIComponent(studioAudioBucket());
  const safeUser = userId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const res = await fetch(`${base}/storage/v1/object/${bucket}`, {
    method: "DELETE",
    headers: authHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ prefixes: [`${safeUser}/${key}`] }),
  });
  if (!res.ok && res.status !== 404) {
    const detail = await res.text().catch(() => "");
    console.warn(`[studio-storage] delete failed (${res.status}): ${detail}`);
  }
}
