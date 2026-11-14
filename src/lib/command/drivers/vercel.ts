import "server-only"
import type { CommandItemInput } from "../kinds"
import { apiJson } from "./http"
import { DriverError, type ConnectorDriver, type DriverContext } from "./types"

interface Deployment {
  uid: string
  name: string
  url: string
  state?: string
  readyState?: string
  created: number
  buildingAt?: number
  ready?: number
  target?: string | null
  meta?: { githubCommitMessage?: string; githubCommitRef?: string }
  inspectorUrl?: string
}

function call<T>(ctx: DriverContext, path: string) {
  const token = ctx.credentials?.["token"]
  if (!token) throw new DriverError("Add a Vercel access token.", "auth")
  const team = ctx.credentials?.["teamId"]?.trim()
  const sep = path.includes("?") ? "&" : "?"
  return apiJson<T>(`https://api.vercel.com${path}${team ? `${sep}teamId=${encodeURIComponent(team)}` : ""}`, {
    label: "Vercel",
    headers: { authorization: `Bearer ${token}` },
  })
}

const STATUS: Record<string, "completed" | "failed" | "in_progress"> = {
  READY: "completed",
  ERROR: "failed",
  CANCELED: "completed",
  BUILDING: "in_progress",
  QUEUED: "in_progress",
  INITIALIZING: "in_progress",
}

/** The last 20 deployments with their state. */
export const vercelDriver: ConnectorDriver = {
  id: "vercel",
  async verify(ctx) {
    await call(ctx, "/v6/deployments?limit=1")
  },
  async fetch(ctx) {
    const { deployments } = await call<{ deployments: Deployment[] }>(ctx, "/v6/deployments?limit=20")
    return deployments.map((d): CommandItemInput => {
      const state = (d.state ?? d.readyState ?? "QUEUED").toUpperCase()
      const status = STATUS[state] ?? "in_progress"
      const started = d.buildingAt ?? d.created
      const target = d.target === "production" ? "Production" : "Preview"
      return {
        kind: "command.activity",
        title: `${d.name} · ${target}${state === "CANCELED" ? " (canceled)" : ""}`,
        externalId: `deploy-${d.uid}`,
        url: d.inspectorUrl ?? `https://${d.url}`,
        data: {
          activity: "deploy",
          status,
          startedAt: new Date(started).toISOString(),
          endedAt: d.ready ? new Date(d.ready).toISOString() : null,
          durationMin: d.ready ? Math.max(0, Math.round(((d.ready - started) / 60_000) * 10) / 10) : null,
          metrics: {},
          detail: [d.meta?.githubCommitRef, d.meta?.githubCommitMessage?.split("\n")[0]].filter(Boolean).join(" · ") || state.toLowerCase(),
        },
      }
    })
  },
}
