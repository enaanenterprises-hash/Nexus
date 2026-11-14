import "server-only"
import type { CommandItemInput } from "../kinds"
import { apiJson, list } from "./http"
import { DriverError, type ConnectorDriver } from "./types"

const COIN = /^[a-z0-9-]{2,40}$/

function coins(value: string | undefined) {
  return list(value?.toLowerCase(), 8).filter((c) => COIN.test(c))
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`

function price(v: number): string {
  if (v >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 })
  if (v >= 1) return v.toFixed(2)
  return v.toPrecision(4)
}

/** CoinGecko prices with 24-hour change. Keyless. */
export const marketsDriver: ConnectorDriver = {
  id: "markets",
  async verify(ctx) {
    if (coins(ctx.settings["crypto"]).length === 0) throw new DriverError("Add at least one CoinGecko coin id, e.g. bitcoin.", "config")
  },
  async fetch(ctx) {
    const items: CommandItemInput[] = []
    const ids = coins(ctx.settings["crypto"])
    if (ids.length) {
      const prices = await apiJson<Record<string, { usd: number; usd_24h_change?: number; last_updated_at?: number }>>(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`,
        { label: "CoinGecko" },
      )
      for (const id of ids) {
        const p = prices[id]
        if (!p) continue
        const change = p.usd_24h_change ?? null
        items.push({
          kind: "command.signal",
          title: id.charAt(0).toUpperCase() + id.slice(1),
          externalId: `crypto.${id}`,
          url: `https://www.coingecko.com/en/coins/${id}`,
          data: {
            metric: `market.crypto.${id}`,
            value: p.usd,
            unit: "USD",
            display: `$${price(p.usd)}`,
            change,
            status: "neutral",
            observedAt: new Date((p.last_updated_at ?? ctx.now.getTime() / 1000) * 1000).toISOString(),
            details: { kind: "crypto", changeLabel: change === null ? null : pct(change), window: "24h" },
          },
        })
      }
    }
    return items
  },
}
