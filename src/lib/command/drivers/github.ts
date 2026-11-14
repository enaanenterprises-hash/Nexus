import "server-only"
import type { CommandItemInput } from "../kinds"
import { localDay } from "./time"
import { apiJson } from "./http"
import { DriverError, type ConnectorDriver, type DriverContext } from "./types"

interface SearchIssue {
  id: number
  number: number
  title: string
  html_url: string
  repository_url: string
  updated_at: string
  pull_request?: unknown
}

interface PushEvent {
  id: string
  type: string
  created_at: string
  repo: { name: string }
  payload: { size?: number; commits?: { message: string }[]; ref?: string }
}

function headers(ctx: DriverContext) {
  const token = ctx.credentials?.["token"]
  if (!token) throw new DriverError("Add a GitHub token.", "auth")
  return { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "Nexus-Command" }
}

const gh = <T>(ctx: DriverContext, path: string) => apiJson<T>(`https://api.github.com${path}`, { label: "GitHub", headers: headers(ctx) })

const repoOf = (url: string) => url.replace("https://api.github.com/repos/", "")

/** Review requests, assigned issues, your open PRs, and today's pushes. Fine-grained PAT, read-only. */
export const githubDriver: ConnectorDriver = {
  id: "github",
  async verify(ctx) {
    await gh(ctx, "/user")
  },
  async fetch(ctx) {
    const user = await gh<{ login: string }>(ctx, "/user")
    const search = (q: string) => gh<{ items: SearchIssue[] }>(ctx, `/search/issues?per_page=20&sort=updated&q=${encodeURIComponent(q)}`)
    const [reviews, assigned, mine, events] = await Promise.all([
      search("is:open is:pr archived:false review-requested:@me"),
      search("is:open is:issue archived:false assignee:@me"),
      search("is:open is:pr archived:false author:@me"),
      gh<PushEvent[]>(ctx, `/users/${encodeURIComponent(user.login)}/events?per_page=50`),
    ])
    const items: CommandItemInput[] = []
    const seen = new Set<number>()
    const task = (i: SearchIssue, priority: "high" | "medium" | "low", prefix: string) => {
      if (seen.has(i.id)) return
      seen.add(i.id)
      items.push({
        kind: "command.task",
        title: `${prefix}${i.title}`,
        externalId: `issue-${i.id}`,
        url: i.html_url,
        data: { status: "open", priority, dueAt: null, project: `${repoOf(i.repository_url)} #${i.number}`, doneAt: null, goal: null },
      })
    }
    for (const i of reviews.items) task(i, "high", "Review: ")
    for (const i of assigned.items) task(i, "medium", "")
    for (const i of mine.items) task(i, "low", "Your PR: ")

    const today = localDay(ctx.now, ctx.timeZone)
    const pushes = events.filter((e) => e.type === "PushEvent" && localDay(new Date(e.created_at), ctx.timeZone) === today)
    const byRepo = new Map<string, PushEvent[]>()
    for (const p of pushes) byRepo.set(p.repo.name, [...(byRepo.get(p.repo.name) ?? []), p])
    for (const [repo, list] of byRepo) {
      const commits = list.reduce((n, p) => n + (p.payload.size ?? p.payload.commits?.length ?? 0), 0)
      const first = list.at(-1)!
      const last = list[0]!
      items.push({
        kind: "command.activity",
        title: `Pushed ${commits} commit${commits === 1 ? "" : "s"} to ${repo}`,
        externalId: `push-${repo}-${today}`,
        url: `https://github.com/${repo}`,
        data: {
          activity: "commit",
          status: "completed",
          startedAt: first.created_at,
          endedAt: last.created_at,
          durationMin: null,
          metrics: { commits },
          detail: last.payload.commits?.at(-1)?.message.split("\n")[0] ?? null,
        },
      })
    }
    return items
  },
}
