/** Offset of `timeZone` from UTC at `at`, in minutes. */
export function zoneOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  return Math.round((asUtc - at.getTime()) / 60_000)
}

/** `YYYY-MM-DD` + `HH:MM` wall time in `timeZone` → Date. */
export function zonedDate(day: string, time: string, timeZone: string): Date {
  const guess = new Date(`${day}T${time}:00Z`)
  const first = new Date(guess.getTime() - zoneOffsetMinutes(guess, timeZone) * 60_000)
  return new Date(guess.getTime() - zoneOffsetMinutes(first, timeZone) * 60_000)
}

export function localDay(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at)
}

export function startOfLocalDay(at: Date, timeZone: string): Date {
  return zonedDate(localDay(at, timeZone), "00:00", timeZone)
}
