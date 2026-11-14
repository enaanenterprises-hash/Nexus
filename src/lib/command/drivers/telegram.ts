import "server-only"
import { apiJson } from "./http"
import { DriverError, type ConnectorDriver, type DriverContext } from "./types"

function bot(ctx: DriverContext) {
  const token = ctx.credentials?.["botToken"]?.trim()
  const chatId = ctx.credentials?.["chatId"]?.trim()
  if (!token || !/^\d+:[\w-]+$/.test(token)) throw new DriverError("That doesn't look like a bot token from @BotFather.", "auth")
  if (!chatId || !/^-?\d+$/.test(chatId)) throw new DriverError("Add the numeric chat id.", "config")
  return { base: `https://api.telegram.org/bot${token}`, chatId }
}

/** Alerts through the user's own Telegram bot. */
export const telegramDriver: ConnectorDriver = {
  id: "telegram",
  async verify(ctx) {
    const { base, chatId } = bot(ctx)
    await apiJson(`${base}/sendMessage`, {
      label: "Telegram",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: "Nexus Command is connected. Automations will send alerts here." }),
    })
  },
  actions: {
    "notify.send": async (ctx, params) => {
      const { base, chatId } = bot(ctx)
      const text = String(params["text"] ?? "Nexus Command alert").slice(0, 3500)
      await apiJson(`${base}/sendMessage`, {
        label: "Telegram",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      })
      return { detail: "Sent to Telegram." }
    },
  },
}
