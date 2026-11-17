"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Forward,
  Mail,
  RefreshCw,
  Reply,
  RotateCcw,
  Search,
  SquarePen,
  X,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  (/^([^<]+)</.exec(from)?.[1] ?? from).replace(/"/g, "").trim() || from || "Unknown sender";

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

function GmailConnectionEmpty({
  availability,
  expanded,
  onSync,
}: {
  availability?: { connectable: boolean; missing: string[] };
  expanded: boolean;
  onSync?: () => void;
}) {
  const unconfigured = availability && !availability.connectable;
  const missingList = availability?.missing?.length
    ? availability.missing
    : ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"];

  if (unconfigured) {
    return (
      <div className={`cmd-widget-empty ${expanded ? "mx-auto max-w-lg py-10" : ""}`}>
        <p className="font-medium text-foreground">Gmail cannot connect until Google OAuth is configured on the server.</p>
        <p className="text-[12.5px] text-muted-foreground">
          Missing server environment variable{missingList.length > 1 ? "s" : ""}:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11.5px] text-foreground">
            {missingList.join(", ")}
          </code>
        </p>
        {expanded ? (
          <ol className="mt-1 list-decimal space-y-1 pl-4 text-[12.5px] text-muted-foreground">
            <li>Enable the Gmail API in Google Cloud Console and add your account as an OAuth Test User.</li>
            <li>
              Set <code className="font-mono text-[11.5px]">AUTH_GOOGLE_ID</code> and{" "}
              <code className="font-mono text-[11.5px]">AUTH_GOOGLE_SECRET</code> in{" "}
              <code className="font-mono text-[11.5px]">.env.local</code> (or your deployment environment).
            </li>
            <li>Restart the dev server and click Connect Gmail.</li>
          </ol>
        ) : null}
        {onSync ? (
          <Button type="button" size="xs" variant="outline" className="mt-1 w-fit" onClick={onSync}>
            Re-check status
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`cmd-widget-empty ${expanded ? "mx-auto max-w-md items-center py-12 text-center" : ""}`}>
      <p>Connect your Google account to read, search, and reply to Gmail directly inside Command.</p>
      <p className="cmd-scope">Read scope: {GMAIL_READ_SCOPE}</p>
      <Button
        type="button"
        size={expanded ? "default" : "sm"}
        className="mt-1 w-fit border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
        onClick={() => void connectGoogleServices(["gmail"])}
      >
        Connect Gmail
      </Button>
    </div>
  );
}

export function GmailWidget({
  command,
  expanded = false,
  initialMessageId = null,
  onOpenMessageFromPreview,
  onExpand,
  onCollapse,
  onRemove,
  style,
}: {
  command: CommandController;
  expanded?: boolean;
  initialMessageId?: string | null;
  onOpenMessageFromPreview?: (messageId: string) => void;
  onExpand?: () => void;
  onCollapse?: () => void;
  onRemove: () => void;
  style?: CSSProperties;
}) {
  const state = command.state!;
  const now = useNow(30_000);
  const gmail = state.connections.find((c) => c.connectorId === "gmail") ?? null;
  const sending = state.connections.find((c) => c.connectorId === "gmail-send") ?? null;
  const availability = state.availability["gmail"];
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
  const [selectedId, setSelectedId] = useState<string | null>(initialMessageId);
  const [mobileShowReader, setMobileShowReader] = useState(Boolean(initialMessageId));
  const [letterCache, setLetterCache] = useState<Record<string, GmailLetter>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [readErrors, setReadErrors] = useState<Record<string, string>>({});
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

  const activeMessage = useMemo(() => {
    if (!expanded) return null;
    if (selectedId) {
      const exact = messages.find((m) => m.id === selectedId);
      if (exact) return exact;
    }
    return visibleMessages[0] ?? messages[0] ?? null;
  }, [expanded, selectedId, messages, visibleMessages]);

  const formatReadError = useCallback((error: unknown) => {
    const code = error instanceof CommandRequestError ? error.code : undefined;
    const messageText = error instanceof Error ? error.message : "The message could not be loaded.";
    return code === "needs_auth" ? `Reading needs ${GMAIL_READ_SCOPE}. ${messageText}` : messageText;
  }, []);

  const loadFullMessage = useCallback(
    async (message: MailItem, force = false) => {
      const externalId = message.data.externalId;
      if (!force && letterCache[externalId]) return;
      setReadErrors((prev) => {
        if (!(externalId in prev)) return prev;
        const next = { ...prev };
        delete next[externalId];
        return next;
      });
      setLoadingId(externalId);
      try {
        const full = await commandApi.readMail(externalId);
        setLetterCache((prev) => ({ ...prev, [externalId]: full }));
      } catch (error) {
        setReadErrors((prev) => ({ ...prev, [externalId]: formatReadError(error) }));
      } finally {
        setLoadingId((cur) => (cur === externalId ? null : cur));
      }
    },
    [letterCache, formatReadError],
  );

  const activeExternalId = activeMessage?.data.externalId ?? null;
  const cachedActive = activeExternalId ? letterCache[activeExternalId] : undefined;
  const activeError = activeExternalId ? (readErrors[activeExternalId] ?? null) : null;

  useEffect(() => {
    if (!expanded || !gmail || gmail.status === "needs_auth" || !activeExternalId) return;
    if (cachedActive || activeError) return;
    let cancelled = false;
    commandApi.readMail(activeExternalId).then(
      (full) => {
        if (!cancelled) setLetterCache((prev) => ({ ...prev, [activeExternalId]: full }));
      },
      (error: unknown) => {
        if (!cancelled) setReadErrors((prev) => ({ ...prev, [activeExternalId]: formatReadError(error) }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [expanded, gmail, activeExternalId, cachedActive, activeError, formatReadError]);

  const isLoadingActive = Boolean(
    activeExternalId &&
      (loadingId === activeExternalId ||
        (expanded && gmail && gmail.status !== "needs_auth" && !cachedActive && !activeError)),
  );
  const activeLetter: GmailLetter | null = activeMessage
    ? (cachedActive ?? {
        id: activeMessage.data.externalId,
        threadId: activeMessage.data.threadId ?? null,
        from: activeMessage.data.from,
        subject: activeMessage.data.subject,
        snippet: activeMessage.data.snippet,
        body: activeMessage.data.body || activeMessage.data.snippet,
        bodyHtml: null,
        receivedAt: activeMessage.data.receivedAt,
        rfcMessageId: activeMessage.data.rfcMessageId ?? null,
      })
    : null;

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
        className="h-6 gap-1 rounded-md border border-[color:var(--land-gold)]/35 bg-[color:var(--land-gold)]/14 px-2 !text-[11px] leading-none font-medium text-foreground hover:bg-[color:var(--land-gold)]/24"
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
      expanded={expanded}
      onExpand={onExpand}
      onCollapse={onCollapse}
      onRemove={onRemove}
      style={style}
    >
      {!gmail ? (
        <GmailConnectionEmpty
          availability={availability}
          expanded={expanded}
          onSync={() => void command.sync()}
        />
      ) : !expanded ? (
        /* ——— Compact Preview Card on Overview Grid ——— */
        <div className="flex h-full min-h-0 flex-col gap-1.5">
          {gmail.status === "needs_auth" ? (
            <Alert variant="destructive" className="rounded-xl py-2" data-no-expand>
              <AlertDescription className="flex items-center justify-between gap-2 text-xs">
                <span className="line-clamp-2">{gmail.lastError ?? `Reading needs ${GMAIL_READ_SCOPE}.`}</span>
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
              <AlertDescription className="line-clamp-2 text-xs">{gmail.lastError}</AlertDescription>
            </Alert>
          ) : null}

          {messages.length === 0 ? (
            <div className="cmd-widget-empty items-center text-center">
              <p className="text-[12.5px]">
                {command.syncing ? "Loading your inbox…" : "No inbox messages synced yet."}
              </p>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={command.syncing}
                onClick={() => void command.sync()}
              >
                {command.syncing ? "Syncing…" : "Sync inbox"}
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border/45">
              {messages.slice(0, 4).map((message) => {
                const name = senderName(message.data.from);
                const unread = isUnread(message);
                return (
                  <li key={message.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenMessageFromPreview) {
                          onOpenMessageFromPreview(message.id);
                        } else {
                          setSelectedId(message.id);
                          onExpand?.();
                        }
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-muted/45"
                    >
                      <span
                        aria-hidden
                        className={`size-1.5 shrink-0 rounded-full ${
                          unread ? "bg-[color:var(--land-gold)]" : "bg-transparent"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            className={`truncate text-[12.5px] ${
                              unread ? "font-semibold text-foreground" : "font-medium text-foreground/85"
                            }`}
                          >
                            {name}
                          </span>
                          <span
                            suppressHydrationWarning
                            className="shrink-0 text-[10.5px] text-muted-foreground tabular-nums"
                          >
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
                  </li>
                );
              })}
            </ul>
          )}

          {messages.length > 0 ? (
            <div className="mt-auto flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
              <span>{messages.length > 4 ? `+${messages.length - 4} more in inbox` : `${messages.length} loaded`}</span>
              <span className="font-medium text-foreground/75">Click to open full inbox →</span>
            </div>
          ) : null}
        </div>
      ) : (
        /* ——— Full Expanded Two-Pane Split Mail Workspace ——— */
        <div className="flex h-full min-h-0 flex-col gap-3">
          {gmail.status === "needs_auth" ? (
            <Alert variant="destructive" className="shrink-0 rounded-xl py-2">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>{gmail.lastError ?? `Reading needs ${GMAIL_READ_SCOPE}.`}</span>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => void connectGoogleServices(["gmail"])}
                >
                  Reconnect Gmail
                </Button>
              </AlertDescription>
            </Alert>
          ) : gmail.status !== "ok" && gmail.lastError ? (
            <Alert variant="destructive" className="shrink-0 rounded-xl py-2">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>{gmail.lastError}</span>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={command.syncing}
                  onClick={() => void command.sync()}
                >
                  Retry sync
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {sentNotice ? (
            <div className="flex shrink-0 items-center justify-between gap-2 rounded-lg border border-[color:var(--land-gold)]/35 bg-[color:var(--land-gold)]/10 px-3 py-1.5 text-[12.5px] text-foreground">
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

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
            {/* Left Inbox List Column */}
            <div
              className={`min-h-0 flex-col gap-2.5 md:flex md:border-r md:border-border/60 md:pr-4 ${
                mobileShowReader ? "hidden" : "flex"
              }`}
            >
              <div className="flex shrink-0 items-center gap-2">
                <div className="inline-flex rounded-lg border border-border/70 bg-muted/40 p-0.5 text-[11.5px]">
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                      filter === "all" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("unread")}
                    className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                      filter === "unread" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Unread
                  </button>
                </div>

                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search mail…"
                    aria-label="Search inbox"
                    className="h-8 w-full rounded-lg border-border/70 bg-background/40 pr-7 pl-8 text-[12.5px]"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                      className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {visibleMessages.length === 0 ? (
                  <div className="cmd-empty flex flex-col items-center gap-2 py-10 text-center">
                    <p>
                      {query
                        ? "No matching messages."
                        : filter === "unread"
                          ? "All caught up — no unread messages."
                          : command.syncing
                            ? "Syncing your Gmail inbox…"
                            : "No inbox messages loaded yet."}
                    </p>
                    {!query && filter === "all" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={command.syncing}
                        onClick={() => void command.sync()}
                      >
                        {command.syncing ? "Syncing…" : "Sync Gmail inbox"}
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {visibleMessages.map((message) => {
                      const name = senderName(message.data.from);
                      const unread = isUnread(message);
                      const selected = activeMessage?.id === message.id;
                      return (
                        <li key={message.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(message.id);
                              setMobileShowReader(true);
                              if (!letterCache[message.data.externalId]) {
                                void loadFullMessage(message);
                              }
                            }}
                            className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                              selected
                                ? "border-[color:var(--land-gold)]/45 bg-[color:var(--land-gold)]/10"
                                : "border-transparent hover:bg-muted/45"
                            }`}
                          >
                            <span className="relative mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground/85">
                              {senderInitials(name)}
                              {unread ? (
                                <span
                                  aria-label="Unread"
                                  className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-[color:var(--land-gold)] ring-2 ring-background"
                                />
                              ) : null}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <span
                                  className={`truncate text-[13px] ${
                                    unread ? "font-semibold text-foreground" : "font-medium text-foreground/90"
                                  }`}
                                >
                                  {name}
                                </span>
                                <span
                                  suppressHydrationWarning
                                  className="shrink-0 text-[11px] text-muted-foreground tabular-nums"
                                >
                                  {relative(message.data.receivedAt, now)}
                                </span>
                              </div>
                              <p
                                className={`mt-0.5 truncate text-[12.5px] ${
                                  unread ? "font-medium text-foreground" : "text-foreground/85"
                                }`}
                              >
                                {message.data.subject || "(no subject)"}
                              </p>
                              {message.data.snippet ? (
                                <p className="mt-0.5 line-clamp-1 text-[11.5px] text-muted-foreground">
                                  {message.data.snippet}
                                </p>
                              ) : null}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Right Reading Pane */}
            <div
              className={`min-h-0 flex-col rounded-xl border border-border/60 bg-background/25 ${
                mobileShowReader ? "flex" : "hidden md:flex"
              }`}
            >
              {activeMessage && activeLetter ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3 sm:px-6">
                    <div className="flex min-w-0 items-center gap-2">
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        className="h-7 gap-1 px-2 text-muted-foreground hover:text-foreground md:hidden"
                        onClick={() => setMobileShowReader(false)}
                      >
                        <ArrowLeft className="size-3.5" />
                        <span>Inbox</span>
                      </Button>
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground/85 max-md:hidden">
                        {senderInitials(senderName(activeLetter.from))}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium text-foreground">
                          {senderName(activeLetter.from)}
                        </p>
                        <p suppressHydrationWarning className="truncate text-[11.5px] text-muted-foreground">
                          {senderEmail(activeLetter.from) || activeLetter.from} · {relative(activeLetter.receivedAt, now)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        size="xs"
                        className="h-7 gap-1.5 border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 px-2.5 text-[12px] text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
                        onClick={() => startReplyFrom(activeLetter)}
                      >
                        <Reply className="size-3.5" />
                        <span>Reply</span>
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className="h-7 gap-1.5 px-2.5 text-[12px]"
                        onClick={() => startForwardFrom(activeLetter)}
                      >
                        <Forward className="size-3.5" />
                        <span>Forward</span>
                      </Button>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              className="size-7 rounded-md text-muted-foreground hover:text-foreground"
                              onClick={() => void loadFullMessage(activeMessage, true)}
                              disabled={isLoadingActive}
                              aria-label="Reload email content"
                            >
                              <RotateCcw className={`size-3.5 ${isLoadingActive ? "animate-spin" : ""}`} />
                            </Button>
                          }
                        />
                        <TooltipContent side="bottom">Reload full email</TooltipContent>
                      </Tooltip>
                      {activeMessage.data.url ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <a
                                href={activeMessage.data.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Open in Gmail"
                                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              >
                                <ExternalLink className="size-3.5" />
                              </a>
                            }
                          />
                          <TooltipContent side="bottom">Open in Gmail</TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-7 sm:py-5">
                    <h4 className="text-[18px] font-medium leading-snug tracking-[-0.01em] text-foreground sm:text-[20px]">
                      {activeLetter.subject}
                    </h4>

                    {isLoadingActive ? (
                      <p className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
                        <span className="state-dot state-dot--thinking" />
                        Loading full message…
                      </p>
                    ) : null}

                    {activeError ? (
                      <Alert variant="destructive" className="mt-3 rounded-xl py-2">
                        <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span>{activeError}</span>
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={() => void loadFullMessage(activeMessage, true)}
                            >
                              Retry
                            </Button>
                            {activeError.includes(GMAIL_READ_SCOPE) ? (
                              <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                onClick={() => void connectGoogleServices(["gmail"])}
                              >
                                Reconnect
                              </Button>
                            ) : null}
                          </div>
                        </AlertDescription>
                      </Alert>
                    ) : null}

                    <div className="mt-4">
                      <SafeEmailContent
                        html={activeLetter.bodyHtml}
                        fallbackText={activeLetter.body || activeLetter.snippet || "No readable body content."}
                        className="text-[14px] leading-[1.65]"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-center text-[13.5px] text-muted-foreground">
                  {messages.length === 0
                    ? "Your inbox messages will appear here once synced."
                    : "Select an email on the left to read its full message."}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
