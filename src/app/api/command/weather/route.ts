import { json, jsonError, requireCommandUser, timeZoneFrom } from "@/lib/command/api"
import { weatherDriver } from "@/lib/command/drivers/weather"
import { describeError } from "@/lib/command/service"
import { getConnection } from "@/lib/command/store"

const places = new Map<string, string>()

/** `America/Toronto` → `Toronto|43.7|-79.4|America/Toronto`, via Open-Meteo geocoding (cached per instance). */
async function locationForZone(timeZone: string): Promise<string | null> {
  if (places.has(timeZone)) return places.get(timeZone)!
  const city = timeZone.split("/").at(-1)?.replace(/_/g, " ")
  if (!city || timeZone === "UTC") return null
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  }).catch(() => null)
  const place = response?.ok ? ((await response.json()) as { results?: { name: string; latitude: number; longitude: number }[] }).results?.[0] : undefined
  if (!place) return null
  const value = `${place.name}|${place.latitude.toFixed(4)}|${place.longitude.toFixed(4)}|${timeZone}`
  places.set(timeZone, value)
  return value
}

/**
 * Keyless weather for Today. Uses the Weather connection's location when there
 * is one, otherwise the city of the viewer's time zone. No connection needed.
 */
export async function GET(request: Request) {
  const user = await requireCommandUser()
  if ("response" in user) return user.response
  const timeZone = timeZoneFrom(new URL(request.url).searchParams.get("timeZone"))
  try {
    const connection = await getConnection(user.userId, "weather").catch(() => null)
    const location = connection?.settings["location"] || (await locationForZone(timeZone)) || "New York|40.7128|-74.006|America/New_York"
    const [signal] = await weatherDriver.fetch!({
      userId: user.userId,
      connectorId: "weather",
      credentials: null,
      settings: { location },
      now: new Date(),
      timeZone,
      saveCredentials: async () => {},
    })
    return json({ signal: signal ?? null, location: location.split("|")[0] })
  } catch (error) {
    return jsonError(502, describeError(error).message, "upstream")
  }
}
