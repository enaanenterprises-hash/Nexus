import "server-only"
import { randomBytes } from "crypto"
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
    return htmlToPlainText(decode(part.body.data))
  }
  return ""
}

function htmlOf(part: GPart): string {
  if (part.mimeType === "text/html" && part.body?.data) return decode(part.body.data)
  for (const p of part.parts ?? []) {
    const h = htmlOf(p)
    if (h) return h
  }
  return ""
}

const SAFE_EMAIL_TAGS = new Set([
  "p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "del",
  "blockquote", "pre", "code", "ul", "ol", "li", "h1", "h2", "h3", "hr", "a",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "img",
])
const VOID_EMAIL_TAGS = new Set(["br", "hr", "img"])
const BLOCK_SPACE_TAGS = new Set(["section", "article", "header", "footer"])

function escapeHtmlAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function safeHref(raw: string): string | null {
  const clean = raw.replace(/[\u0000-\u001f\u007f]+/g, "").trim()
  if (/^(https?:\/\/|mailto:)/i.test(clean)) return clean
  return null
}

function safeImgSrc(raw: string): string | null {
  const clean = raw.replace(/[\u0000-\u001f\u007f]+/g, "").trim()
  if (/^https:\/\//i.test(clean)) return clean
  return null
}

function extractAttr(attrs: string, name: string): string {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attrs)
  return m?.[1] ?? m?.[2] ?? m?.[3] ?? ""
}

/** Strips active content and unsafe attributes while preserving structural email markup, tables, and HTTPS images. */
export function sanitizeEmailHtml(rawHtml: string): string {
  const stripped = rawHtml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head|title|meta|link|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|head|title|meta|link|iframe|object|embed|svg|math)\b[^>]*\/?>/gi, "")

  const tokens: string[] = []
  const re = /<\/?([a-zA-Z0-9]+)(?:\s+([^>]*))?\/?>|([^<]+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(stripped)) !== null) {
    if (match[3] !== undefined) {
      tokens.push(match[3].replaceAll("<", "&lt;").replaceAll(">", "&gt;"))
      continue
    }
    const rawName = (match[1] ?? "").toLowerCase()
    const isClose = match[0].startsWith("</")
    if (!SAFE_EMAIL_TAGS.has(rawName)) {
      if (isClose && BLOCK_SPACE_TAGS.has(rawName)) tokens.push("<br>")
      continue
    }
    if (rawName === "img") {
      if (!isClose) {
        const attrs = match[2] ?? ""
        const src = safeImgSrc(extractAttr(attrs, "src"))
        if (src) {
          const alt = extractAttr(attrs, "alt").slice(0, 140)
          tokens.push(`<img src="${escapeHtmlAttr(src)}"${alt ? ` alt="${escapeHtmlAttr(alt)}"` : ""}>`)
        }
      }
      continue
    }
    if (VOID_EMAIL_TAGS.has(rawName)) {
      if (!isClose) tokens.push(`<${rawName}>`)
      continue
    }
    if (isClose) {
      tokens.push(`</${rawName}>`)
      continue
    }
    if (rawName === "a") {
      const href = safeHref(extractAttr(match[2] ?? "", "href"))
      if (href) {
        tokens.push(`<a href="${escapeHtmlAttr(href)}" target="_blank" rel="noopener noreferrer">`)
      }
      continue
    }
    tokens.push(`<${rawName}>`)
  }
  return tokens.join("").trim()
}

export function htmlToPlainText(rawHtml: string): string {
  return rawHtml
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Fetches up to 25 recent inbox messages in throttled batches so rate limits or single-message blips do not abort sync. */
export const gmailDriver: ConnectorDriver = {
  id: "gmail",
  async verify(ctx) {
    await google(ctx, "https://gmail.googleapis.com/gmail/v1/users/me/profile")
  },
  async fetch(ctx) {
    const q = encodeURIComponent("in:inbox")
    const list = await google<{ messages?: { id: string }[] }>(
      ctx,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=${q}`,
    )
    const ids = list.messages ?? []
    if (ids.length === 0) return []

    const messages: GMessage[] = []
    let firstError: unknown = null
    const BATCH_SIZE = 5
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const chunk = ids.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        chunk.map((m) =>
          google<GMessage>(ctx, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`),
        ),
      )
      for (const res of results) {
        if (res.status === "fulfilled") messages.push(res.value)
        else if (!firstError) firstError = res.reason
      }
    }
    if (messages.length === 0 && firstError) throw firstError

    return messages.map((m): CommandItemInput => {
      const header = (name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? ""
      const from = header("from")
      const subject = header("subject") || "(no subject)"
      const body = textOf(m.payload).replace(/\n{3,}/g, "\n\n").trim()
      const receipt = parseReceipt({ from, subject, body })
      const preview = body.slice(0, 1200)
      return {
        kind: "command.message",
        title: subject,
        externalId: m.id,
        url: `https://mail.google.com/mail/u/0/#all/${m.id}`,
        data: {
          channel: "email",
          from,
          subject,
          snippet: m.snippet || preview.slice(0, 200),
          body: receipt.isReceipt ? body.slice(0, 4000) : preview,
          receivedAt: new Date(Number(m.internalDate)).toISOString(),
          labels: (m.labelIds ?? []).filter((l) => !l.startsWith("Label_") && !l.startsWith("CATEGORY_")),
          threadId: m.threadId || null,
          rfcMessageId: header("message-id") || null,
        },
      }
    })
  },
}

/** One inbox message, body and sanitized HTML included, using the read-only Gmail grant. */
export async function fetchGmailMessage(ctx: DriverContext, id: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new DriverError("That message could not be opened.", "config")
  const m = await google<GMessage>(ctx, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`)
  const header = (name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? ""
  const body = textOf(m.payload).replace(/\n{3,}/g, "\n\n").trim()
  const rawHtml = htmlOf(m.payload)
  const sanitizedHtml = rawHtml ? sanitizeEmailHtml(rawHtml) : ""
  return {
    id: m.id,
    threadId: m.threadId || null,
    from: header("from"),
    subject: header("subject") || "(no subject)",
    snippet: m.snippet ?? "",
    body: body || m.snippet || "",
    bodyHtml: sanitizedHtml || null,
    receivedAt: new Date(Number(m.internalDate)).toISOString(),
    rfcMessageId: header("message-id") || null,
  }
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

/** Builds an RFC 2822 message as base64url for `users.messages.send` (multipart/alternative when HTML is present). */
export function buildRawMessage(input: {
  to: string[]
  cc: string[]
  bcc?: string[]
  subject: string
  body: string
  html?: string | null
  inReplyTo?: string | null
}): string {
  const safeHtml = input.html ? sanitizeEmailHtml(input.html) : ""
  const plainBody = input.body.trim() ? input.body : safeHtml ? htmlToPlainText(safeHtml) : ""
  const baseHeaders = [
    `To: ${input.to.join(", ")}`,
    ...(input.cc.length ? [`Cc: ${input.cc.join(", ")}`] : []),
    ...(input.bcc?.length ? [`Bcc: ${input.bcc.join(", ")}`] : []),
    `Subject: ${headerValue(input.subject)}`,
    ...(input.inReplyTo ? [`In-Reply-To: ${headerValue(input.inReplyTo)}`, `References: ${headerValue(input.inReplyTo)}`] : []),
    "MIME-Version: 1.0",
  ]

  if (safeHtml) {
    const boundary = `nexus_alt_${randomBytes(10).toString("hex")}`
    const wrappedHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#111827;">${safeHtml}</body></html>`
    const lines = [
      ...baseHeaders,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(plainBody, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n"),
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(wrappedHtml, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n"),
      `--${boundary}--`,
    ]
    return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url")
  }

  const lines = [
    ...baseHeaders,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(plainBody, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n"),
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
      const bcc = params["bcc"] ? parseRecipients(params["bcc"]) : []
      const subject = String(params["subject"] ?? "").slice(0, 300)
      const body = String(params["body"] ?? "").slice(0, 50_000)
      const html = typeof params["html"] === "string" ? params["html"].slice(0, 100_000) : null
      const plainCheck = body.trim() || (html ? htmlToPlainText(html).trim() : "")
      if (!subject.trim() && !plainCheck) throw new DriverError("Write a subject or a message.", "config")
      const threadId = typeof params["threadId"] === "string" && params["threadId"] ? params["threadId"] : undefined
      const raw = buildRawMessage({ to, cc, bcc, subject, body, html, inReplyTo: typeof params["inReplyTo"] === "string" ? params["inReplyTo"] : null })
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
            taskListId: list.id,
          },
        })
      }
    }
    return out
  },
}

/** Creates a task in Google Tasks (primary `@default` list by default). */
export async function createGoogleTask(
  ctx: DriverContext,
  input: { title: string; listId?: string | null; dueAt?: string | null },
): Promise<CommandItemInput> {
  const listId = input.listId?.trim() || "@default"
  const created = await google<GTask>(
    ctx,
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`,
    {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        ...(input.dueAt ? { due: input.dueAt } : {}),
      }),
    },
  )
  const today = localDay(ctx.now, ctx.timeZone)
  return {
    kind: "command.task",
    title: created.title || input.title,
    externalId: created.id,
    url: created.webViewLink ?? "https://tasks.google.com/",
    data: {
      status: created.status === "completed" ? "done" : "open",
      priority: created.due && created.due.slice(0, 10) <= today ? "high" : "medium",
      dueAt: created.due ? zonedDate(created.due.slice(0, 10), "23:59", ctx.timeZone).toISOString() : null,
      project: "My Tasks",
      doneAt: created.status === "completed" ? (created.completed ?? ctx.now.toISOString()) : null,
      goal: null,
      taskListId: listId,
    },
  }
}

/** Updates a Google Task's completion state via Tasks API v1. */
export async function toggleGoogleTask(
  ctx: DriverContext,
  input: { listId?: string | null; taskId: string; done: boolean },
) {
  const listId = input.listId?.trim() || "@default"
  return google<GTask>(
    ctx,
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(input.taskId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        id: input.taskId,
        status: input.done ? "completed" : "needsAction",
        completed: input.done ? ctx.now.toISOString() : null,
      }),
    },
  )
}
