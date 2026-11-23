import "server-only"
import { f1Driver } from "./f1"
import { githubDriver } from "./github"
import { gmailDriver, gmailSendDriver, googleCalendarDriver, googleTasksDriver } from "./google"
import { marketsDriver } from "./markets"
import { skyDriver } from "./sky"
import {
  instagramPublishDriver,
  linkedinPublishDriver,
  tiktokPublishDriver,
  xPublishDriver,
  youtubePublishDriver,
} from "./social"
import { spotifyDriver } from "./spotify"
import { stravaDriver } from "./strava"
import { telegramDriver } from "./telegram"
import type { DriverRegistry } from "./types"
import { uptimeDriver } from "./uptime"
import { vercelDriver } from "./vercel"
import { weatherDriver } from "./weather"

/** Real drivers by connector id. A connector without a driver here cannot be connected. */
export const COMMAND_DRIVERS: DriverRegistry = Object.fromEntries(
  [
    googleCalendarDriver,
    gmailDriver,
    gmailSendDriver,
    googleTasksDriver,
    telegramDriver,
    githubDriver,
    vercelDriver,
    uptimeDriver,
    stravaDriver,
    weatherDriver,
    skyDriver,
    spotifyDriver,
    marketsDriver,
    f1Driver,
    tiktokPublishDriver,
    instagramPublishDriver,
    youtubePublishDriver,
    xPublishDriver,
    linkedinPublishDriver,
  ].map((d) => [d.id, d]),
)
