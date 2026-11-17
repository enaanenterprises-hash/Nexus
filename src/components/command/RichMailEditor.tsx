"use client";

import {
  Fragment,
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

interface MailAstNode {
  tag: string;
  href?: string;
  src?: string;
  alt?: string;
  text?: string;
  children: MailAstNode[];
}

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&([a-z]+|#\d+|#x[0-9a-f]+);/gi, (full, code: string) => {
    const low = code.toLowerCase();
    if (ENTITY_MAP[low]) return ENTITY_MAP[low];
    if (low.startsWith("#x")) {
      const n = Number.parseInt(low.slice(2), 16);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : full;
    }
    if (low.startsWith("#")) {
      const n = Number.parseInt(low.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : full;
    }
    return full;
  });
}

function parseSanitizedHtml(html: string): MailAstNode[] {
  const root: MailAstNode = { tag: "root", children: [] };
  const stack: MailAstNode[] = [root];
  const re = /<\/?([a-z0-9]+)(?:\s+([^>]*))?\/?>|([^<]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    if (match[3] !== undefined) {
      const txt = decodeEntities(match[3]);
      if (txt) stack[stack.length - 1]!.children.push({ tag: "#text", text: txt, children: [] });
      continue;
    }
    const tag = (match[1] ?? "").toLowerCase();
    const isClose = match[0].startsWith("</");
    if (tag === "br" || tag === "hr") {
      if (!isClose) stack[stack.length - 1]!.children.push({ tag, children: [] });
      continue;
    }
    if (tag === "img") {
      if (!isClose && match[2]) {
        const srcMatch = /\bsrc\s*=\s*"([^"]*)"/i.exec(match[2]);
        const altMatch = /\balt\s*=\s*"([^"]*)"/i.exec(match[2]);
        if (srcMatch?.[1] && /^https:\/\//i.test(srcMatch[1])) {
          stack[stack.length - 1]!.children.push({
            tag: "img",
            src: decodeEntities(srcMatch[1]),
            alt: altMatch?.[1] ? decodeEntities(altMatch[1]) : "",
            children: [],
          });
        }
      }
      continue;
    }
    if (isClose) {
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i]!.tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    let href: string | undefined;
    if (tag === "a" && match[2]) {
      const m = /\bhref\s*=\s*"([^"]*)"/i.exec(match[2]);
      if (m?.[1] && /^(https?:\/\/|mailto:)/i.test(m[1])) href = decodeEntities(m[1]);
    }
    const node: MailAstNode = { tag, href, children: [] };
    stack[stack.length - 1]!.children.push(node);
    stack.push(node);
  }
  return root.children;
}

function renderMailNode(node: MailAstNode, key: string): ReactNode {
  if (node.tag === "#text") return <Fragment key={key}>{node.text}</Fragment>;
  if (node.tag === "br") return <br key={key} />;
  if (node.tag === "hr") return <hr key={key} className="my-3 border-border/70" />;
  if (node.tag === "img") {
    return node.src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={key}
        src={node.src}
        alt={node.alt ?? ""}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="my-2 max-w-full rounded-lg border border-border/40"
      />
    ) : null;
  }
  const kids = node.children.map((c, idx) => renderMailNode(c, `${key}-${idx}`));
  switch (node.tag) {
    case "h1":
    case "h2":
      return <h4 key={key} className="mt-3 mb-1.5 text-[15px] font-semibold text-foreground">{kids}</h4>;
    case "h3":
      return <h5 key={key} className="mt-2.5 mb-1 text-[14px] font-semibold text-foreground">{kids}</h5>;
    case "p":
      return <p key={key} className="my-2 leading-relaxed">{kids}</p>;
    case "div":
      return <div key={key} className="my-1 leading-relaxed">{kids}</div>;
    case "strong":
    case "b":
      return <strong key={key} className="font-semibold text-foreground">{kids}</strong>;
    case "em":
    case "i":
      return <em key={key} className="italic">{kids}</em>;
    case "u":
      return <u key={key} className="underline underline-offset-2">{kids}</u>;
    case "s":
    case "del":
      return <s key={key} className="line-through opacity-75">{kids}</s>;
    case "blockquote":
      return (
        <blockquote key={key} className="my-2.5 border-l-2 border-border pl-3.5 text-muted-foreground">
          {kids}
        </blockquote>
      );
    case "pre":
      return (
        <pre key={key} className="my-2.5 overflow-x-auto rounded-lg bg-muted/60 p-3 font-mono text-[12.5px] text-foreground">
          {kids}
        </pre>
      );
    case "code":
      return (
        <code key={key} className="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[12.5px] text-foreground">
          {kids}
        </code>
      );
    case "ul":
      return <ul key={key} className="my-2 list-disc space-y-1 pl-5">{kids}</ul>;
    case "ol":
      return <ol key={key} className="my-2 list-decimal space-y-1 pl-5">{kids}</ol>;
    case "li":
      return <li key={key}>{kids}</li>;
    case "table":
      return (
        <div key={key} className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px]">{kids}</table>
        </div>
      );
    case "thead":
      return <thead key={key} className="border-b border-border/70 text-foreground">{kids}</thead>;
    case "tbody":
      return <tbody key={key} className="divide-y divide-border/45">{kids}</tbody>;
    case "tfoot":
      return <tfoot key={key} className="border-t border-border/70">{kids}</tfoot>;
    case "tr":
      return <tr key={key}>{kids}</tr>;
    case "th":
      return <th key={key} className="px-2.5 py-1.5 text-left font-medium text-foreground">{kids}</th>;
    case "td":
      return <td key={key} className="px-2.5 py-1.5 align-top">{kids}</td>;
    case "caption":
      return <caption key={key} className="mb-1 text-left text-[12px] text-muted-foreground">{kids}</caption>;
    case "a":
      return node.href ? (
        <a
          key={key}
          href={node.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[color:var(--land-gold)] underline decoration-[color:var(--land-gold)]/50 underline-offset-2 hover:decoration-[color:var(--land-gold)]"
        >
          {kids}
        </a>
      ) : (
        <Fragment key={key}>{kids}</Fragment>
      );
    default:
      return <span key={key}>{kids}</span>;
  }
}

/** Pure React renderer for server-sanitized email HTML; never uses dangerouslySetInnerHTML. */
export function SafeEmailContent({
  html,
  fallbackText,
  className = "",
}: {
  html?: string | null;
  fallbackText: string;
  className?: string;
}) {
  const tree = useMemo(() => (html ? parseSanitizedHtml(html) : null), [html]);
  if (!tree || tree.length === 0) {
    return (
      <div className={`whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground/85 ${className}`}>
        {fallbackText}
      </div>
    );
  }
  return (
    <div className={`cmd-mail-prose text-[13.5px] leading-relaxed text-foreground/85 ${className}`}>
      {tree.map((node, i) => renderMailNode(node, `root-${i}`))}
    </div>
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
          <DialogTitle className="font-sans text-[15px] font-medium">{title}</DialogTitle>
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
