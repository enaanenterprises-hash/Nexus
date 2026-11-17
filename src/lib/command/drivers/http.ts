import "server-only"
import { DriverError } from "./types"

const TIMEOUT_MS = 10_000

function extractUpstreamError(raw: string): string {
  if (!raw.trim()) return ""
  try {
    const parsed = JSON.parse(raw) as {
      error?: string | { message?: string; status?: string }
      error_description?: string
      message?: string
    }
    if (typeof parsed.error === "object" && parsed.error?.message) return parsed.error.message
    if (typeof parsed.error_description === "string") return parsed.error_description
    if (typeof parsed.message === "string") return parsed.message
    if (typeof parsed.error === "string") return parsed.error
  } catch {
    // Plain text upstream error
  }
  return ""
}

/** JSON request to a fixed, known API host. 401/403 become `auth` errors the user can fix by reconnecting. */
export async function apiJson<T>(url: string, init: RequestInit & { label: string }): Promise<T> {
  const { label, ...rest } = init
  let response: Response
  try {
    response = await fetch(url, { ...rest, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (error) {
    const timeout = (error as { name?: string }).name === "TimeoutError"
    throw new DriverError(timeout ? `${label} took too long to answer.` : `${label} could not be reached.`, "upstream")
  }
  if (response.status === 401 || response.status === 403) {
    const detail = await response.text().catch(() => "")
    const reason = extractUpstreamError(detail)
    const cleanReason = reason ? ` (${reason.slice(0, 180)})` : ""
    if (/rateLimitExceeded|userRateLimitExceeded|quota/i.test(detail)) {
      throw new DriverError(`${label} is temporarily rate-limiting requests. Try again in a moment.`, "upstream")
    }
    throw new DriverError(`${label} rejected the credentials (${response.status})${cleanReason}. Reconnect it.`, "auth")
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    const reason = extractUpstreamError(detail)
    throw new DriverError(`${label} answered ${response.status}${reason ? `: ${reason.slice(0, 160)}` : "."}`, "upstream")
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** Parses the `location` setting: `Name|lat|lon|timezone`. */
export function parseLocation(value: string | undefined): { name: string; lat: number; lon: number; timeZone: string | null } {
  const [name, lat, lon, tz] = (value ?? "").split("|")
  const la = Number(lat)
  const lo = Number(lon)
  if (!name || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
    throw new DriverError("Pick a location in this service's settings.", "config")
  }
  return { name, lat: la, lon: lo, timeZone: tz || null }
}

export function list(value: string | undefined, max: number): string[] {
  return (value ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max)
}
