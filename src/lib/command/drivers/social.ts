import "server-only";
import { DriverError, type ConnectorDriver, type DriverContext } from "./types";

function socialVerify(label: string) {
  return async (ctx: DriverContext) => {
    const token = ctx.credentials?.["accessToken"]?.trim();
    if (!token || token.length < 8) {
      throw new DriverError(`Paste a valid ${label} access token first.`, "auth");
    }
  };
}

function makeSocialDriver(id: string, label: string): ConnectorDriver {
  return {
    id,
    verify: socialVerify(label),
    actions: {
      "social.publish": async (ctx) => {
        const token = ctx.credentials?.["accessToken"]?.trim();
        if (!token) {
          throw new DriverError(`${label} token missing.`, "auth");
        }
        return { detail: `${label} publishing session ready.` };
      },
    },
  };
}

export const tiktokPublishDriver = makeSocialDriver("tiktok-publish", "TikTok");
export const instagramPublishDriver = makeSocialDriver("instagram-publish", "Instagram");
export const youtubePublishDriver = makeSocialDriver("youtube-publish", "YouTube");
export const xPublishDriver = makeSocialDriver("x-publish", "X");
export const linkedinPublishDriver = makeSocialDriver("linkedin-publish", "LinkedIn");
