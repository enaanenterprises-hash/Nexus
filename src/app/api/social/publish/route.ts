import { json, jsonError, requireCommandUser } from "@/lib/command/api";
import { validateSocialDraft, type SocialPublishDraft } from "@/lib/social/platforms";
import { publishSocialBundle } from "@/lib/social/publisher";

export async function POST(request: Request) {
  const user = await requireCommandUser();
  if ("response" in user) return user.response;

  const contentType = request.headers.get("content-type") ?? "";
  let draft: SocialPublishDraft | null = null;
  let itemId: string | null = null;
  let remoteUrl: string | null = null;
  let file: Blob | null = null;
  let mimeType = "video/mp4";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const rawPayload = form.get("payload");
      if (typeof rawPayload === "string") {
        const parsed = JSON.parse(rawPayload) as {
          draft?: SocialPublishDraft;
          itemId?: string | null;
          remoteUrl?: string | null;
          mimeType?: string;
        };
        draft = parsed.draft ?? null;
        itemId = parsed.itemId ?? null;
        remoteUrl = parsed.remoteUrl ?? null;
        mimeType = parsed.mimeType ?? mimeType;
      }
      const entry = form.get("file");
      if (entry instanceof Blob && entry.size > 0) {
        file = entry;
        if (entry.type) mimeType = entry.type;
      }
    } else {
      const body = (await request.json()) as {
        draft?: SocialPublishDraft;
        itemId?: string | null;
        remoteUrl?: string | null;
        mimeType?: string;
      } | null;
      draft = body?.draft ?? null;
      itemId = body?.itemId ?? null;
      remoteUrl = body?.remoteUrl ?? null;
      mimeType = body?.mimeType ?? mimeType;
    }
  } catch {
    return jsonError(400, "Malformed publish payload.", "bad_request");
  }

  if (!draft) {
    return jsonError(400, "Missing publish draft configuration.", "bad_request");
  }

  const check = validateSocialDraft(draft);
  if (!check.ok) {
    return jsonError(400, check.errors[0] ?? "Title and description are required.", "validation_error");
  }

  try {
    const record = await publishSocialBundle({
      userId: user.userId,
      itemId,
      draft,
      file,
      mimeType,
      remoteUrl,
    });
    return json(record);
  } catch (err) {
    console.error("[social] publish error", err instanceof Error ? err.message : err);
    return jsonError(
      500,
      err instanceof Error ? err.message : "Could not complete publish request.",
      "publish_error",
    );
  }
}
