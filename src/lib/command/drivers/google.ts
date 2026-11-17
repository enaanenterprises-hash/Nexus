import "server-only"
import { randomBytes } from "crypto"
import sanitizeHtml from "sanitize-html"
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
    const todayStart = startOfLocalDay(ctx.now, ctx.timeZone)
    const start = new Date(todayStart.getTime() - 35 * 86_400_000)
    const end = new Date(todayStart.getTime() + 65 * 86_400_000)
    const params = new URLSearchParams({ timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "500" })
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
  headers?: { name: string; value: string }[]
  body?: { data?: string; attachmentId?: string; size?: number }
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

function safeHref(raw: string): string | null {
  const clean = raw.replace(/[\u0000-\u001f\u007f]+/g, "").trim()
  if (/^(https?:\/\/|mailto:)/i.test(clean)) return clean
  return null
}

function safeImgSrc(raw: string): string | null {
  const clean = raw.replace(/[\u0000-\u001f\u007f]+/g, "").trim()
  if (/^(https?:\/\/|data:image\/(?:png|jpeg|jpg|gif|webp);base64,)/i.test(clean)) {
    return clean.replace(/^http:\/\//i, "https://")
  }
  return null
}

function sanitizeInlineCss(rawStyle: string): string {
  return rawStyle
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(?:expression|javascript|vbscript|behavior|-moz-binding)\s*\(?/gi, "")
    .replace(/@import\b[^;]*;?/gi, "")
    .replace(/url\s*\(\s*['"]?\s*(?!https?:\/\/)[^)]*\)/gi, "")
    .trim()
}

function sanitizeStyleSheet(rawCss: string): string {
  return rawCss
    .replace(/<!--|-->/g, "")
    .replace(/@import\b[^;]*;?/gi, "")
    .replace(/(?:expression|javascript|vbscript|behavior|-moz-binding)\s*\(?/gi, "")
    .replace(/url\s*\(\s*['"]?\s*(?!https?:\/\/)[^)]*\)/gi, "")
}

function stripEmailNoise(rawHtml: string): string {
  return rawHtml
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/(?:&zwnj;|&#8204;|&#x200c;|\u200c|\u200b|\ufeff)+(?:\s|&nbsp;|&#160;)*/gi, " ")
}

const INBOUND_ALLOWED_TAGS = [
  "html", "head", "body", "style",
  "div", "span", "p", "br", "hr", "center",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "del", "small", "sub", "sup",
  "blockquote", "pre", "code", "font",
  "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
  "a", "img", "figure", "figcaption", "picture", "source",
]

const SHARED_STYLE_ATTRS = [
  "style", "class", "id", "align", "valign", "bgcolor", "color",
  "width", "height", "dir", "role", "aria-label",
]

/** Strips active content while preserving real HTML email layout, CSS styles, tables, and images. */
export function sanitizeEmailHtml(rawHtml: string): string {
  const precleaned = stripEmailNoise(rawHtml)
  const cleaned = sanitizeHtml(precleaned, {
    allowedTags: INBOUND_ALLOWED_TAGS,
    allowVulnerableTags: true,
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "textarea", "option", "noscript", "title"],
    allowedAttributes: {
      "*": SHARED_STYLE_ATTRS,
      a: ["href", "target", "rel", "title", ...SHARED_STYLE_ATTRS],
      img: ["src", "srcset", "alt", "title", "border", ...SHARED_STYLE_ATTRS],
      source: ["srcset", "media", "type"],
      font: ["face", "size", "color", ...SHARED_STYLE_ATTRS],
      table: ["border", "cellpadding", "cellspacing", "summary", ...SHARED_STYLE_ATTRS],
      td: ["colspan", "rowspan", "nowrap", "background", ...SHARED_STYLE_ATTRS],
      th: ["colspan", "rowspan", "scope", "nowrap", "background", ...SHARED_STYLE_ATTRS],
      tr: ["background", ...SHARED_STYLE_ATTRS],
      body: ["background", ...SHARED_STYLE_ATTRS],
      style: ["type", "media"],
    },
    allowedSchemes: ["http", "https", "mailto", "data"],
    allowedSchemesByTag: {
      img: ["http", "https", "data"],
      a: ["http", "https", "mailto"],
    },
    textFilter: (text) => text,
    transformTags: {
      style: (tagName, attribs) => {
        const next: Record<string, string> = {}
        if (attribs.media) next.media = attribs.media
        return { tagName, attribs: next }
      },
      a: (tagName, attribs) => {
        const href = safeHref(attribs.href ?? "")
        const next: Record<string, string> = { ...attribs }
        if (next.style) next.style = sanitizeInlineCss(next.style)
        if (!href) {
          delete next.href
          return { tagName: "span", attribs: next }
        }
        next.href = href
        next.target = "_blank"
        next.rel = "noopener noreferrer"
        return { tagName, attribs: next }
      },
      img: (tagName, attribs) => {
        const src = safeImgSrc(attribs.src ?? "")
        if (!src) return { tagName: "span", attribs: { style: "display:none" } }
        const next: Record<string, string> = { ...attribs, src }
        if (next.style) next.style = sanitizeInlineCss(next.style)
        return { tagName, attribs: next }
      },
      "*": (tagName, attribs) => {
        if (!attribs.style && !attribs.background) return { tagName, attribs }
        const next: Record<string, string> = { ...attribs }
        if (next.style) {
          const safeCss = sanitizeInlineCss(next.style)
          if (safeCss) next.style = safeCss
          else delete next.style
        }
        if (next.background && !/^https?:\/\//i.test(next.background.trim())) {
          delete next.background
        }
        return { tagName, attribs: next }
      },
    },
    exclusiveFilter: (frame) => {
      if (frame.tag === "style") {
        frame.text = sanitizeStyleSheet(frame.text)
      }
      return false
    },
  })
  return cleaned.trim()
}

function sanitizeOutboundEmailHtml(rawHtml: string): string {
  return sanitizeHtml(stripEmailNoise(rawHtml), {
    allowedTags: [
      "p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "del",
      "blockquote", "pre", "code", "ul", "ol", "li", "h1", "h2", "h3", "hr", "a",
    ],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    },
  }).trim()
}

export function htmlToPlainText(rawHtml: string): string {
  return stripEmailNoise(rawHtml)
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
  let rawHtml = htmlOf(m.payload)
  if (rawHtml && /cid:/i.test(rawHtml)) {
    const cidParts: Array<{ cid: string; mimeType: string; data?: string; attachmentId?: string }> = []
    const walk = (part: GPart) => {
      const contentId = part.headers?.find((h) => h.name.toLowerCase() === "content-id")?.value
      if (contentId && /^image\/(png|jpeg|jpg|gif|webp)$/i.test(part.mimeType)) {
        const cleanCid = contentId.replace(/^[<\s]+|[>\s]+$/g, "")
        if (cleanCid) {
          cidParts.push({
            cid: cleanCid,
            mimeType: part.mimeType,
            data: part.body?.data,
            attachmentId: part.body?.attachmentId,
          })
        }
      }
      for (const p of part.parts ?? []) walk(p)
    }
    walk(m.payload)
    for (const item of cidParts.slice(0, 12)) {
      let b64 = item.data
      if (!b64 && item.attachmentId) {
        const att = await google<{ data?: string }>(
          ctx,
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/attachments/${item.attachmentId}`,
        ).catch(() => null)
        b64 = att?.data
      }
      if (b64 && b64.length < 1_500_000) {
        const std = b64.replaceAll("-", "+").replaceAll("_", "/")
        rawHtml = rawHtml.replaceAll(`cid:${item.cid}`, `data:${item.mimeType};base64,${std}`)
      }
    }
  }
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
  const safeHtml = input.html ? sanitizeOutboundEmailHtml(input.html) : ""
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
