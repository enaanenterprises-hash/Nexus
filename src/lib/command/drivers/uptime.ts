import "server-only"
import { FetchPageError, fetchPublicPage } from "@/lib/research/safe-fetch"
import { assertFetchableUrl } from "@/lib/research/net-guard"
import type { CommandItemInput } from "../kinds"
import { list } from "./http"
import { DriverError, type ConnectorDriver } from "./types"

const MAX_SITES = 5

function sites(value: string | undefined): URL[] {
  return list(value, MAX_SITES).flatMap((raw) => {
    try {
      return [assertFetchableUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)]
    } catch {
      return []
    }
  })
}

/** Checks public sites through Research's SSRF-guarded fetch. A non-HTML 2xx still counts as up. */
export const uptimeDriver: ConnectorDriver = {
  id: "uptime",
  async verify(ctx) {
    if (sites(ctx.settings["urls"]).length === 0) throw new DriverError("Add at least one public https:// site to watch.", "config")
  },
  async fetch(ctx) {
    return Promise.all(
      sites(ctx.settings["urls"]).map(async (url): Promise<CommandItemInput> => {
        const started = performance.now()
        let up = true
        let code: string | number = 200
        try {
          const page = await fetchPublicPage(url.href)
          code = page.status
        } catch (error) {
          const e = error as FetchPageError
          if (e.code === "unsupported" || e.code === "too_large") code = 200
          else {
            up = false
            code = e.status ?? e.code ?? "error"
          }
        }
        const ms = Math.round(performance.now() - started)
        return {
          kind: "command.signal",
          title: url.host,
          externalId: `uptime.${url.host}`,
          url: url.href,
          data: {
            metric: `uptime.${url.host}`,
            value: up ? ms : null,
            unit: "ms",
            display: up ? `Up · ${ms} ms` : `Down · ${code}`,
            change: null,
            status: !up ? "poor" : ms > 2500 ? "fair" : "good",
            observedAt: ctx.now.toISOString(),
            details: { host: url.host, code, kind: "uptime" },
          },
        }
      }),
    )
  },
}
