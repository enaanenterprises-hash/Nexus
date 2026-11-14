import "server-only"
import type { CommandItemInput } from "../kinds"
import { apiJson, parseLocation } from "./http"
import type { ConnectorDriver } from "./types"

const WMO: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Freezing fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm, hail",
  99: "Thunderstorm, hail",
}

export const weatherLabel = (code: number) => WMO[code] ?? "—"

interface Forecast {
  current: { time: number; temperature_2m: number; apparent_temperature: number; weather_code: number; wind_speed_10m: number; relative_humidity_2m: number }
  hourly: { time: number[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] }
  daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[] }
}

/** Open-Meteo: free, keyless forecasts. */
export const weatherDriver: ConnectorDriver = {
  id: "weather",
  async verify(ctx) {
    parseLocation(ctx.settings["location"])
  },
  async fetch(ctx) {
    const loc = parseLocation(ctx.settings["location"])
    const params = new URLSearchParams({
      latitude: String(loc.lat),
      longitude: String(loc.lon),
      current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m",
      hourly: "temperature_2m,precipitation_probability,weather_code",
      daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      forecast_days: "2",
      timeformat: "unixtime",
      timezone: "auto",
      wind_speed_unit: "kmh",
    })
    const f = await apiJson<Forecast>(`https://api.open-meteo.com/v1/forecast?${params}`, { label: "Open-Meteo" })
    const c = f.current
    const nowSec = ctx.now.getTime() / 1000
    const next = f.hourly.time.map((t, i) => ({ t, i })).filter(({ t }) => t >= nowSec - 1800).slice(0, 12)
    const wet = next.find(({ i }) => (f.hourly.precipitation_probability[i] ?? 0) >= 50)
    const observedAt = new Date(c.time * 1000).toISOString()
    const condition = weatherLabel(c.weather_code)
    const rainChance = f.daily.precipitation_probability_max[0] ?? 0

    const items: CommandItemInput[] = [
      {
        kind: "command.signal",
        title: `Weather · ${loc.name}`,
        externalId: "weather.now",
        url: `https://open-meteo.com/en/docs#latitude=${loc.lat}&longitude=${loc.lon}`,
        data: {
          metric: "weather.now",
          value: Math.round(c.temperature_2m),
          unit: "°C",
          display: `${Math.round(c.temperature_2m)}° · ${condition}`,
          change: null,
          status: c.weather_code >= 61 || rainChance >= 70 ? "poor" : c.weather_code >= 45 ? "fair" : "good",
          observedAt,
          details: {
            location: loc.name,
            condition,
            feelsLike: Math.round(c.apparent_temperature),
            high: Math.round(f.daily.temperature_2m_max[0] ?? c.temperature_2m),
            low: Math.round(f.daily.temperature_2m_min[0] ?? c.temperature_2m),
            windKmh: Math.round(c.wind_speed_10m),
            humidity: c.relative_humidity_2m,
            rainChance,
            nextRain: wet ? new Date(wet.t * 1000).toISOString() : null,
            hourly: next.map(({ t, i }) => `${t}:${Math.round(f.hourly.temperature_2m[i] ?? 0)}:${f.hourly.precipitation_probability[i] ?? 0}:${f.hourly.weather_code[i] ?? 0}`).join(","),
          },
        },
      },
    ]
    return items
  },
}
