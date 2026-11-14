import "server-only"
import type { CommandItemInput } from "../kinds"
import { parseReceipt } from "../parsers/receipt"
import { apiJson } from "./http"
import { accessToken } from "./oauth"
import { localDay, startOfLocalDay, zonedDate } from "./time"
import { DriverError, type ConnectorDriver, type DriverContext } from "./types"

async function google<T>(ctx: DriverContext, url: string, init: RequestInit = {}) {
  const token = await accessToken(ctx, "google")
  return apiJson<T>(url, { ...init, label: "Google", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers } })
}

// ——— Calendar ———

interface GEvent {
  id: string
  status: string
  summary?: string
  htmlLink: string
  location?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
}

const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

const localClock = (iso: string, timeZone: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" })

export const CALENDAR_DAYS = 30

/** The next 30 days of the primary calendar; books focus blocks for Deep work. */
export const googleCalendarDriver: ConnectorDriver = {
  id: "google-calendar",
  async verify(ctx) {
    await google(ctx, `${CAL}?maxResults=1`)
  },
  async fetch(ctx) {
    const start = startOfLocalDay(ctx.now, ctx.timeZone)
    const end = new Date(start.getTime() + CALENDAR_DAYS * 86_400_000)
    const params = new URLSearchParams({ timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250" })
    const { items = [] } = await google<{ items?: GEvent[] }>(ctx, `${CAL}?${params}`)
    return items.map((e): CommandItemInput => {
      const allDay = !e.start.dateTime
      const startsAt = e.start.dateTime ?? zonedDate(e.start.date!, "00:00", ctx.timeZone).toISOString()
      const endsAt = e.end.dateTime ?? (e.end.date ? zonedDate(e.end.date, "00:00", ctx.timeZone).toISOString() : null)
      const title = e.summary ?? "(no title)"
      return {
        kind: "command.event",
        title,
        externalId: e.id,
        url: e.htmlLink,
        data: {
          startsAt,
          endsAt,
          allDay,
          location: e.location ?? null,
          category: /^focus\b/i.test(title) ? "focus" : "meeting",
          status: e.status === "cancelled" ? "cancelled" : e.status === "tentative" ? "tentative" : "confirmed",
        },
      }
    })
  },
  actions: {
    "calendar.block": async (ctx, params) => {
      const summary = String(params["title"] ?? "Focus")
      const startsAt = String(params["startsAt"])
      const endsAt = String(params["endsAt"])
      const event = await google<GEvent>(ctx, CAL, {
        method: "POST",
        body: JSON.stringify({
          summary,
          description: "Booked by Nexus Command for a deep-work session.",
          start: { dateTime: startsAt },
          end: { dateTime: endsAt },
          colorId: "5",
          transparency: "opaque",
        }),
      })
      return {
        detail: `Blocked ${localClock(startsAt, ctx.timeZone)}–${localClock(endsAt, ctx.timeZone)} on Google Calendar.`,
        items: [
          {
            kind: "command.event",
            title: summary,
            externalId: event.id,
            url: event.htmlLink,
            data: { startsAt, endsAt, allDay: false, location: null, category: "focus", status: "confirmed" },
          },
        ],
      }
    },
  },
}

// ——— Gmail ———

interface GPart {
  mimeType: string
  body?: { data?: string }
  parts?: GPart[]
}

interface GMessage {
  id: string
  threadId: string
  internalDate: string
  snippet: string
  labelIds?: string[]
  payload: GPart & { headers: { name: string; value: string }[] }
}

const decode = (data: string) => Buffer.from(data, "base64url").toString("utf8")

function textOf(part: GPart): string {
  if (part.mimeType === "text/plain" && part.body?.data) return decode(part.body.data)
  for (const p of part.parts ?? []) {
    const t = textOf(p)
    if (t) return t
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return decode(part.body.data).replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ")
  }
  return ""
}

/** The 25 most recent inbox messages from the last week. Bodies are kept only for receipts, so the receipt recipe can read them. */
export const gmailDriver: ConnectorDriver = {
  id: "gmail",
  async verify(ctx) {
    await google(ctx, "https://gmail.googleapis.com/gmail/v1/users/me/profile")
  },
  async fetch(ctx) {
    const q = encodeURIComponent("in:inbox newer_than:7d")
    const list = await google<{ messages?: { id: string }[] }>(ctx, `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=${q}`)
    const messages = await Promise.all(
      (list.messages ?? []).map((m) => google<GMessage>(ctx, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`)),
    )
    return messages.map((m): CommandItemInput => {
      const header = (name: string) => m.payload.headers.find((h) => h.name.toLowerCase() === name)?.value ?? ""
      const from = header("from")
      const subject = header("subject") || "(no subject)"
      const body = textOf(m.payload).replace(/\n{3,}/g, "\n\n").trim()
      const receipt = parseReceipt({ from, subject, body })
      return {
        kind: "command.message",
        title: subject,
        externalId: m.id,
        url: `https://mail.google.com/mail/u/0/#all/${m.id}`,
        data: {
          channel: "email",
          from,
          subject,
          snippet: m.snippet,
          body: receipt.isReceipt ? body.slice(0, 4000) : "",
          receivedAt: new Date(Number(m.internalDate)).toISOString(),
          labels: (m.labelIds ?? []).filter((l) => !l.startsWith("Label_") && !l.startsWith("CATEGORY_")),
          threadId: m.threadId || null,
          rfcMessageId: header("message-id") || null,
        },
      }
    })
  },
}

// ——— Sending ———

const ADDRESS = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/

/** Header values must not carry line breaks (header injection). Non-ASCII subjects use RFC 2047. */
function headerValue(value: string): string {
  const clean = value.replace(/[\r\n]+/g, " ").trim()
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`
}

export function parseRecipients(value: unknown): string[] {
  const list = String(value ?? "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (list.length === 0 || list.length > 20 || list.some((a) => !ADDRESS.test(a))) {
    throw new DriverError("Enter up to 20 valid email addresses, separated by commas.", "config")
  }
  return list
}

/** Builds an RFC 2822 message as base64url for `users.messages.send`. */
export function buildRawMessage(input: { to: string[]; cc: string[]; subject: string; body: string; inReplyTo?: string | null }): string {
  const lines = [
    `To: ${input.to.join(", ")}`,
    ...(input.cc.length ? [`Cc: ${input.cc.join(", ")}`] : []),
    `Subject: ${headerValue(input.subject)}`,
    ...(input.inReplyTo ? [`In-Reply-To: ${headerValue(input.inReplyTo)}`, `References: ${headerValue(input.inReplyTo)}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(input.body, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n"),
  ]
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url")
}

/** Send-only access (`gmail.send`). Reading stays on the separate Gmail connection. */
export const gmailSendDriver: ConnectorDriver = {
  id: "gmail-send",
  actions: {
    "mail.send": async (ctx, params) => {
      const to = parseRecipients(params["to"])
      const cc = params["cc"] ? parseRecipients(params["cc"]) : []
      const subject = String(params["subject"] ?? "").slice(0, 300)
      const body = String(params["body"] ?? "").slice(0, 50_000)
      if (!subject.trim() && !body.trim()) throw new DriverError("Write a subject or a message.", "config")
      const threadId = typeof params["threadId"] === "string" && params["threadId"] ? params["threadId"] : undefined
      const raw = buildRawMessage({ to, cc, subject, body, inReplyTo: typeof params["inReplyTo"] === "string" ? params["inReplyTo"] : null })
      const sent = await google<{ id: string; threadId: string }>(ctx, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
      })
      return { detail: `Sent to ${to.join(", ")}.`, sentId: sent.id }
    },
  },
}

// ——— Tasks ———

interface GTask {
  id: string
  title: string
  status: "needsAction" | "completed"
  due?: string
  completed?: string
  webViewLink?: string
  notes?: string
}

/** Open tasks across your first five lists, plus anything completed today. */
export const googleTasksDriver: ConnectorDriver = {
  id: "google-tasks",
  async verify(ctx) {
    await google(ctx, "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=1")
  },
  async fetch(ctx) {
    const { items: lists = [] } = await google<{ items?: { id: string; title: string }[] }>(ctx, "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=5")
    const today = localDay(ctx.now, ctx.timeZone)
    const out: CommandItemInput[] = []
    for (const list of lists) {
      const { items = [] } = await google<{ items?: GTask[] }>(
        ctx,
        `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id)}/tasks?maxResults=100&showCompleted=true&showHidden=true`,
      )
      for (const t of items) {
        if (!t.title?.trim()) continue
        const done = t.status === "completed"
        if (done && (!t.completed || localDay(new Date(t.completed), ctx.timeZone) !== today)) continue
        out.push({
          kind: "command.task",
          title: t.title,
          externalId: t.id,
          url: t.webViewLink ?? "https://tasks.google.com/",
          data: {
            status: done ? "done" : "open",
            priority: t.due && t.due.slice(0, 10) <= today ? "high" : "medium",
            // Google stores due dates without a time; treat them as end of that day locally.
            dueAt: t.due ? zonedDate(t.due.slice(0, 10), "23:59", ctx.timeZone).toISOString() : null,
            project: list.title,
            doneAt: done ? (t.completed ?? null) : null,
            goal: null,
          },
        })
      }
    }
    return out
  },
}
