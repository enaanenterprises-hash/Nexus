import "server-only"
import type { CommandItemInput } from "../kinds"
import { apiJson, parseLocation } from "./http"
import type { ConnectorDriver } from "./types"

const RAD = Math.PI / 180

/** Solar altitude in degrees (low-precision NOAA formulation, good to ~0.5°). */
export function sunAltitude(at: Date, lat: number, lon: number): number {
  const d = at.getTime() / 86_400_000 - 10_957.5
  const g = (357.529 + 0.98560028 * d) * RAD
  const q = 280.459 + 0.98564736 * d
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD
  const e = (23.439 - 0.00000036 * d) * RAD
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L))
  const dec = Math.asin(Math.sin(e) * Math.sin(L))
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24
  const ha = ((gmst * 15 + lon) * RAD - ra)
  return Math.asin(Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(ha)) / RAD
}

/** First minute in [from, from + hours) where the sun crosses `degrees` in `direction`. */
function crossing(from: Date, hours: number, lat: number, lon: number, degrees: number, direction: "down" | "up"): Date | null {
  let prev = sunAltitude(from, lat, lon)
  for (let m = 5; m <= hours * 60; m += 5) {
    const t = new Date(from.getTime() + m * 60_000)
    const alt = sunAltitude(t, lat, lon)
    if (direction === "down" ? prev > degrees && alt <= degrees : prev < degrees && alt >= degrees) return t
    prev = alt
  }
  return null
}

const SYNODIC = 29.530588853
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)

export function moonPhase(at: Date): { age: number; illumination: number; name: string } {
  const age = ((((at.getTime() - KNOWN_NEW_MOON) / 86_400_000) % SYNODIC) + SYNODIC) % SYNODIC
  const illumination = (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2
  const names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"]
  return { age, illumination, name: names[Math.round((age / SYNODIC) * 8) % 8]! }
}

interface SkyForecast {
  hourly: { time: number[]; cloud_cover: number[]; visibility: number[] }
  daily: { time: number[]; sunrise: number[]; sunset: number[] }
}

/** Sunset, astronomical darkness, moon and cloud cover tonight. Open-Meteo + local astronomy. */
export const skyDriver: ConnectorDriver = {
  id: "sky",
  async verify(ctx) {
    parseLocation(ctx.settings["location"])
  },
  async fetch(ctx) {
    const loc = parseLocation(ctx.settings["location"])
    const params = new URLSearchParams({
      latitude: String(loc.lat),
      longitude: String(loc.lon),
      hourly: "cloud_cover,visibility",
      daily: "sunrise,sunset",
      forecast_days: "2",
      timeformat: "unixtime",
      timezone: "auto",
    })
    const f = await apiJson<SkyForecast>(`https://api.open-meteo.com/v1/forecast?${params}`, { label: "Open-Meteo" })
    const nowMs = ctx.now.getTime()
    // Tonight: today's sunset, or tomorrow's if today's has passed by more than the night itself.
    const sunsetIndex = f.daily.sunset.findIndex((s, i) => s * 1000 > nowMs - 12 * 3_600_000 && (f.daily.sunrise[i + 1] ?? Infinity) * 1000 > nowMs)
    const sunset = new Date((f.daily.sunset[Math.max(0, sunsetIndex)] ?? f.daily.sunset[0]!) * 1000)
    const darkStart = crossing(sunset, 4, loc.lat, loc.lon, -18, "down")
    const darkEnd = darkStart ? crossing(darkStart, 14, loc.lat, loc.lon, -18, "up") : null
    const moon = moonPhase(darkStart ?? sunset)

    const windowStart = (darkStart ?? sunset).getTime() / 1000
    const windowEnd = (darkEnd ?? new Date(sunset.getTime() + 8 * 3_600_000)).getTime() / 1000
    const night = f.hourly.time.map((t, i) => ({ t, cloud: f.hourly.cloud_cover[i] ?? 100 })).filter(({ t }) => t >= windowStart && t < windowEnd)
    const avgCloud = night.length ? night.reduce((s, h) => s + h.cloud, 0) / night.length : 100
    const best = [...night].sort((a, b) => a.cloud - b.cloud || a.t - b.t)[0]
    const score = Math.round(Math.max(0, 100 - avgCloud) * (1 - moon.illumination * 0.6))
    const status = score >= 60 ? "good" : score >= 30 ? "fair" : "poor"
    const sky = avgCloud < 25 ? "Clear" : avgCloud < 60 ? "Partly cloudy" : "Cloudy"

    const items: CommandItemInput[] = [
      {
        kind: "command.signal",
        title: `Night sky · ${loc.name}`,
        externalId: "sky.tonight",
        data: {
          metric: "sky.tonight",
          value: score,
          unit: "/100",
          display: `${sky} · ${Math.round(moon.illumination * 100)}% moon`,
          change: null,
          status,
          observedAt: ctx.now.toISOString(),
          details: {
            location: loc.name,
            sunset: sunset.toISOString(),
            darkStart: darkStart?.toISOString() ?? null,
            darkEnd: darkEnd?.toISOString() ?? null,
            cloudCover: Math.round(avgCloud),
            moonPhase: moon.name,
            moonIllumination: Math.round(moon.illumination * 100),
            bestHour: best ? new Date(best.t * 1000).toISOString() : null,
          },
        },
      },
      {
        kind: "command.event",
        title: "Sunset",
        externalId: `sunset-${sunset.toISOString().slice(0, 10)}`,
        data: { startsAt: sunset.toISOString(), endsAt: null, allDay: false, location: loc.name, category: "sky", status: "confirmed" },
      },
    ]
    if (darkStart && status !== "poor") {
      items.push({
        kind: "command.event",
        title: `Dark sky window · ${sky.toLowerCase()}, ${moon.name.toLowerCase()}`,
        externalId: `dark-${darkStart.toISOString().slice(0, 10)}`,
        data: { startsAt: darkStart.toISOString(), endsAt: darkEnd?.toISOString() ?? null, allDay: false, location: loc.name, category: "sky", status: "tentative" },
      })
    }
    return items
  },
}
