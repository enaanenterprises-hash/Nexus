import { NextResponse } from "next/server";
import { json, jsonError, requireLibraryUser } from "@/lib/research/route-helpers";
import {
  createSignedDownloadUrl,
  deleteStudioAudioObject,
  isSupabaseStorageConfigured,
  sanitizeAudioObjectKey,
  uploadStudioAudioObject,
} from "@/lib/supabase/storage";

export async function GET(request: Request) {
  const user = await requireLibraryUser();
  if ("response" in user) return user.response;
  if (!isSupabaseStorageConfigured()) {
    return jsonError(503, "Supabase Storage is not configured.", "storage_unconfigured");
  }

  const key = sanitizeAudioObjectKey(new URL(request.url).searchParams.get("key"));
  if (!key) {
    return jsonError(400, "Missing or invalid audio key.", "bad_request");
  }

  try {
    const signedUrl = await createSignedDownloadUrl(user.userId, key, 300);
    if (!signedUrl) {
      return jsonError(404, "Audio object not found.", "not_found");
    }
    return NextResponse.redirect(signedUrl, {
      status: 307,
      headers: { "Cache-Control": "private, max-age=120" },
    });
  } catch (error) {
    console.error("[studio-audio] sign read failed", error instanceof Error ? error.message : error);
    return jsonError(500, "Could not load audio from Supabase Storage.", "storage_error");
  }
}

export async function POST(request: Request) {
  const user = await requireLibraryUser();
  if ("response" in user) return user.response;
  if (!isSupabaseStorageConfigured()) {
    return jsonError(503, "Supabase Storage is not configured.", "storage_unconfigured");
  }

  const url = new URL(request.url);
  let key = sanitizeAudioObjectKey(url.searchParams.get("key"));
  let contentType = request.headers.get("content-type") || "audio/webm";
  let bytes: ArrayBuffer;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!key && typeof form?.get("key") === "string") {
      key = sanitizeAudioObjectKey(String(form.get("key")));
    }
    if (!(file instanceof Blob)) {
      return jsonError(400, "Missing audio file payload.", "bad_request");
    }
    contentType = file.type || "audio/webm";
    bytes = await file.arrayBuffer();
  } else {
    bytes = await request.arrayBuffer();
  }

  if (!key || bytes.byteLength === 0) {
    return jsonError(400, "Invalid audio key or empty payload.", "bad_request");
  }

  try {
    await uploadStudioAudioObject(user.userId, key, bytes, contentType);
    return json({ url: `/api/studio/audio?key=${encodeURIComponent(key)}` }, { status: 201 });
  } catch (error) {
    console.error("[studio-audio] upload failed", error instanceof Error ? error.message : error);
    return jsonError(500, "Could not save audio to Supabase Storage.", "storage_error");
  }
}

export async function DELETE(request: Request) {
  const user = await requireLibraryUser();
  if ("response" in user) return user.response;
  if (!isSupabaseStorageConfigured()) {
    return json({ ok: true });
  }

  const key = sanitizeAudioObjectKey(new URL(request.url).searchParams.get("key"));
  if (!key) {
    return jsonError(400, "Missing or invalid audio key.", "bad_request");
  }

  try {
    await deleteStudioAudioObject(user.userId, key);
    return json({ ok: true });
  } catch (error) {
    console.error("[studio-audio] delete failed", error instanceof Error ? error.message : error);
    return jsonError(500, "Could not delete audio from Supabase Storage.", "storage_error");
  }
}
