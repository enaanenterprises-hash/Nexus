import "server-only"
import type { CommandItemInput } from "../kinds"
import { apiJson } from "./http"
import type { ConnectorDriver } from "./types"

type Session = { date: string; time?: string }

interface Race extends Partial<Record<"FirstPractice" | "SecondPractice" | "ThirdPractice" | "SprintQualifying" | "SprintShootout" | "Sprint" | "Qualifying", Session>> {
  season: string
  round: string
  url: string
  raceName: string
  date: string
  time?: string
  Circuit: { circuitName: string; Location: { locality: string; country: string } }
}

const SESSIONS: { key: keyof Race; label: string; minutes: number }[] = [
  { key: "FirstPractice", label: "Practice 1", minutes: 60 },
  { key: "SecondPractice", label: "Practice 2", minutes: 60 },
  { key: "ThirdPractice", label: "Practice 3", minutes: 60 },
  { key: "SprintQualifying", label: "Sprint Qualifying", minutes: 45 },
  { key: "SprintShootout", label: "Sprint Shootout", minutes: 45 },
  { key: "Sprint", label: "Sprint", minutes: 60 },
  { key: "Qualifying", label: "Qualifying", minutes: 60 },
]

/** Next Grand Prix weekend from Jolpica (the community successor to the Ergast API). Keyless. */
export const f1Driver: ConnectorDriver = {
  id: "f1",
  async fetch() {
    const data = await apiJson<{ MRData: { RaceTable: { Races: Race[] } } }>("https://api.jolpi.ca/ergast/f1/current/next.json", { label: "Jolpica F1" })
    const race = data.MRData.RaceTable.Races[0]
    if (!race) return []
    const short = race.raceName.replace("Grand Prix", "GP")
    const location = `${race.Circuit.circuitName}, ${race.Circuit.Location.locality}`
    const sessions = [
      ...SESSIONS.flatMap((s) => {
        const session = race[s.key] as Session | undefined
        return session ? [{ label: s.label, minutes: s.minutes, session }] : []
      }),
      { label: "Race", minutes: 120, session: { date: race.date, time: race.time } },
    ]
    return sessions.map(({ label, minutes, session }): CommandItemInput => {
      const start = new Date(`${session.date}T${session.time ?? "12:00:00Z"}`)
      return {
        kind: "command.event",
        title: `${short} · ${label}`,
        externalId: `${race.season}-${race.round}-${label.toLowerCase().replace(/\s+/g, "-")}`,
        url: race.url,
        data: {
          startsAt: start.toISOString(),
          endsAt: new Date(start.getTime() + minutes * 60_000).toISOString(),
          allDay: false,
          location,
          category: "sport",
          status: "confirmed",
        },
      }
    })
  },
}
