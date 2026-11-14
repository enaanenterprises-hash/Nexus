import "server-only"
import type { CommandItemInput } from "../kinds"
import { apiJson } from "./http"
import { accessToken } from "./oauth"
import type { ConnectorDriver, DriverContext } from "./types"

interface Activity {
  id: number
  name: string
  sport_type: string
  start_date: string
  elapsed_time: number
  moving_time: number
  distance: number
  total_elevation_gain: number
  average_heartrate?: number
}

const KIND: Record<string, "run" | "ride"> = { Run: "run", TrailRun: "run", VirtualRun: "run", Ride: "ride", GravelRide: "ride", MountainBikeRide: "ride", VirtualRide: "ride", EBikeRide: "ride" }

async function strava<T>(ctx: DriverContext, path: string) {
  return apiJson<T>(`https://www.strava.com/api/v3${path}`, { label: "Strava", headers: { authorization: `Bearer ${await accessToken(ctx, "strava")}` } })
}

/** Your activities from the last seven days. */
export const stravaDriver: ConnectorDriver = {
  id: "strava",
  async verify(ctx) {
    await strava(ctx, "/athlete")
  },
  async fetch(ctx) {
    const after = Math.floor(ctx.now.getTime() / 1000) - 7 * 86_400
    const list = await strava<Activity[]>(ctx, `/athlete/activities?after=${after}&per_page=50`)
    return list.map((a): CommandItemInput => {
      const km = a.distance / 1000
      const minutes = a.moving_time / 60
      const metrics: Record<string, number> = { distance_km: Math.round(km * 100) / 100, moving_min: Math.round(minutes), elevation_m: Math.round(a.total_elevation_gain) }
      if (km > 0 && KIND[a.sport_type] === "run") metrics["pace_min_km"] = Math.round((minutes / km) * 100) / 100
      if (a.average_heartrate) metrics["avg_hr"] = Math.round(a.average_heartrate)
      const start = new Date(a.start_date)
      return {
        kind: "command.activity",
        title: a.name,
        externalId: String(a.id),
        url: `https://www.strava.com/activities/${a.id}`,
        data: {
          activity: KIND[a.sport_type] ?? "workout",
          status: "completed",
          startedAt: start.toISOString(),
          endedAt: new Date(start.getTime() + a.elapsed_time * 1000).toISOString(),
          durationMin: Math.round(minutes),
          metrics,
          detail: km > 0 ? `${km.toFixed(1)} km` : a.sport_type,
        },
      }
    })
  },
}
