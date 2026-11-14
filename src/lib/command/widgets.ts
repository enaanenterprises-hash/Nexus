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
  { id: "gmail", name: "Gmail", blurb: "Read, reply, and write mail.", w: 2, h: 2, connectorId: "gmail", needsConnection: true },
  { id: "calendar", name: "Calendar", blurb: "What is coming up.", w: 2, h: 1, connectorId: "google-calendar", needsConnection: true },
  { id: "weather", name: "Weather", blurb: "The sky outside, with no key.", w: 1, h: 1, connectorId: "weather", needsConnection: false },
  { id: "tasks", name: "Tasks", blurb: "Open tasks from Google Tasks.", w: 1, h: 2, connectorId: "google-tasks", needsConnection: true },
  { id: "crypto", name: "Crypto", blurb: "Prices and the day’s change.", w: 2, h: 1, connectorId: "markets", needsConnection: true },
  { id: "sky", name: "Night sky", blurb: "Sunset, darkness, and the moon.", w: 1, h: 1, connectorId: "sky", needsConnection: true },
  { id: "f1", name: "Formula 1", blurb: "The next Grand Prix sessions.", w: 2, h: 1, connectorId: "f1", needsConnection: true },
  { id: "uptime", name: "Uptime", blurb: "How fast your sites answer.", w: 2, h: 1, connectorId: "uptime", needsConnection: true },
  { id: "github", name: "GitHub", blurb: "Reviews, issues, and today’s pushes.", w: 2, h: 1, connectorId: "github", needsConnection: true },
  { id: "strava", name: "Strava", blurb: "The latest run or ride.", w: 1, h: 1, connectorId: "strava", needsConnection: true },
  { id: "vercel", name: "Vercel", blurb: "Recent deployments.", w: 1, h: 1, connectorId: "vercel", needsConnection: true },
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
