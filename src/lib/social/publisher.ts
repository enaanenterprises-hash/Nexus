import "server-only";
import { randomUUID } from "node:crypto";
import { accessToken, type OAuthAppId } from "@/lib/command/drivers/oauth";
import { DriverError, type DriverContext } from "@/lib/command/drivers/types";
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

const PLATFORM_OAUTH_APP: Record<SocialPlatformId, OAuthAppId> = {
  youtube: "google",
  tiktok: "tiktok",
  instagram: "meta",
  x: "x",
  linkedin: "linkedin",
};

const LINKEDIN_HEADERS = {
  "LinkedIn-Version": "202408",
  "X-Restli-Protocol-Version": "2.0.0",
};

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
  file: Blob | null,
  aspectMode: string,
): Promise<Omit<SocialPublishResult, "platformId" | "connectorId">> {
  if (!igUserId?.trim()) {
    return {
      status: "error",
      message: "Sign in with Instagram (via Meta) to link your Creator or Business account.",
    };
  }
  const encodedUser = encodeURIComponent(igUserId.trim());
  const mediaType = aspectMode === "9:16" ? "REELS" : "VIDEO";
  const createUrl = new URL(`https://graph.facebook.com/v21.0/${encodedUser}/media`);
  createUrl.searchParams.set("media_type", mediaType);
  createUrl.searchParams.set("caption", caption.slice(0, 2200));
  createUrl.searchParams.set("access_token", token);

  if (remoteUrl) {
    createUrl.searchParams.set("video_url", remoteUrl);
  } else if (file && file.size > 0) {
    createUrl.searchParams.set("upload_type", "resumable");
  } else {
    return {
      status: "error",
      message: "Attach a rendered video file before publishing to Instagram.",
    };
  }

  const createRes = await fetch(createUrl, { method: "POST" });
  const created = (await createRes.json().catch(() => ({}))) as {
    id?: string;
    uri?: string;
    error?: { message?: string };
  };
  if (!createRes.ok || !created.id) {
    return {
      status: "error",
      message: `Instagram container failed: ${created.error?.message ?? `HTTP ${createRes.status}`}`,
    };
  }

  if (!remoteUrl && file) {
    const bytes = await file.arrayBuffer();
    const uploadUri = created.uri || `https://rupload.facebook.com/ig-api-upload/v21.0/${created.id}`;
    const upRes = await fetch(uploadUri, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${token}`,
        offset: "0",
        file_size: String(bytes.byteLength),
        "Content-Type": "application/octet-stream",
      },
      body: bytes,
    });
    if (!upRes.ok) {
      const errText = await upRes.text().catch(() => "");
      return {
        status: "error",
        message: `Instagram video upload failed (${upRes.status}): ${errText.slice(0, 140) || "Retry upload."}`,
      };
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const statusUrl = new URL(`https://graph.facebook.com/v21.0/${created.id}`);
      statusUrl.searchParams.set("fields", "status_code");
      statusUrl.searchParams.set("access_token", token);
      const statusRes = await fetch(statusUrl, { cache: "no-store" }).catch(() => null);
      const statusData = statusRes
        ? ((await statusRes.json().catch(() => ({}))) as { status_code?: string })
        : {};
      if (statusData.status_code === "FINISHED" || statusData.status_code === "PUBLISHED") break;
      if (statusData.status_code === "ERROR") {
        return {
          status: "error",
          message: "Instagram rejected the video encoding during container processing.",
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  const publishUrl = new URL(`https://graph.facebook.com/v21.0/${encodedUser}/media_publish`);
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
  file: Blob | null,
  mimeType: string,
): Promise<Omit<SocialPublishResult, "platformId" | "connectorId">> {
  let mediaIds: string[] | undefined;
  if (file && file.size > 0) {
    const form = new FormData();
    form.append("media", file, mimeType.startsWith("video/") ? "upload.mp4" : "upload");
    form.append("media_category", mimeType.startsWith("video/") ? "tweet_video" : "tweet_image");
    const upRes = await fetch("https://api.x.com/2/media/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const upPayload = (await upRes.json().catch(() => ({}))) as {
      data?: { id?: string };
      detail?: string;
      title?: string;
    };
    if (!upRes.ok || !upPayload.data?.id) {
      return {
        status: "error",
        message: `X media upload failed (${upRes.status}): ${upPayload.detail ?? upPayload.title ?? "Check media.write permission."}`,
      };
    }
    mediaIds = [upPayload.data.id];
  }

  const res = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: text.slice(0, 280),
      ...(mediaIds ? { media: { media_ids: mediaIds } } : {}),
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    data?: { id?: string };
    detail?: string;
    title?: string;
  };
  if (!res.ok || !payload.data?.id) {
    return {
      status: "error",
      message: `X API rejected (${res.status}): ${payload.detail ?? payload.title ?? "Check tweet.write scope."}`,
    };
  }
  return {
    status: "published",
    postId: payload.data.id,
    postUrl: `https://x.com/i/web/status/${payload.data.id}`,
    message: mediaIds ? "Posted video to X." : "Posted to X.",
  };
}

async function publishToLinkedIn(
  token: string,
  personUrn: string | undefined,
  title: string,
  commentary: string,
  file: Blob | null,
  mimeType: string,
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
      message: "Sign in with LinkedIn again so we can resolve your author profile.",
    };
  }

  let mediaUrn: string | null = null;
  if (file && file.size > 0 && mimeType.startsWith("video/")) {
    const initRes = await fetch("https://api.linkedin.com/rest/videos?action=initializeUpload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...LINKEDIN_HEADERS,
      },
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: author,
          fileSizeBytes: file.size,
          uploadCaptions: false,
          uploadThumbnail: false,
        },
      }),
    });
    const initPayload = (await initRes.json().catch(() => ({}))) as {
      value?: {
        video?: string;
        uploadToken?: string;
        uploadInstructions?: Array<{ uploadUrl: string; firstByte: number; lastByte: number }>;
      };
      message?: string;
    };
    const initVal = initPayload.value;
    if (!initRes.ok || !initVal?.video || !initVal.uploadInstructions?.length) {
      return {
        status: "error",
        message: `LinkedIn video upload init failed (${initRes.status}): ${initPayload.message ?? "Verify w_member_social scope."}`,
      };
    }

    const bytes = await file.arrayBuffer();
    const uploadedPartIds: string[] = [];
    for (const part of initVal.uploadInstructions) {
      const chunk = bytes.slice(part.firstByte, part.lastByte + 1);
      const putRes = await fetch(part.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: chunk,
      });
      if (!putRes.ok) {
        return {
          status: "error",
          message: `LinkedIn video chunk transfer failed (${putRes.status}).`,
        };
      }
      const etag = putRes.headers.get("etag");
      if (etag) uploadedPartIds.push(etag);
    }

    const finRes = await fetch("https://api.linkedin.com/rest/videos?action=finalizeUpload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...LINKEDIN_HEADERS,
      },
      body: JSON.stringify({
        finalizeUploadRequest: {
          video: initVal.video,
          uploadToken: initVal.uploadToken ?? "",
          uploadedPartIds,
        },
      }),
    });
    if (!finRes.ok) {
      return {
        status: "error",
        message: `LinkedIn video finalize failed (${finRes.status}).`,
      };
    }
    mediaUrn = initVal.video;
  }

  const postRes = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...LINKEDIN_HEADERS,
    },
    body: JSON.stringify({
      author,
      commentary: commentary.slice(0, 3000),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      ...(mediaUrn ? { content: { media: { id: mediaUrn, title: title.slice(0, 200) } } } : {}),
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!postRes.ok) {
    const errText = await postRes.text().catch(() => "");
    return {
      status: "error",
      message: `LinkedIn publish failed (${postRes.status}): ${errText.slice(0, 160) || "Check w_member_social permission."}`,
    };
  }
  return {
    status: "published",
    postId: postRes.headers.get("x-restli-id"),
    message: mediaUrn ? "Published video post to LinkedIn." : "Published to LinkedIn.",
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
    let activeCreds = (conn ? commandStore.readCredentials(conn) : null) ?? {};
    let token = "";

    if (conn && activeCreds["accessToken"]?.trim()) {
      try {
        const driverCtx: DriverContext = {
          userId: input.userId,
          connectorId: spec.connectorId,
          credentials: activeCreds,
          settings: conn.settings,
          timeZone: "UTC",
          now: new Date(),
          saveCredentials: async (nextCreds) => {
            activeCreds = nextCreds;
            await commandStore.saveConnection(input.userId, spec.connectorId, {
              settings: conn.settings,
              credentials: nextCreds,
            });
          },
        };
        token = await accessToken(driverCtx, PLATFORM_OAUTH_APP[platformId]);
      } catch (err) {
        if (err instanceof DriverError && err.code === "auth") {
          await commandStore.markConnection(input.userId, spec.connectorId, "needs_auth", err.message);
          token = "";
        } else {
          results.push({
            platformId,
            connectorId: spec.connectorId,
            status: "error",
            docsUrl: spec.docsUrl,
            message: err instanceof Error ? err.message : `${spec.name} sign-in check failed.`,
          });
          continue;
        }
      }
    }

    if (!token) {
      results.push({
        platformId,
        connectorId: spec.connectorId,
        status: "needs_credentials",
        docsUrl: spec.docsUrl,
        message: `Sign in to your ${spec.name} account to publish directly. Your framing and caption are saved in Storage.`,
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
        creds: activeCreds,
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
        ctx.file,
        ctx.aspectMode,
      );
    case "x":
      return publishToX(ctx.token, ctx.bodyText, ctx.file, ctx.mimeType);
    case "linkedin":
      return publishToLinkedIn(
        ctx.token,
        ctx.creds["personUrn"],
        ctx.title,
        ctx.bodyText,
        ctx.file,
        ctx.mimeType,
      );
  }
}
