/** One overview page: 4 columns by 2 rows. A widget that does not fit is not placed. */

export const OVERVIEW_COLUMNS = 4
export const OVERVIEW_ROWS = 2

export const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"

export interface WidgetDef {
  id: string
  name: string
  blurb: string
  /** Cells wide and tall on the one overview page. */
  w: number
  h: number
  /** Connector this widget reads. Weather still works with none connected. */
  connectorId: string
  needsConnection: boolean
}

export const COMMAND_WIDGETS: readonly WidgetDef[] = [
  { id: "gmail", name: "Gmail", blurb: "Inbox, rich formatting compose, and replies.", w: 2, h: 1, connectorId: "gmail", needsConnection: true },
  { id: "calendar", name: "Calendar", blurb: "Full 30-day calendar synced with Google Calendar.", w: 2, h: 2, connectorId: "google-calendar", needsConnection: true },
  { id: "weather", name: "Weather", blurb: "Live forecast, wind, rain & hourly view.", w: 1, h: 1, connectorId: "weather", needsConnection: false },
  { id: "tasks", name: "Tasks", blurb: "Check off and add Google Tasks.", w: 1, h: 1, connectorId: "google-tasks", needsConnection: true },
  { id: "crypto", name: "Crypto", blurb: "Live prices, 24h delta, and coin list.", w: 2, h: 1, connectorId: "markets", needsConnection: true },
  { id: "sky", name: "Night sky", blurb: "Moon phase, sunset, dark sky window.", w: 1, h: 1, connectorId: "sky", needsConnection: true },
  { id: "f1", name: "Formula 1", blurb: "Grand Prix countdown and sessions.", w: 2, h: 1, connectorId: "f1", needsConnection: true },
  { id: "uptime", name: "Uptime", blurb: "Site latency, HTTP codes, and status.", w: 2, h: 1, connectorId: "uptime", needsConnection: true },
  { id: "github", name: "GitHub", blurb: "Reviews, issues, PRs, and pushes.", w: 2, h: 1, connectorId: "github", needsConnection: true },
  { id: "strava", name: "Strava", blurb: "Latest workout metrics and weekly load.", w: 1, h: 1, connectorId: "strava", needsConnection: true },
  { id: "vercel", name: "Vercel", blurb: "Deployments, branches, and build health.", w: 1, h: 1, connectorId: "vercel", needsConnection: true },
]

const BY_ID = new Map(COMMAND_WIDGETS.map((w) => [w.id, w]))

export function widgetDef(id: string): WidgetDef | undefined {
  return BY_ID.get(id)
}

export interface PlacedWidget {
  id: string
  x: number
  y: number
  w: number
  h: number
}

function fitsAt(grid: boolean[][], x: number, y: number, w: number, h: number) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (grid[y + dy]?.[x + dx]) return false
    }
  }
  return true
}

/** Places widgets in order. Ones that do not fit on this page are left out. */
export function placeWidgets(ids: readonly string[]): PlacedWidget[] {
  const grid = Array.from({ length: OVERVIEW_ROWS }, () => Array<boolean>(OVERVIEW_COLUMNS).fill(false))
  const placed: PlacedWidget[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) continue
    const def = BY_ID.get(id)
    if (!def) continue
    seen.add(id)
    let spot: { x: number; y: number } | null = null
    for (let y = 0; y <= OVERVIEW_ROWS - def.h && !spot; y++) {
      for (let x = 0; x <= OVERVIEW_COLUMNS - def.w && !spot; x++) {
        if (fitsAt(grid, x, y, def.w, def.h)) spot = { x, y }
      }
    }
    if (!spot) continue
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) grid[spot.y + dy]![spot.x + dx] = true
    placed.push({ id, x: spot.x, y: spot.y, w: def.w, h: def.h })
  }
  return placed
}

export function overviewAccepts(current: readonly string[], id: string) {
  if (current.includes(id) || !BY_ID.has(id)) return false
  return placeWidgets([...current, id]).some((p) => p.id === id)
}

/** Drops unknown ids, duplicates, and anything that does not fit. */
export function normalizeOverview(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return placeWidgets(input.filter((id): id is string => typeof id === "string")).map((p) => p.id)
}

/** Computes a valid reordered widget list when dragging one widget onto another or onto the end of the board. */
export function reorderOverviewWidgets(
  current: readonly string[],
  draggedId: string,
  targetId: string | "__end__",
): string[] | null {
  const from = current.indexOf(draggedId)
  if (from < 0) return null

  const fitsAll = (candidate: string[]) => placeWidgets(candidate).length === current.length

  if (targetId === "__end__") {
    const next = [...current.filter((id) => id !== draggedId), draggedId]
    const sameOrder = next.every((id, index) => id === current[index])
    return !sameOrder && fitsAll(next) ? next : null
  }

  const to = current.indexOf(targetId)
  if (to < 0 || from === to) return null

  const draggedDef = BY_ID.get(draggedId)
  const targetDef = BY_ID.get(targetId)
  const sameSize = draggedDef && targetDef && draggedDef.w === targetDef.w && draggedDef.h === targetDef.h

  const swapped = [...current]
  ;[swapped[from], swapped[to]] = [swapped[to]!, swapped[from]!]

  const inserted = [...current]
  const [moved] = inserted.splice(from, 1)
  if (!moved) return null
  inserted.splice(to, 0, moved)

  const candidates = sameSize ? [swapped, inserted] : [inserted, swapped]
  for (const candidate of candidates) {
    if (fitsAll(candidate)) return candidate
  }
  return null
}
