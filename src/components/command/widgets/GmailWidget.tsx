"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { connectGoogleServices } from "@/lib/command/google-connect";
import type { CommandItemOf } from "@/lib/command/kinds";
import { GMAIL_READ_SCOPE, GMAIL_SEND_SCOPE } from "@/lib/command/widgets";
import { CommandRequestError, commandApi, type GmailLetter } from "../command-client";
import { relative } from "../format";
import { useNow } from "../parts";
import type { CommandController } from "../use-command";
import { WidgetFrame } from "./frame";

type MailItem = CommandItemOf<"command.message">;

type Draft = {
  to: string;
  cc: string;
  subject: string;
  body: string;
  threadId: string | null;
  inReplyTo: string | null;
  reply: boolean;
};

const senderName = (from: string) =>
  (/^([^<]+)</.exec(from)?.[1] ?? from).replace(/"/g, "").trim() || from;
const senderEmail = (from: string) =>
  /<([^>]+)>/.exec(from)?.[1]?.trim() ?? (from.includes("@") ? from.trim() : "");

export function GmailWidget({
  command,
  onRemove,
  style,
}: {
  command: CommandController;
  onRemove: () => void;
  style: CSSProperties;
}) {
  const state = command.state!;
  const now = useNow(30_000);
  const gmail = state.connections.find((c) => c.connectorId === "gmail") ?? null;
  const sending = state.connections.find((c) => c.connectorId === "gmail-send") ?? null;
  const messages = state.items
    .filter(
      (item): item is MailItem =>
        item.kind === "command.message" &&
        item.data.connectorId === "gmail" &&
        item.data.channel === "email",
    )
    .sort((a, b) => Date.parse(b.data.receivedAt) - Date.parse(a.data.receivedAt));
  const [openId, setOpenId] = useState<string | null>(null);
  const [letter, setLetter] = useState<GmailLetter | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const canSend = Boolean(sending && sending.status !== "needs_auth");

  async function openMessage(message: MailItem) {
    setDraft(null);
    setSent(null);
    setOpenId(message.id);
    setReadError(null);
    setLetter({
      id: message.data.externalId,
      threadId: message.data.threadId ?? null,
      from: message.data.from,
      subject: message.data.subject,
      snippet: message.data.snippet,
      body: message.data.body || message.data.snippet,
      receivedAt: message.data.receivedAt,
      rfcMessageId: message.data.rfcMessageId ?? null,
    });
    try {
      setLetter(await commandApi.readMail(message.data.externalId));
    } catch (error) {
      const code = error instanceof CommandRequestError ? error.code : undefined;
      const messageText = error instanceof Error ? error.message : "The message could not be read.";
      setReadError(
        code === "needs_auth" ? `Reading needs ${GMAIL_READ_SCOPE}. ${messageText}` : messageText,
      );
    }
  }

  function reply() {
    if (!letter) return;
    const subject = letter.subject.startsWith("Re:") ? letter.subject : `Re: ${letter.subject}`;
    setSendError(null);
    setSent(null);
    setDraft({
      to: senderEmail(letter.from),
      cc: "",
      subject,
      body: "",
      threadId: letter.threadId,
      inReplyTo: letter.rfcMessageId,
      reply: true,
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSendError(null);
    const failure = await command.sendMail({
      to: draft.to,
      cc: draft.cc.trim() || undefined,
      subject: draft.subject,
      body: draft.body,
      threadId: draft.threadId,
      inReplyTo: draft.inReplyTo,
    });
    if (failure) {
      setSendError(
        failure.includes(GMAIL_SEND_SCOPE) ? failure : `Sending needs ${GMAIL_SEND_SCOPE}. ${failure}`,
      );
      return;
    }
    setSent(draft.reply ? `Reply sent to ${draft.to}.` : `Sent to ${draft.to}.`);
    setDraft(null);
  }

  return (
    <WidgetFrame title="Gmail" hint="Inbox" onRemove={onRemove} style={style}>
      {!gmail ? (
        <div className="cmd-widget-empty">
          <p>Your inbox shows here after Gmail is connected. Nothing is invented before that.</p>
          <p className="cmd-scope">Reading needs {GMAIL_READ_SCOPE}</p>
          <Button
            type="button"
            size="sm"
            className="mt-1 w-fit border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
            onClick={() => void connectGoogleServices(["gmail"])}
          >
            Connect Gmail
          </Button>
        </div>
      ) : (
        <div className="cmd-gmail">
          <div className="cmd-gmail-list">
            {gmail.status === "needs_auth" ? (
              <Alert variant="destructive" className="mb-2 rounded-xl py-2">
                <AlertDescription className="text-xs">
                  Reading needs {GMAIL_READ_SCOPE}. {gmail.lastError ?? "Reconnect Gmail."}
                </AlertDescription>
              </Alert>
            ) : null}
            {gmail.status !== "ok" && gmail.status !== "needs_auth" && gmail.lastError ? (
              <Alert variant="destructive" className="mb-2 rounded-xl py-2">
                <AlertDescription className="text-xs">{gmail.lastError}</AlertDescription>
              </Alert>
            ) : null}
            {messages.length === 0 ? (
              <p className="cmd-empty">No inbox messages from the last week.</p>
            ) : null}
            {messages.map((message) => (
              <button
                key={message.id}
                type="button"
                className={`cmd-gmail-row ${openId === message.id ? "cmd-gmail-row--on" : ""}`}
                onClick={() => void openMessage(message)}
              >
                <span className="cmd-gmail-from">{senderName(message.data.from)}</span>
                <span className="cmd-gmail-time">{relative(message.data.receivedAt, now)}</span>
                <span className="cmd-gmail-subject">{message.data.subject || "(no subject)"}</span>
              </button>
            ))}
          </div>
          <div className="cmd-gmail-read">
            <div className="flex items-center justify-between gap-2">
              {sent ? <p className="text-[12px] text-[color:var(--land-ink)]">{sent}</p> : <span />}
              <button
                type="button"
                className="cmd-link text-[13px]"
                onClick={() => {
                  setLetter(null);
                  setOpenId(null);
                  setSendError(null);
                  setSent(null);
                  setDraft({
                    to: "",
                    cc: "",
                    subject: "",
                    body: "",
                    threadId: null,
                    inReplyTo: null,
                    reply: false,
                  });
                }}
              >
                New message
              </button>
            </div>
            {draft ? (
              canSend ? (
                <form onSubmit={(event) => void submit(event)} className="space-y-2">
                  <p className="mt-2 text-[13px] font-medium">
                    {draft.reply ? "Reply" : "New message"}
                  </p>
                  <label className="cmd-gmail-field">
                    <span>To</span>
                    <Input
                      className="cmd-field h-8 rounded-lg border border-border bg-background/40"
                      value={draft.to}
                      onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                      required
                      autoComplete="off"
                    />
                  </label>
                  <label className="cmd-gmail-field">
                    <span>Subject</span>
                    <Input
                      className="cmd-field h-8 rounded-lg border border-border bg-background/40"
                      value={draft.subject}
                      onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                      maxLength={300}
                      autoComplete="off"
                    />
                  </label>
                  <Textarea
                    className="cmd-field mt-2 min-h-24 w-full rounded-xl border border-border bg-background/40"
                    value={draft.body}
                    onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                    placeholder="Write your message"
                    maxLength={50000}
                  />
                  {sendError ? (
                    <Alert variant="destructive" className="rounded-xl py-2">
                      <AlertDescription className="text-xs">{sendError}</AlertDescription>
                    </Alert>
                  ) : null}
                  <Button
                    type="submit"
                    size="sm"
                    className="border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
                    disabled={command.pending === "mail" || !draft.to.trim()}
                  >
                    {command.pending === "mail" ? "Sending…" : "Send"}
                  </Button>
                </form>
              ) : (
                <div className="cmd-widget-empty">
                  <p>Sending and replying need their own Google permission. Reading stays read-only.</p>
                  <p className="cmd-scope">Sending needs {GMAIL_SEND_SCOPE}</p>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-1 w-fit border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
                    onClick={() => void connectGoogleServices(["gmail-send"])}
                  >
                    Allow sending
                  </Button>
                </div>
              )
            ) : letter ? (
              <>
                <p className="mt-2 text-[15px] font-medium">{letter.subject}</p>
                <p className="text-[12px] text-[color:var(--land-faint)]">
                  {letter.from} · {relative(letter.receivedAt, now)}
                </p>
                {readError ? <p className="cmd-error mt-2">{readError}</p> : null}
                <p className="cmd-gmail-body">{letter.body || letter.snippet}</p>
                <button type="button" className="cmd-link mt-3 text-[13px]" onClick={reply}>
                  Reply
                </button>
              </>
            ) : (
              <p className="cmd-empty mt-6">Open a message, or write a new one.</p>
            )}
          </div>
        </div>
      )}
    </WidgetFrame>
  );
}
