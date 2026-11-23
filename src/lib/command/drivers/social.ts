import "server-only";
import { accessToken, type OAuthAppId } from "./oauth";
import { DriverError, type ConnectorDriver } from "./types";

function makeSocialDriver(id: string, label: string, app: OAuthAppId): ConnectorDriver {
  return {
    id,
    verify: async (ctx) => {
      const token = await accessToken(ctx, app);
      if (!token) {
        throw new DriverError(`Sign in to your ${label} account first.`, "auth");
      }
    },
    actions: {
      "social.publish": async (ctx) => {
        const token = await accessToken(ctx, app);
        if (!token) {
          throw new DriverError(`Sign in to your ${label} account to publish.`, "auth");
        }
        return { detail: `${label} publishing session ready.` };
      },
    },
  };
}

export const tiktokPublishDriver = makeSocialDriver("tiktok-publish", "TikTok", "tiktok");
export const instagramPublishDriver = makeSocialDriver("instagram-publish", "Instagram", "meta");
export const youtubePublishDriver = makeSocialDriver("youtube-publish", "YouTube", "google");
export const xPublishDriver = makeSocialDriver("x-publish", "X", "x");
export const linkedinPublishDriver = makeSocialDriver("linkedin-publish", "LinkedIn", "linkedin");
