"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Forward,
  Mail,
  Maximize2,
  RefreshCw,
  Reply,
  Search,
  SquarePen,
  X,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { connectGoogleServices } from "@/lib/command/google-connect";
import type { CommandItemOf } from "@/lib/command/kinds";
import { GMAIL_READ_SCOPE, GMAIL_SEND_SCOPE } from "@/lib/command/widgets";
import { CommandRequestError, commandApi, type GmailLetter } from "../command-client";
import { relative } from "../format";
import { useNow } from "../parts";
import {
  buildQuotedMailHtml,
  RichMailDialog,
  SafeEmailContent,
  type MailDraft,
} from "../RichMailEditor";
import type { CommandController } from "../use-command";
import { WidgetFrame } from "./frame";

type MailItem = CommandItemOf<"command.message">;

const senderName = (from: string) =>
  (/^([^<]+)</.exec(from)?.[1] ?? from).replace(/"/g, "").trim() || from;

const senderEmail = (from: string) =>
  /<([^>]+)>/.exec(from)?.[1]?.trim() ?? (from.includes("@") ? from.trim() : "");

const senderInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
};

const isUnread = (message: MailItem) => message.data.labels.includes("UNREAD");

function createDraft(overrides: Partial<MailDraft> = {}): MailDraft {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    html: "",
    initialHtml: "",
    threadId: null,
    inReplyTo: null,
    mode: "compose",
    ...overrides,
  };
}

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
  const canSend = Boolean(sending && sending.status !== "needs_auth");

  const messages = useMemo(
    () =>
      state.items
        .filter(
          (item): item is MailItem =>
            item.kind === "command.message" &&
            item.data.connectorId === "gmail" &&
            item.data.channel === "email",
        )
        .sort((a, b) => Date.parse(b.data.receivedAt) - Date.parse(a.data.receivedAt)),
    [state.items],
  );

  const unreadCount = useMemo(
    () => messages.reduce((count, msg) => count + (isUnread(msg) ? 1 : 0), 0),
    [messages],
  );

  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [query, setQuery] = useState("");
  const [openMessage, setOpenMessage] = useState<MailItem | null>(null);
  const [letter, setLetter] = useState<GmailLetter | null>(null);
  const [loadingLetter, setLoadingLetter] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [readerModalOpen, setReaderModalOpen] = useState(false);
  const [draft, setDraft] = useState<MailDraft | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentNotice, setSentNotice] = useState<string | null>(null);

  const visibleMessages = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages.filter((msg) => {
      if (filter === "unread" && !isUnread(msg)) return false;
      if (!q) return true;
      const from = msg.data.from.toLowerCase();
      const subj = msg.data.subject.toLowerCase();
      const snip = msg.data.snippet.toLowerCase();
      return from.includes(q) || subj.includes(q) || snip.includes(q);
    });
  }, [messages, filter, query]);

  async function selectMessage(message: MailItem) {
    setSentNotice(null);
    setOpenMessage(message);
    setReadError(null);
    setLoadingLetter(true);
    setLetter({
      id: message.data.externalId,
      threadId: message.data.threadId ?? null,
      from: message.data.from,
      subject: message.data.subject,
      snippet: message.data.snippet,
      body: message.data.body || message.data.snippet,
      bodyHtml: null,
      receivedAt: message.data.receivedAt,
      rfcMessageId: message.data.rfcMessageId ?? null,
    });
    try {
      const full = await commandApi.readMail(message.data.externalId);
      setLetter(full);
    } catch (error) {
      const code = error instanceof CommandRequestError ? error.code : undefined;
      const messageText = error instanceof Error ? error.message : "The message could not be read.";
      setReadError(
        code === "needs_auth" ? `Reading needs ${GMAIL_READ_SCOPE}. ${messageText}` : messageText,
      );
    } finally {
      setLoadingLetter(false);
    }
  }

  function startCompose() {
    setSendError(null);
    setSentNotice(null);
    setDraft(createDraft({ mode: "compose" }));
  }

  function startReplyFrom(target: {
    from: string;
    subject: string;
    body: string;
    receivedAt: string;
    threadId?: string | null;
    rfcMessageId?: string | null;
  }) {
    const subject = /^re:/i.test(target.subject) ? target.subject : `Re: ${target.subject}`;
    setSendError(null);
    setSentNotice(null);
    setReaderModalOpen(false);
    setDraft(
      createDraft({
        mode: "reply",
        to: senderEmail(target.from),
        subject,
        threadId: target.threadId ?? null,
        inReplyTo: target.rfcMessageId ?? null,
        initialHtml: buildQuotedMailHtml({
          from: target.from,
          date: relative(target.receivedAt, now),
          text: target.body,
        }),
      }),
    );
  }

  function startForwardFrom(target: {
    from: string;
    subject: string;
    body: string;
    receivedAt: string;
  }) {
    const subject = /^fwd?:/i.test(target.subject) ? target.subject : `Fwd: ${target.subject}`;
    setSendError(null);
    setSentNotice(null);
    setReaderModalOpen(false);
    setDraft(
      createDraft({
        mode: "forward",
        to: "",
        subject,
        initialHtml: buildQuotedMailHtml({
          from: target.from,
          date: relative(target.receivedAt, now),
          text: target.body,
        }),
      }),
    );
  }

  async function sendDraft() {
    if (!draft) return;
    setSendError(null);
    const failure = await command.sendMail({
      to: draft.to,
      cc: draft.cc.trim() || undefined,
      bcc: draft.bcc.trim() || undefined,
      subject: draft.subject,
      body: draft.body,
      html: draft.html || null,
      threadId: draft.threadId,
      inReplyTo: draft.inReplyTo,
    });
    if (failure) {
      setSendError(
        failure.includes(GMAIL_SEND_SCOPE) ? failure : `Sending needs ${GMAIL_SEND_SCOPE}. ${failure}`,
      );
      return;
    }
    setSentNotice(draft.mode === "reply" ? `Reply sent to ${draft.to}.` : `Sent to ${draft.to}.`);
    setDraft(null);
  }

  const headerActions = gmail ? (
    <>
      {unreadCount > 0 ? (
        <Badge
          variant="secondary"
          className="h-5 border border-[color:var(--land-gold)]/35 bg-[color:var(--land-gold)]/12 px-1.5 text-[10.5px] font-medium text-[color:var(--land-gold)] tabular-nums"
        >
          {unreadCount} unread
        </Badge>
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-6 rounded-md text-muted-foreground hover:text-foreground"
              onClick={() => void command.sync()}
              disabled={command.syncing}
              aria-label="Refresh inbox"
            >
              <RefreshCw className={`size-3.5 ${command.syncing ? "animate-spin" : ""}`} />
            </Button>
          }
        />
        <TooltipContent side="bottom">Refresh inbox</TooltipContent>
      </Tooltip>
      <Button
        type="button"
        size="xs"
        variant="secondary"
        className="h-6 gap-1 rounded-md border border-[color:var(--land-gold)]/35 bg-[color:var(--land-gold)]/14 px-2 text-[11px] font-medium text-foreground hover:bg-[color:var(--land-gold)]/24"
        onClick={startCompose}
      >
        <SquarePen className="size-3" />
        <span>Compose</span>
      </Button>
    </>
  ) : undefined;

  return (
    <WidgetFrame
      title="Gmail"
      icon={<Mail className="size-3.5" />}
      hint={gmail ? `${messages.length} msgs` : "Inbox"}
      actions={headerActions}
      onRemove={onRemove}
      style={style}
    >
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
      ) : openMessage && letter ? (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-2">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-6 gap-1 px-1.5 text-[11.5px] text-muted-foreground hover:text-foreground"
              onClick={() => {
                setOpenMessage(null);
                setLetter(null);
                setReadError(null);
              }}
            >
              <ArrowLeft className="size-3.5" />
              <span>Inbox</span>
            </Button>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="h-6 gap-1 px-2 text-[11.5px]"
                onClick={() => startReplyFrom(letter)}
              >
                <Reply className="size-3" />
                <span>Reply</span>
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="h-6 gap-1 px-2 text-[11.5px]"
                onClick={() => startForwardFrom(letter)}
              >
                <Forward className="size-3" />
                <span>Forward</span>
              </Button>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className="size-6 rounded-md text-muted-foreground hover:text-foreground"
                      onClick={() => setReaderModalOpen(true)}
                      aria-label="Expand message"
                    >
                      <Maximize2 className="size-3" />
                    </Button>
                  }
                />
                <TooltipContent side="bottom">Open full view</TooltipContent>
              </Tooltip>
              {openMessage.data.url ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <a
                        href={openMessage.data.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open in Gmail"
                        className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <ExternalLink className="size-3" />
                      </a>
                    }
                  />
                  <TooltipContent side="bottom">Open in Gmail</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pt-2 pr-1">
            <h4 className="text-[13.5px] font-medium leading-snug text-foreground">
              {letter.subject}
            </h4>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              <span className="font-medium text-foreground/85">{senderName(letter.from)}</span> ·{" "}
              {relative(letter.receivedAt, now)}
              {loadingLetter ? " · Loading…" : ""}
            </p>
            {readError ? (
              <Alert variant="destructive" className="mt-2 rounded-xl py-1.5">
                <AlertDescription className="text-xs">{readError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="mt-2.5">
              <SafeEmailContent html={letter.bodyHtml} fallbackText={letter.body || letter.snippet} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-2">
          {gmail.status === "needs_auth" ? (
            <Alert variant="destructive" className="rounded-xl py-2">
              <AlertDescription className="flex items-center justify-between gap-2 text-xs">
                <span>{gmail.lastError ?? `Reading needs ${GMAIL_READ_SCOPE}.`}</span>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => void connectGoogleServices(["gmail"])}
                >
                  Reconnect
                </Button>
              </AlertDescription>
            </Alert>
          ) : gmail.status !== "ok" && gmail.lastError ? (
            <Alert variant="destructive" className="rounded-xl py-1.5">
              <AlertDescription className="text-xs">{gmail.lastError}</AlertDescription>
            </Alert>
          ) : null}

          {sentNotice ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--land-gold)]/35 bg-[color:var(--land-gold)]/10 px-2.5 py-1 text-[12px] text-foreground">
              <span>{sentNotice}</span>
              <button
                type="button"
                onClick={() => setSentNotice(null)}
                aria-label="Dismiss notice"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}

          <div className="flex items-center gap-1.5">
            <div className="inline-flex rounded-lg border border-border/70 bg-muted/40 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`rounded-md px-2 py-0.5 font-medium transition-colors ${
                  filter === "all" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilter("unread")}
                className={`rounded-md px-2 py-0.5 font-medium transition-colors ${
                  filter === "unread" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Unread
              </button>
            </div>

            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search mail…"
                aria-label="Search inbox"
                className="h-6.5 w-full rounded-lg border-border/70 bg-background/40 pr-6 pl-6 text-[11.5px]"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
            {visibleMessages.length === 0 ? (
              <p className="cmd-empty py-6 text-center">
                {query
                  ? "No matching messages."
                  : filter === "unread"
                    ? "All caught up — no unread messages."
                    : "No inbox messages from the last week."}
              </p>
            ) : (
              <ul className="divide-y divide-border/50">
                {visibleMessages.map((message) => {
                  const name = senderName(message.data.from);
                  const unread = isUnread(message);
                  return (
                    <li
                      key={message.id}
                      className="group/mail relative flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/45"
                    >
                      <button
                        type="button"
                        onClick={() => void selectMessage(message)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      >
                        <span className="relative flex size-6.5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground/85">
                          {senderInitials(name)}
                          {unread ? (
                            <span
                              aria-label="Unread"
                              className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-[color:var(--land-gold)] ring-2 ring-background"
                            />
                          ) : null}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span
                              className={`truncate text-[12.5px] ${
                                unread ? "font-semibold text-foreground" : "font-medium text-foreground/85"
                              }`}
                            >
                              {name}
                            </span>
                            <span className="shrink-0 text-[10.5px] text-muted-foreground tabular-nums">
                              {relative(message.data.receivedAt, now)}
                            </span>
                          </div>
                          <p className="truncate text-[12px] text-muted-foreground">
                            <span className={unread ? "font-medium text-foreground/90" : ""}>
                              {message.data.subject || "(no subject)"}
                            </span>
                            {message.data.snippet ? (
                              <span className="text-muted-foreground/75"> — {message.data.snippet}</span>
                            ) : null}
                          </p>
                        </div>
                      </button>

                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/mail:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                className="size-6 rounded-md text-muted-foreground hover:text-foreground"
                                onClick={() =>
                                  startReplyFrom({
                                    from: message.data.from,
                                    subject: message.data.subject,
                                    body: message.data.body || message.data.snippet,
                                    receivedAt: message.data.receivedAt,
                                    threadId: message.data.threadId ?? null,
                                    rfcMessageId: message.data.rfcMessageId ?? null,
                                  })
                                }
                                aria-label={`Reply to ${name}`}
                              >
                                <Reply className="size-3" />
                              </Button>
                            }
                          />
                          <TooltipContent side="bottom">Reply</TooltipContent>
                        </Tooltip>
                        {message.data.url ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <a
                                  href={message.data.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label="Open in Gmail"
                                  className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                >
                                  <ExternalLink className="size-3" />
                                </a>
                              }
                            />
                            <TooltipContent side="bottom">Open in Gmail</TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {readerModalOpen && letter ? (
        <Dialog open onOpenChange={setReaderModalOpen}>
          <DialogContent className="gap-4 border border-border bg-popover p-6 text-popover-foreground shadow-2xl ring-0 sm:max-w-[660px]">
            <DialogHeader>
              <DialogTitle className="pr-8 font-sans text-[17px] font-medium leading-snug">
                {letter.subject}
              </DialogTitle>
              <p className="text-[12px] text-muted-foreground">
                From <span className="font-medium text-foreground">{letter.from}</span> ·{" "}
                {relative(letter.receivedAt, now)}
              </p>
            </DialogHeader>
            <ScrollArea className="max-h-[52svh] pr-2">
              <SafeEmailContent html={letter.bodyHtml} fallbackText={letter.body || letter.snippet} />
            </ScrollArea>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5 border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
                  onClick={() => startReplyFrom(letter)}
                >
                  <Reply className="size-3.5" />
                  <span>Reply</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => startForwardFrom(letter)}
                >
                  <Forward className="size-3.5" />
                  <span>Forward</span>
                </Button>
              </div>
              {openMessage?.data.url ? (
                <a
                  href={openMessage.data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
                >
                  <span>Open in Gmail</span>
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      {draft ? (
        <RichMailDialog
          draft={draft}
          canSend={canSend}
          sending={command.pending === "mail"}
          error={sendError}
          onChange={setDraft}
          onClose={() => {
            setDraft(null);
            setSendError(null);
          }}
          onSend={() => void sendDraft()}
        />
      ) : null}
    </WidgetFrame>
  );
}
