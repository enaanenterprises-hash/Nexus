import "server-only";
import { randomUUID } from "node:crypto";
import * as commandStore from "@/lib/command/store";
import { savePublishJob } from "@/lib/storage/store";
import {
  SOCIAL_PLATFORM_IDS,
  getSocialPlatform,
  resolvedPlatformCopy,
  validateSocialDraft,
  type SocialPlatformId,
  type SocialPublishDraft,
  type SocialPublishRecord,
  type SocialPublishResult,
} from "./platforms";

async function publishToYouTube(
  token: string,
  title: string,
  bodyText: string,
  visibility: SocialPublishDraft["visibility"],
  file: Blob | null,
  mimeType: string,
): Promise<Omit<SocialPublishResult, "platformId" | "connectorId">> {
  if (!file) {
    return {
      status: "error",
      message: "YouTube requires a rendered video file attached to the publish request.",
    };
  }
  const metadata = {
    snippet: {
      title: title.slice(0, 100),
      description: bodyText.slice(0, 5000),
    },
    status: {
      privacyStatus: visibility,
    },
  };
  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(file.size),
        "X-Upload-Content-Type": mimeType || "video/mp4",
      },
      body: JSON.stringify(metadata),
    },
  );
  if (!initRes.ok) {
    const errText = await initRes.text().catch(() => "");
    return {
      status: "error",
      message: `YouTube upload rejected (${initRes.status}): ${errText.slice(0, 180) || "Check token scopes (youtube.upload)."}`,
    };
  }
  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) {
    return {
      status: "error",
      message: "YouTube did not return a resumable upload session URL.",
    };
  }
  const bytes = await file.arrayBuffer();
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType || "video/mp4",
      "Content-Length": String(bytes.byteLength),
    },
    body: bytes,
  });
  if (!putRes.ok) {
    const errText = await putRes.text().catch(() => "");
    return {
      status: "error",
      message: `YouTube binary transfer failed (${putRes.status}): ${errText.slice(0, 160) || "Retry upload."}`,
    };
  }
  const data = (await putRes.json().catch(() => ({}))) as { id?: string };
  return {
    status: "published",
    postId: data.id ?? null,
    postUrl: data.id ? `https://youtube.com/watch?v=${data.id}` : null,
    message: "Uploaded directly to YouTube Studio.",
  };
}

async function publishToTikTok(
  token: string,
  caption: string,
  visibility: SocialPublishDraft["visibility"],
  file: Blob | null,
): Promise<Omit<SocialPublishResult, "platformId" | "connectorId">> {
  if (!file) {
    return { status: "error", message: "Attach a video file to publish to TikTok." };
  }
  const privacyLevel =
    visibility === "private"
      ? "SELF_ONLY"
      : visibility === "unlisted"
        ? "MUTUAL_FOLLOW_FRIENDS"
        : "PUBLIC_TO_EVERYONE";

  const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: caption.slice(0, 2200),
        privacy_level: privacyLevel,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: file.size,
        chunk_size: file.size,
        total_chunk_count: 1,
      },
    }),
  });
  const payload = (await initRes.json().catch(() => ({}))) as {
    data?: { publish_id?: string; upload_url?: string };
    error?: { message?: string; code?: string };
  };
  if (!initRes.ok || !payload.data?.upload_url) {
    return {
      status: "error",
      message: `TikTok Direct Post failed (${initRes.status}): ${payload.error?.message ?? "Verify video.publish scope."}`,
    };
  }
  const bytes = await file.arrayBuffer();
  const putRes = await fetch(payload.data.upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
    },
    body: bytes,
  });
  if (!putRes.ok) {
    return {
      status: "error",
      message: `TikTok media upload returned HTTP ${putRes.status}.`,
    };
  }
  return {
    status: "published",
    postId: payload.data.publish_id ?? null,
    message: "Uploaded to TikTok Direct Post queue.",
  };
}

async function publishToInstagram(
  token: string,
  igUserId: string | undefined,
  caption: string,
  remoteUrl: string | null,
  aspectMode: string,
): Promise<Omit<SocialPublishResult, "platformId" | "connectorId">> {
  if (!igUserId?.trim()) {
    return {
      status: "error",
      message: "Instagram Business Account ID is required in Command → Connections.",
    };
  }
  if (!remoteUrl) {
    return {
      status: "error",
      message:
        "Instagram Graph API requires a publicly reachable HTTPS video URL. Exported framing & caption are saved in Storage.",
    };
  }
  const mediaType = aspectMode === "9:16" ? "REELS" : "VIDEO";
  const createUrl = new URL(`https://graph.facebook.com/v21.0/${encodeURIComponent(igUserId.trim())}/media`);
  createUrl.searchParams.set("media_type", mediaType);
  createUrl.searchParams.set("video_url", remoteUrl);
  createUrl.searchParams.set("caption", caption.slice(0, 2200));
  createUrl.searchParams.set("access_token", token);

  const createRes = await fetch(createUrl, { method: "POST" });
  const created = (await createRes.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!createRes.ok || !created.id) {
    return {
      status: "error",
      message: `Instagram container failed: ${created.error?.message ?? `HTTP ${createRes.status}`}`,
    };
  }
  const publishUrl = new URL(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(igUserId.trim())}/media_publish`,
  );
  publishUrl.searchParams.set("creation_id", created.id);
  publishUrl.searchParams.set("access_token", token);
  const pubRes = await fetch(publishUrl, { method: "POST" });
  const pub = (await pubRes.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!pubRes.ok || !pub.id) {
    return {
      status: "error",
      message: `Instagram publish pending or rejected: ${pub.error?.message ?? `HTTP ${pubRes.status}`}`,
    };
  }
  return {
    status: "published",
    postId: pub.id,
    message: `Published to Instagram (${mediaType}).`,
  };
}

async function publishToX(
  token: string,
  text: string,
): Promise<Omit<SocialPublishResult, "platformId" | "connectorId">> {
  const res = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: text.slice(0, 280) }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    data?: { id?: string };
    detail?: string;
    title?: string;
  };
  if (!res.ok || !payload.data?.id) {
    return {
      status: "error",
      message: `X API rejected (${res.status}): ${payload.detail ?? payload.title ?? "Check tweet.write token scope."}`,
    };
  }
  return {
    status: "published",
    postId: payload.data.id,
    postUrl: `https://x.com/i/web/status/${payload.data.id}`,
    message: "Posted to X.",
  };
}

async function publishToLinkedIn(
  token: string,
  personUrn: string | undefined,
  commentary: string,
): Promise<Omit<SocialPublishResult, "platformId" | "connectorId">> {
  let author = personUrn?.trim() || "";
  if (!author) {
    const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const me = (await meRes.json().catch(() => ({}))) as { sub?: string };
    if (meRes.ok && me.sub) author = `urn:li:person:${me.sub}`;
  }
  if (!author) {
    return {
      status: "error",
      message: "Set Author URN or grant openid/w_member_social scope in Command → Connections.",
    };
  }
  const postRes = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": "202408",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author,
      commentary: commentary.slice(0, 3000),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!postRes.ok) {
    const errText = await postRes.text().catch(() => "");
    return {
      status: "error",
      message: `LinkedIn publish failed (${postRes.status}): ${errText.slice(0, 160) || "Check w_member_social token."}`,
    };
  }
  return {
    status: "published",
    postId: postRes.headers.get("x-restli-id"),
    message: "Published to LinkedIn.",
  };
}

export async function publishSocialBundle(input: {
  userId: string;
  itemId: string | null;
  draft: SocialPublishDraft;
  file: Blob | null;
  mimeType: string;
  remoteUrl: string | null;
}): Promise<SocialPublishRecord> {
  const validation = validateSocialDraft(input.draft);
  if (!validation.ok) {
    throw new Error(validation.errors[0] ?? "Complete the required Title and Description fields.");
  }

  const enabled = SOCIAL_PLATFORM_IDS.filter((id) => input.draft.platforms[id]?.enabled);
  const results: SocialPublishResult[] = [];

  for (const platformId of enabled) {
    const spec = getSocialPlatform(platformId);
    const conn = await commandStore.getConnection(input.userId, spec.connectorId);
    const creds = conn ? commandStore.readCredentials(conn) : null;
    const token = creds?.["accessToken"]?.trim();

    if (!token) {
      results.push({
        platformId,
        connectorId: spec.connectorId,
        status: "needs_credentials",
        docsUrl: spec.docsUrl,
        message: `Connect your ${spec.name} API key in Command → Connections to publish live. Copy & framing saved in Storage.`,
      });
      continue;
    }

    const copy = resolvedPlatformCopy(input.draft, platformId);
    const bodyText = copy.hashtags ? `${copy.description}\n\n${copy.hashtags}` : copy.description;
    const framing = input.draft.platforms[platformId]!.framing;

    let outcome: Omit<SocialPublishResult, "platformId" | "connectorId">;
    try {
      outcome = await dispatchPlatform(platformId, {
        token,
        creds: creds ?? {},
        title: copy.title,
        bodyText,
        visibility: input.draft.visibility,
        file: input.file,
        mimeType: input.mimeType,
        remoteUrl: input.remoteUrl,
        aspectMode: framing.aspectMode,
      });
    } catch (err) {
      outcome = {
        status: "error",
        message: err instanceof Error ? err.message : `${spec.name} request failed.`,
      };
    }

    results.push({
      platformId,
      connectorId: spec.connectorId,
      docsUrl: spec.docsUrl,
      ...outcome,
    });
  }

  const jobId = `pub-${randomUUID().slice(0, 12)}`;
  const publishedAt = new Date().toISOString();
  try {
    await savePublishJob(input.userId, {
      jobId,
      itemId: input.itemId,
      title: input.draft.title,
      description: input.draft.description,
      hashtags: input.draft.hashtags,
      platforms: input.draft.platforms,
      results,
    });
  } catch (err) {
    console.error("[social] could not persist publish job", err instanceof Error ? err.message : err);
  }

  return {
    jobId,
    publishedAt,
    title: input.draft.title,
    platforms: results,
  };
}

async function dispatchPlatform(
  platformId: SocialPlatformId,
  ctx: {
    token: string;
    creds: Record<string, string>;
    title: string;
    bodyText: string;
    visibility: SocialPublishDraft["visibility"];
    file: Blob | null;
    mimeType: string;
    remoteUrl: string | null;
    aspectMode: string;
  },
) {
  switch (platformId) {
    case "youtube":
      return publishToYouTube(ctx.token, ctx.title, ctx.bodyText, ctx.visibility, ctx.file, ctx.mimeType);
    case "tiktok":
      return publishToTikTok(ctx.token, ctx.bodyText, ctx.visibility, ctx.file);
    case "instagram":
      return publishToInstagram(
        ctx.token,
        ctx.creds["igUserId"],
        ctx.bodyText,
        ctx.remoteUrl,
        ctx.aspectMode,
      );
    case "x":
      return publishToX(ctx.token, ctx.bodyText);
    case "linkedin":
      return publishToLinkedIn(ctx.token, ctx.creds["personUrn"], ctx.bodyText);
  }
}
