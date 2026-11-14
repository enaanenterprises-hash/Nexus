import "server-only"
import type { CommandItemInput } from "../kinds"
import { apiJson, list } from "./http"
import { DriverError, type ConnectorDriver } from "./types"

const PAIR = /^([A-Z]{3})\s*\/\s*([A-Z]{3})$/
const COIN = /^[a-z0-9-]{2,40}$/

function pairs(value: string | undefined) {
  return list(value?.toUpperCase(), 8).flatMap((p) => {
    const m = PAIR.exec(p)
    return m ? [{ base: m[1]!, quote: m[2]! }] : []
  })
}

function coins(value: string | undefined) {
  return list(value?.toLowerCase(), 8).filter((c) => COIN.test(c))
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`

function price(v: number): string {
  if (v >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 })
  if (v >= 1) return v.toFixed(2)
  return v.toPrecision(4)
}

/** Frankfurter (ECB reference rates, business days) and CoinGecko (crypto, 24h). Both keyless. */
export const marketsDriver: ConnectorDriver = {
  id: "markets",
  async verify(ctx) {
    if (pairs(ctx.settings["fx"]).length + coins(ctx.settings["crypto"]).length === 0) {
      throw new DriverError("Add at least one currency pair (USD/EUR) or coin id (bitcoin).", "config")
    }
  },
  async fetch(ctx) {
    const items: CommandItemInput[] = []
    const fx = pairs(ctx.settings["fx"])
    const bases = [...new Set(fx.map((p) => p.base))]
    const from = new Date(ctx.now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10)
    for (const base of bases) {
      const quotes = fx.filter((p) => p.base === base).map((p) => p.quote)
      const series = await apiJson<{ rates: Record<string, Record<string, number>> }>(
        `https://api.frankfurter.dev/v1/${from}..?base=${base}&symbols=${quotes.join(",")}`,
        { label: "Frankfurter" },
      )
      const days = Object.keys(series.rates).sort()
      const last = days.at(-1)
      const prev = days.at(-2)
      if (!last) continue
      for (const quote of quotes) {
        const value = series.rates[last]?.[quote]
        if (value === undefined) continue
        const before = prev ? series.rates[prev]?.[quote] : undefined
        const change = before ? ((value - before) / before) * 100 : null
        items.push({
          kind: "command.signal",
          title: `${base}/${quote}`,
          externalId: `fx.${base}-${quote}`,
          url: `https://www.frankfurter.app/`,
          data: {
            metric: `market.fx.${base}-${quote}`,
            value,
            unit: quote,
            display: value >= 10 ? value.toFixed(2) : value.toFixed(4),
            change,
            status: "neutral",
            observedAt: new Date(`${last}T16:00:00Z`).toISOString(),
            details: { kind: "fx", base, quote, changeLabel: change === null ? null : pct(change), asOf: last },
          },
        })
      }
    }

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
