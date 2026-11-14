import "server-only"
import { accessToken } from "./oauth"
import { DriverError, type ConnectorDriver, type DriverContext } from "./types"

/** `https://open.spotify.com/playlist/<id>` or `spotify:playlist:<id>` → context URI. */
function playlistUri(value: string | undefined): string | null {
  const v = value?.trim() ?? ""
  const m = /(?:open\.spotify\.com\/playlist\/|spotify:playlist:)([A-Za-z0-9]{10,40})/.exec(v)
  return m ? `spotify:playlist:${m[1]}` : null
}

async function player(ctx: DriverContext, path: string, init: RequestInit = {}) {
  const token = await accessToken(ctx, "spotify")
  const response = await fetch(`https://api.spotify.com/v1/me/player${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  })
  if (response.status === 404) throw new DriverError("Open Spotify on a device first; there is no active player.", "upstream")
  if (response.status === 403) throw new DriverError("Spotify only allows playback control on Premium accounts.", "upstream")
  if (response.status === 401) throw new DriverError("Spotify access expired. Reconnect it.", "auth")
  if (!response.ok) throw new DriverError(`Spotify answered ${response.status}.`, "upstream")
  return response.status === 204 ? null : response.json().catch(() => null)
}

/** Plays your focus playlist and pauses it after. Needs Spotify Premium and an open player. */
export const spotifyDriver: ConnectorDriver = {
  id: "spotify",
  async verify(ctx) {
    await player(ctx, "")
  },
  actions: {
    "music.play": async (ctx) => {
      const uri = playlistUri(ctx.settings["playlist"])
      await player(ctx, "/play", { method: "PUT", body: JSON.stringify(uri ? { context_uri: uri } : {}) })
      return { detail: uri ? "Focus playlist started on Spotify." : "Resumed Spotify (set a playlist link in settings to pick one)." }
    },
    "music.pause": async (ctx) => {
      await player(ctx, "/pause", { method: "PUT" })
      return { detail: "Paused Spotify." }
    },
  },
}
