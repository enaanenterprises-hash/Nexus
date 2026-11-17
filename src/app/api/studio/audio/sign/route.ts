import { json, jsonError, readJson, requireLibraryUser, str } from "@/lib/research/route-helpers";
import {
  createSignedUploadTarget,
  isSupabaseStorageConfigured,
  sanitizeAudioObjectKey,
} from "@/lib/supabase/storage";

export async function POST(request: Request) {
  const user = await requireLibraryUser();
  if ("response" in user) return user.response;
  if (!isSupabaseStorageConfigured()) {
    return json({ configured: false });
  }

  const body = await readJson(request);
  const key = sanitizeAudioObjectKey(str(body?.["key"], 160));
  if (!key) {
    return jsonError(400, "Invalid audio key.", "bad_request");
  }

  try {
    const target = await createSignedUploadTarget(user.userId, key);
    return json({
      configured: true,
      signedUrl: target.signedUrl,
      token: target.token,
      objectUrl: `/api/studio/audio?key=${encodeURIComponent(key)}`,
    });
  } catch (error) {
    console.error("[studio-audio] signed upload request failed", error instanceof Error ? error.message : error);
    return jsonError(500, "Could not create Supabase Storage upload link.", "storage_error");
  }
}
