"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import {
  Bold,
  Code,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  RemoveFormatting,
  Send,
  Strikethrough,
  Underline,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { connectGoogleServices } from "@/lib/command/google-connect";
import { GMAIL_SEND_SCOPE } from "@/lib/command/widgets";

export interface RichMailValue {
  html: string;
  text: string;
}

type FormatKey =
  | "bold"
  | "italic"
  | "underline"
  | "strikeThrough"
  | "insertUnorderedList"
  | "insertOrderedList";

interface EditorFormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeThrough: boolean;
  insertUnorderedList: boolean;
  insertOrderedList: boolean;
  heading: boolean;
  quote: boolean;
  code: boolean;
}

const EMPTY_FORMATS: EditorFormatState = {
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  insertUnorderedList: false,
  insertOrderedList: false,
  heading: false,
  quote: false,
  code: false,
};

function normalizeLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return null;
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return `mailto:${trimmed}`;
  return `https://${trimmed}`;
}

function closestTag(node: Node | null, root: HTMLElement, tags: readonly string[]): HTMLElement | null {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (cur.nodeType === Node.ELEMENT_NODE) {
      const el = cur as HTMLElement;
      if (tags.includes(el.tagName.toLowerCase())) return el;
    }
    cur = cur.parentNode;
  }
  return null;
}

function assignRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    }
  };
}

/**
 * Clean, zero-dependency WYSIWYG email editor exporting paired HTML + plain text.
 * Preserves selection during toolbar actions and supports Ctrl/Cmd+B/I/U/K and Ctrl/Cmd+Enter.
 */
export function RichMailEditor({
  resetKey,
  initialHtml = "",
  placeholder = "Write your message…",
  minHeightClass = "min-h-[168px]",
  maxHeightClass = "max-h-[320px]",
  onChange,
  onSubmitShortcut,
}: {
  resetKey: string;
  initialHtml?: string;
  placeholder?: string;
  minHeightClass?: string;
  maxHeightClass?: string;
  onChange: (value: RichMailValue) => void;
  onSubmitShortcut?: () => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [formats, setFormats] = useState<EditorFormatState>(EMPTY_FORMATS);
  const [isEmpty, setIsEmpty] = useState(!initialHtml);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const emitChange = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const text = (el.innerText || "").replace(/\r\n/g, "\n").trim();
    const rawHtml = el.innerHTML;
    setIsEmpty(text.length === 0 && !rawHtml.includes("<hr"));
    onChange({
      html: text.length === 0 && !rawHtml.includes("<hr") ? "" : rawHtml,
      text,
    });
  }, [onChange]);

  const refreshFormats = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
      setFormats(EMPTY_FORMATS);
      return;
    }
    const anchor = sel.anchorNode;
    try {
      setFormats({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strikeThrough: document.queryCommandState("strikeThrough"),
        insertUnorderedList: document.queryCommandState("insertUnorderedList"),
        insertOrderedList: document.queryCommandState("insertOrderedList"),
        heading: Boolean(closestTag(anchor, el, ["h1", "h2", "h3"])),
        quote: Boolean(closestTag(anchor, el, ["blockquote"])),
        code: Boolean(closestTag(anchor, el, ["code", "pre"])),
      });
    } catch {
      setFormats(EMPTY_FORMATS);
    }
  }, []);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = initialHtml;
    const text = (el.innerText || "").trim();
    setIsEmpty(text.length === 0 && !initialHtml.includes("<hr"));
    onChange({
      html: initialHtml,
      text,
    });
    // Seed only when resetKey changes so typing caret stays untouched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    const onSelectionChange = () => refreshFormats();
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [refreshFormats]);

  function exec(cmd: FormatKey) {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(cmd, false);
    refreshFormats();
    emitChange();
  }

  function toggleBlock(tag: "h2" | "blockquote" | "p") {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    const active = sel ? closestTag(sel.anchorNode, el, [tag]) : null;
    document.execCommand("formatBlock", false, active ? "p" : tag);
    refreshFormats();
    emitChange();
  }

  function toggleInlineCode() {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const existing = closestTag(sel.anchorNode, el, ["code"]);
    if (existing) {
      const parent = existing.parentNode;
      if (parent) {
        const text = document.createTextNode(existing.textContent ?? "");
        parent.replaceChild(text, existing);
        const range = document.createRange();
        range.selectNodeContents(text);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } else {
      const range = sel.getRangeAt(0);
      const selected = range.toString() || "code";
      const code = document.createElement("code");
      code.textContent = selected;
      range.deleteContents();
      range.insertNode(code);
      const after = document.createRange();
      after.setStartAfter(code);
      after.collapse(true);
      sel.removeAllRanges();
      sel.addRange(after);
    }
    refreshFormats();
    emitChange();
  }

  function insertDivider() {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand("insertHorizontalRule");
    emitChange();
  }

  function clearFormatting() {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand("removeFormat");
    document.execCommand("formatBlock", false, "p");
    refreshFormats();
    emitChange();
  }

  function prepareLinkPopover() {
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
      const existingA = closestTag(sel.anchorNode, el, ["a"]) as HTMLAnchorElement | null;
      setLinkUrl(existingA?.getAttribute("href") ?? "");
    } else {
      savedRangeRef.current = null;
      setLinkUrl("");
    }
    setLinkError(null);
  }

  function applyLink() {
    const url = normalizeLinkUrl(linkUrl);
    if (!url) {
      setLinkError("Enter a valid https:// URL or email address.");
      return;
    }
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (savedRangeRef.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
    if (sel && sel.rangeCount > 0 && sel.getRangeAt(0).collapsed) {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = url.replace(/^mailto:/i, "");
      const range = sel.getRangeAt(0);
      range.insertNode(a);
      const after = document.createRange();
      after.setStartAfter(a);
      after.collapse(true);
      sel.removeAllRanges();
      sel.addRange(after);
    } else {
      document.execCommand("createLink", false, url);
    }
    setLinkOpen(false);
    setLinkError(null);
    emitChange();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === "Enter") {
      e.preventDefault();
      onSubmitShortcut?.();
      return;
    }
    if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      prepareLinkPopover();
      setLinkOpen(true);
    }
  }

  return (
    <div className="cmd-rich-editor rounded-xl border border-border bg-background/40 transition-colors focus-within:border-foreground/30">
      <div
        role="toolbar"
        aria-label="Email formatting"
        className="flex flex-wrap items-center gap-0.5 border-b border-border/80 px-2 py-1.5"
      >
        <ToolbarBtn
          label="Bold (Ctrl+B)"
          active={formats.bold}
          onTrigger={() => exec("bold")}
        >
          <Bold className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Italic (Ctrl+I)"
          active={formats.italic}
          onTrigger={() => exec("italic")}
        >
          <Italic className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Underline (Ctrl+U)"
          active={formats.underline}
          onTrigger={() => exec("underline")}
        >
          <Underline className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Strikethrough"
          active={formats.strikeThrough}
          onTrigger={() => exec("strikeThrough")}
        >
          <Strikethrough className="size-3.5" />
        </ToolbarBtn>

        <Separator orientation="vertical" className="mx-1 h-4" />

        <ToolbarBtn
          label="Heading"
          active={formats.heading}
          onTrigger={() => toggleBlock("h2")}
        >
          <Heading2 className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Bullet list"
          active={formats.insertUnorderedList}
          onTrigger={() => exec("insertUnorderedList")}
        >
          <List className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Numbered list"
          active={formats.insertOrderedList}
          onTrigger={() => exec("insertOrderedList")}
        >
          <ListOrdered className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Blockquote"
          active={formats.quote}
          onTrigger={() => toggleBlock("blockquote")}
        >
          <Quote className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Inline code"
          active={formats.code}
          onTrigger={toggleInlineCode}
        >
          <Code className="size-3.5" />
        </ToolbarBtn>

        <Separator orientation="vertical" className="mx-1 h-4" />

        <Popover
          open={linkOpen}
          onOpenChange={(next) => {
            if (next) prepareLinkPopover();
            setLinkOpen(next);
          }}
        >
          <Tooltip disabled={linkOpen}>
            <TooltipTrigger
              render={(tooltipProps) => (
                <PopoverTrigger
                  render={(popProps) => (
                    <Button
                      {...mergeProps<"button">(tooltipProps, popProps)}
                      ref={assignRefs(
                        (tooltipProps as { ref?: Ref<HTMLButtonElement> }).ref,
                        (popProps as { ref?: Ref<HTMLButtonElement> }).ref,
                      )}
                      type="button"
                      variant={linkOpen ? "secondary" : "ghost"}
                      size="icon-xs"
                      aria-label="Insert link (Ctrl+K)"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        prepareLinkPopover();
                      }}
                      className="size-7 rounded-md text-muted-foreground hover:text-foreground"
                    >
                      <Link2 className="size-3.5" />
                    </Button>
                  )}
                />
              )}
            />
            <TooltipContent side="bottom">Insert link (Ctrl+K)</TooltipContent>
          </Tooltip>
          <PopoverContent align="start" sideOffset={6} className="w-72 rounded-xl border border-border bg-popover p-3">
            <div className="space-y-2">
              <p className="text-[12px] font-medium text-foreground">Insert link</p>
              <Input
                value={linkUrl}
                onChange={(e) => {
                  setLinkUrl(e.target.value);
                  setLinkError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyLink();
                  }
                }}
                placeholder="https://example.com"
                autoComplete="off"
                className="h-8 rounded-lg text-[13px]"
              />
              {linkError ? <p className="text-[11px] text-destructive">{linkError}</p> : null}
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => setLinkOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="button" size="xs" onClick={applyLink}>
                  Apply
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <ToolbarBtn label="Divider line" active={false} onTrigger={insertDivider}>
          <Minus className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn label="Clear formatting" active={false} onTrigger={clearFormatting}>
          <RemoveFormatting className="size-3.5" />
        </ToolbarBtn>
      </div>

      <div className="relative">
        {isEmpty ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-3 left-3.5 text-[13.5px] text-muted-foreground/70 select-none"
          >
            {placeholder}
          </span>
        ) : null}
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          aria-label="Message body"
          contentEditable
          suppressContentEditableWarning
          onInput={emitChange}
          onKeyUp={refreshFormats}
          onMouseUp={refreshFormats}
          onKeyDown={handleKeyDown}
          className={`cmd-rich-surface overflow-y-auto px-3.5 py-2.5 text-[13.5px] leading-relaxed text-foreground outline-none ${minHeightClass} ${maxHeightClass}`}
        />
      </div>
    </div>
  );
}

function ToolbarBtn({
  label,
  active,
  onTrigger,
  children,
}: {
  label: string;
  active: boolean;
  onTrigger: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={active ? "secondary" : "ghost"}
            size="icon-xs"
            aria-label={label}
            aria-pressed={active}
            onMouseDown={(e) => {
              e.preventDefault();
              onTrigger();
            }}
            className={`size-7 rounded-md ${
              active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function buildEmailSrcDoc(rawHtml: string): string {
  const cleaned = rawHtml
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/(?:&zwnj;|&#8204;|&#x200c;|\u200c)+(?:\s|&nbsp;|&#160;)*/gi, " ")
    .trim();

  const headReset = [
    `<meta charset="utf-8" />`,
    `<base target="_blank" />`,
    `<style>`,
    `html,body{margin:0;padding:18px 22px 28px;background:#ffffff;color:#1f2328;font-family:"General Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;overflow-wrap:anywhere;-webkit-font-smoothing:antialiased;}`,
    `img{max-width:100%;}`,
    `img:not([height]){height:auto;}`,
    `a{color:#0b57d0;}`,
    `blockquote{margin:12px 0;padding-left:14px;border-left:2px solid #d0d7de;color:#57606a;}`,
    `pre{overflow-x:auto;padding:12px;border-radius:8px;background:#f6f8fa;}`,
    `</style>`,
  ].join("");

  if (/<head[\s>]/i.test(cleaned)) {
    return `<!doctype html>${cleaned.replace(/<head([^>]*)>/i, `<head$1>${headReset}`)}`;
  }
  if (/<body[\s>]/i.test(cleaned)) {
    return `<!doctype html><html><head>${headReset}</head>${cleaned.replace(/^<html[^>]*>|<\/html>$/gi, "")}</html>`;
  }
  return `<!doctype html><html><head>${headReset}</head><body>${cleaned}</body></html>`;
}

/** Sandboxed iframe renderer for server-sanitized HTML email (scripts disabled, full CSS/layout/image fidelity). */
export function SafeEmailContent({
  html,
  fallbackText,
  className = "",
}: {
  html?: string | null;
  fallbackText: string;
  className?: string;
}) {
  const srcDoc = useMemo(() => (html && html.trim() ? buildEmailSrcDoc(html) : null), [html]);
  if (!srcDoc) {
    return (
      <div className={`whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground/85 ${className}`}>
        {fallbackText}
      </div>
    );
  }
  return (
    <iframe
      title="Email content"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      className={`block h-full w-full min-h-[380px] rounded-xl border border-border/50 bg-white ${className}`}
    />
  );
}

export interface MailDraft {
  id: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  html: string;
  initialHtml: string;
  threadId: string | null;
  inReplyTo: string | null;
  mode: "compose" | "reply" | "forward";
}

function escapePlainToHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/\r?\n/g, "<br>");
}

export function buildQuotedMailHtml(meta: { from: string; date: string; text: string }): string {
  const trimmed = meta.text.trim().slice(0, 4000);
  const metaLine = escapePlainToHtml(`On ${meta.date}, ${meta.from} wrote:`);
  return `<p><br></p><hr><p><em>${metaLine}</em></p><blockquote>${escapePlainToHtml(trimmed)}</blockquote>`;
}

/** Shared rich-text Gmail compose / reply / forward modal. */
export function RichMailDialog({
  draft,
  canSend,
  sending,
  error,
  onChange,
  onClose,
  onSend,
}: {
  draft: MailDraft;
  canSend: boolean;
  sending: boolean;
  error: string | null;
  onChange: (next: MailDraft) => void;
  onClose: () => void;
  onSend: () => void;
}) {
  const fieldId = useId();
  const [showCc, setShowCc] = useState(Boolean(draft.cc));
  const [showBcc, setShowBcc] = useState(Boolean(draft.bcc));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSend || sending || !draft.to.trim()) return;
    onSend();
  }

  const title =
    draft.mode === "reply"
      ? "Reply"
      : draft.mode === "forward"
        ? "Forward message"
        : "New message";

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="gap-4 border border-border bg-popover p-5 text-popover-foreground shadow-2xl ring-0 sm:max-w-[660px] sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-heading text-[1.05rem] font-medium tracking-[-0.015em]">{title}</DialogTitle>
        </DialogHeader>

        {canSend ? (
          <form onSubmit={submit} className="space-y-2.5">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor={`${fieldId}-to`} className="cmd-label">
                  To
                </Label>
                <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                  {!showCc ? (
                    <button
                      type="button"
                      onClick={() => setShowCc(true)}
                      className="hover:text-foreground"
                    >
                      + Cc
                    </button>
                  ) : null}
                  {!showBcc ? (
                    <button
                      type="button"
                      onClick={() => setShowBcc(true)}
                      className="hover:text-foreground"
                    >
                      + Bcc
                    </button>
                  ) : null}
                </div>
              </div>
              <Input
                id={`${fieldId}-to`}
                className="cmd-field h-9 rounded-lg border border-border bg-background/50"
                value={draft.to}
                onChange={(e) => onChange({ ...draft, to: e.target.value })}
                placeholder="name@company.com (comma-separated for multiple)"
                required
                autoComplete="off"
              />
            </div>

            {showCc ? (
              <div className="space-y-1">
                <Label htmlFor={`${fieldId}-cc`} className="cmd-label">
                  Cc
                </Label>
                <Input
                  id={`${fieldId}-cc`}
                  className="cmd-field h-9 rounded-lg border border-border bg-background/50"
                  value={draft.cc}
                  onChange={(e) => onChange({ ...draft, cc: e.target.value })}
                  autoComplete="off"
                />
              </div>
            ) : null}

            {showBcc ? (
              <div className="space-y-1">
                <Label htmlFor={`${fieldId}-bcc`} className="cmd-label">
                  Bcc
                </Label>
                <Input
                  id={`${fieldId}-bcc`}
                  className="cmd-field h-9 rounded-lg border border-border bg-background/50"
                  value={draft.bcc}
                  onChange={(e) => onChange({ ...draft, bcc: e.target.value })}
                  autoComplete="off"
                />
              </div>
            ) : null}

            <div className="space-y-1">
              <Label htmlFor={`${fieldId}-subject`} className="cmd-label">
                Subject
              </Label>
              <Input
                id={`${fieldId}-subject`}
                className="cmd-field h-9 rounded-lg border border-border bg-background/50"
                value={draft.subject}
                onChange={(e) => onChange({ ...draft, subject: e.target.value })}
                placeholder="Subject"
                maxLength={300}
                autoComplete="off"
              />
            </div>

            <RichMailEditor
              resetKey={draft.id}
              initialHtml={draft.initialHtml}
              placeholder="Write your message with rich formatting…"
              onChange={({ html, text }) => onChange({ ...draft, html, body: text })}
              onSubmitShortcut={() => {
                if (canSend && !sending && draft.to.trim()) onSend();
              }}
            />

            {error ? (
              <Alert variant="destructive" className="rounded-xl py-2">
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-[11.5px] text-muted-foreground">
                Ctrl / Cmd + Enter to send
              </span>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={onClose}>
                  Discard
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="gap-1.5 border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
                  disabled={sending || !draft.to.trim()}
                >
                  <Send className="size-3.5" />
                  <span>{sending ? "Sending…" : "Send"}</span>
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <div className="cmd-connect-empty space-y-3 py-2">
            <p className="text-[13.5px] text-muted-foreground">
              Sending needs its own Google permission. Reading your inbox stays read-only.
            </p>
            <p className="cmd-scope">{GMAIL_SEND_SCOPE}</p>
            <Button
              type="button"
              size="sm"
              className="border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
              onClick={() => void connectGoogleServices(["gmail-send"])}
            >
              Allow sending
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
