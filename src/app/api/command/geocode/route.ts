import { json, jsonError, requireCommandUser } from "@/lib/command/api"

interface Place {
  name: string
  latitude: number
  longitude: number
  timezone?: string
  admin1?: string
  country?: string
}

/** City search for location settings (Open-Meteo geocoding, keyless). */
export async function GET(request: Request) {
  const user = await requireCommandUser()
  if ("response" in user) return user.response
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? ""
  if (q.length < 2 || q.length > 80) return json({ places: [] })
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&name=${encodeURIComponent(q)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  if (!response?.ok) return jsonError(502, "Location search is unavailable.", "upstream")
  const data = (await response.json()) as { results?: Place[] }
  return json({
    places: (data.results ?? []).map((p) => ({
      label: [p.name, p.admin1, p.country].filter(Boolean).join(", "),
      value: `${p.name}|${p.latitude.toFixed(4)}|${p.longitude.toFixed(4)}|${p.timezone ?? ""}`,
    })),
  })
}
