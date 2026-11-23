/**
 * Declarative Social Platform Registry & Publishing Types.
 * New destinations register here with aspect modes, character limits,
 * and Command Connector bindings so SocialPublishStudio renders natively.
 */

export type SocialPlatformId = "tiktok" | "instagram" | "youtube" | "x" | "linkedin";

export type SocialAspectMode = "9:16" | "4:5" | "16:9" | "1:1";

export interface SocialPlatformSpec {
  id: SocialPlatformId;
  name: string;
  monogram: string;
  connectorId: string;
  docsUrl: string;
  defaultAspect: SocialAspectMode;
  supportedAspects: readonly SocialAspectMode[];
  maxTitleChars: number;
  maxDescriptionChars: number;
  supportsTitle: boolean;
  defaultHandle: string;
  aspectLabels: Partial<Record<SocialAspectMode, string>>;
}

export const SOCIAL_PLATFORMS: readonly SocialPlatformSpec[] = [
  {
    id: "tiktok",
    name: "TikTok",
    monogram: "TT",
    connectorId: "tiktok-publish",
    docsUrl: "https://developers.tiktok.com/doc/content-posting-api-get-started",
    defaultAspect: "9:16",
    supportedAspects: ["9:16"],
    maxTitleChars: 150,
    maxDescriptionChars: 2200,
    supportsTitle: false,
    defaultHandle: "@nexus.creator",
    aspectLabels: { "9:16": "9:16 Vertical" },
  },
  {
    id: "instagram",
    name: "Instagram",
    monogram: "IG",
    connectorId: "instagram-publish",
    docsUrl: "https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media",
    defaultAspect: "9:16",
    supportedAspects: ["9:16", "4:5"],
    maxTitleChars: 120,
    maxDescriptionChars: 2200,
    supportsTitle: false,
    defaultHandle: "nexus.atelier",
    aspectLabels: { "9:16": "Reels 9:16", "4:5": "Feed 4:5" },
  },
  {
    id: "youtube",
    name: "YouTube",
    monogram: "YT",
    connectorId: "youtube-publish",
    docsUrl: "https://developers.google.com/youtube/v3/docs/videos/insert",
    defaultAspect: "9:16",
    supportedAspects: ["9:16", "16:9"],
    maxTitleChars: 100,
    maxDescriptionChars: 5000,
    supportsTitle: true,
    defaultHandle: "@NexusAtelier",
    aspectLabels: { "9:16": "Shorts 9:16", "16:9": "Video 16:9" },
  },
  {
    id: "x",
    name: "X",
    monogram: "X",
    connectorId: "x-publish",
    docsUrl: "https://developer.x.com/en/docs/x-api/tweets/manage-tweets/introduction",
    defaultAspect: "16:9",
    supportedAspects: ["16:9", "1:1", "9:16"],
    maxTitleChars: 100,
    maxDescriptionChars: 280,
    supportsTitle: false,
    defaultHandle: "@nexusatelier",
    aspectLabels: { "16:9": "16:9 Wide", "1:1": "1:1 Square", "9:16": "9:16 Tall" },
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    monogram: "IN",
    connectorId: "linkedin-publish",
    docsUrl: "https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api",
    defaultAspect: "16:9",
    supportedAspects: ["16:9", "4:5", "1:1"],
    maxTitleChars: 150,
    maxDescriptionChars: 3000,
    supportsTitle: true,
    defaultHandle: "Nexus Creator Studio",
    aspectLabels: { "16:9": "16:9 Feed", "4:5": "4:5 Portrait", "1:1": "1:1 Square" },
  },
] as const;

export const SOCIAL_PLATFORM_IDS: readonly SocialPlatformId[] = SOCIAL_PLATFORMS.map((p) => p.id);

const PLATFORM_BY_ID = new Map<SocialPlatformId, SocialPlatformSpec>(
  SOCIAL_PLATFORMS.map((p) => [p.id, p]),
);

export function getSocialPlatform(id: SocialPlatformId): SocialPlatformSpec {
  return PLATFORM_BY_ID.get(id)!;
}

export interface PlatformFramingConfig {
  aspectMode: SocialAspectMode;
  fit: "cover" | "contain";
  zoom: number;
  panX: number;
  panY: number;
  showSafeZones: boolean;
}

export interface PlatformPostConfig {
  enabled: boolean;
  customTitle?: string;
  customDescription?: string;
  customHashtags?: string;
  framing: PlatformFramingConfig;
}

export type SocialVisibility = "public" | "unlisted" | "private";

export interface SocialPublishDraft {
  title: string;
  description: string;
  hashtags: string;
  visibility: SocialVisibility;
  scheduledAt: string | null;
  platforms: Record<SocialPlatformId, PlatformPostConfig>;
  updatedAt: string;
}

export type SocialPublishResultStatus = "published" | "needs_credentials" | "error";

export interface SocialPublishResult {
  platformId: SocialPlatformId;
  connectorId: string;
  status: SocialPublishResultStatus;
  message: string;
  postUrl?: string | null;
  postId?: string | null;
  docsUrl?: string;
}

export interface SocialPublishRecord {
  jobId: string;
  publishedAt: string;
  title: string;
  platforms: SocialPublishResult[];
}

export function createDefaultFraming(aspectMode: SocialAspectMode): PlatformFramingConfig {
  return {
    aspectMode,
    fit: "cover",
    zoom: 1,
    panX: 0,
    panY: 0,
    showSafeZones: true,
  };
}

export function createDefaultSocialDraft(defaultTitle = ""): SocialPublishDraft {
  return {
    title: defaultTitle,
    description: "",
    hashtags: "#nexus #podcast",
    visibility: "public",
    scheduledAt: null,
    platforms: {
      tiktok: { enabled: true, framing: createDefaultFraming("9:16") },
      instagram: { enabled: true, framing: createDefaultFraming("9:16") },
      youtube: { enabled: true, framing: createDefaultFraming("9:16") },
      x: { enabled: false, framing: createDefaultFraming("16:9") },
      linkedin: { enabled: false, framing: createDefaultFraming("16:9") },
    },
    updatedAt: new Date().toISOString(),
  };
}

export interface SocialDraftValidation {
  ok: boolean;
  errors: string[];
  enabledCount: number;
}

export function resolvedPlatformCopy(
  draft: SocialPublishDraft,
  platformId: SocialPlatformId,
): { title: string; description: string; hashtags: string } {
  const cfg = draft.platforms[platformId];
  return {
    title: (cfg?.customTitle !== undefined ? cfg.customTitle : draft.title).trim(),
    description: (cfg?.customDescription !== undefined ? cfg.customDescription : draft.description).trim(),
    hashtags: (cfg?.customHashtags !== undefined ? cfg.customHashtags : draft.hashtags).trim(),
  };
}

export function validateSocialDraft(draft: SocialPublishDraft): SocialDraftValidation {
  const errors: string[] = [];
  if (!draft.title.trim()) errors.push("Title is required.");
  if (!draft.description.trim()) errors.push("Description is required.");

  const enabled = SOCIAL_PLATFORM_IDS.filter((id) => draft.platforms[id]?.enabled);
  if (enabled.length === 0) errors.push("Select at least one platform.");

  for (const id of enabled) {
    const spec = getSocialPlatform(id);
    const copy = resolvedPlatformCopy(draft, id);
    const bodyText = copy.hashtags ? `${copy.description}\n\n${copy.hashtags}` : copy.description;
    if (bodyText.length > spec.maxDescriptionChars) {
      errors.push(`${spec.name} caption exceeds ${spec.maxDescriptionChars} characters.`);
    }
    if (spec.supportsTitle && copy.title.length > spec.maxTitleChars) {
      errors.push(`${spec.name} title exceeds ${spec.maxTitleChars} characters.`);
    }
  }

  return { ok: errors.length === 0, errors, enabledCount: enabled.length };
}
