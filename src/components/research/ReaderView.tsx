"use client";

import { memo, useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import type { ReaderDocument, SourceHighlight } from "@/lib/research/types";
import { displayHost } from "./research-client";
import type { TextQuote } from "./use-research-library";

type Props = {
  doc: ReaderDocument;
  mode: "reader" | "live";
  savedCopy: { savedAt: string } | null;
  highlights: SourceHighlight[];
  canHighlight: boolean;
  focusQuote: { quote: string; serial: number } | null;
  onHighlight: (quote: TextQuote) => void;
  onNavigate: (url: string, newTab: boolean) => void;
};

const HIGHLIGHT_NAME = "nexus-research";
const CONTEXT_CHARS = 32;

function formatDate(value: string | null) {
  if (!value) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return value;
  return new Date(time).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Maps a [start, end) range of `root.textContent` back onto DOM text nodes. */
function rangeFor(root: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let offset = 0;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!started && start <= offset + length) {
      range.setStart(node, start - offset);
      started = true;
    }
    if (started && end <= offset + length) {
      range.setEnd(node, end - offset);
      return range;
    }
    offset += length;
  }
  return null;
}

function locate(text: string, h: Pick<SourceHighlight, "quote" | "prefix" | "suffix">): number {
  const exact = text.indexOf(h.prefix + h.quote + h.suffix);
  if (exact >= 0) return exact + h.prefix.length;
  return text.indexOf(h.quote);
}

const Article = memo(function Article({ html }: { html: string }) {
  return <div className="reader-prose" dangerouslySetInnerHTML={{ __html: html }} />;
});

export function ReaderView({ doc, mode, savedCopy, highlights, canHighlight, focusQuote, onHighlight, onNavigate }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ x: number; y: number; quote: TextQuote } | null>(null);

  useEffect(() => {
    const root = contentRef.current;
    if (!root || mode !== "reader" || typeof CSS === "undefined" || !("highlights" in CSS)) return;
    const text = root.textContent ?? "";
    const ranges = highlights.flatMap((h) => {
      const start = locate(text, h);
      const range = start >= 0 ? rangeFor(root, start, start + h.quote.length) : null;
      return range ? [range] : [];
    });
    CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
    return () => {
      CSS.highlights.delete(HIGHLIGHT_NAME);
    };
  }, [highlights, doc.contentHtml, mode]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root || !focusQuote) return;
    const text = root.textContent ?? "";
    const start = text.indexOf(focusQuote.quote);
    const range = start >= 0 ? rangeFor(root, start, start + focusQuote.quote.length) : null;
    const target = range?.startContainer.parentElement;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusQuote]);

  const readSelection = useCallback(() => {
    const root = contentRef.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.isCollapsed || sel.rangeCount === 0 || !canHighlight) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
    }
    const before = document.createRange();
    before.setStart(root, 0);
    before.setEnd(range.startContainer, range.startOffset);
    const text = root.textContent ?? "";
    const start = before.toString().length;
    const end = start + range.toString().length;
    const raw = text.slice(start, end);
    const quote = raw.trim();
    if (quote.length < 2) {
      setSelection(null);
      return;
    }
    const lead = raw.length - raw.trimStart().length;
    const qStart = start + lead;
    const qEnd = qStart + quote.length;
    const rect = range.getBoundingClientRect();
    const host = (root.offsetParent ?? root).getBoundingClientRect();
    setSelection({
      x: rect.left + rect.width / 2 - host.left,
      y: rect.top - host.top,
      quote: {
        quote,
        prefix: text.slice(Math.max(0, qStart - CONTEXT_CHARS), qStart),
        suffix: text.slice(qEnd, qEnd + CONTEXT_CHARS),
      },
    });
  }, [canHighlight]);

  function onClick(event: MouseEvent<HTMLDivElement>) {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    if (href.startsWith("mailto:")) return;
    event.preventDefault();
    let url: URL;
    try {
      url = new URL(href, doc.url);
    } catch {
      return;
    }
    const here = new URL(doc.url);
    if (url.hash && url.origin === here.origin && url.pathname === here.pathname) {
      contentRef.current?.querySelector(`[id="${CSS.escape(url.hash.slice(1))}"], [name="${CSS.escape(url.hash.slice(1))}"]`)?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (url.protocol === "http:" || url.protocol === "https:") onNavigate(url.href, event.metaKey || event.ctrlKey || event.shiftKey);
  }

  if (mode === "live") {
    return (
      <iframe
        title={doc.title}
        src={doc.url}
        className="h-full w-full border-0 bg-white"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
      />
    );
  }

  const published = formatDate(doc.publishedAt);
  const minutes = Math.max(1, Math.round(doc.wordCount / 230));
  const canonical = doc.canonicalUrl && doc.canonicalUrl !== doc.url ? doc.canonicalUrl : null;

  return (
    <article className="relative mx-auto w-full max-w-[44rem] px-6 pb-24 pt-10 sm:px-10" lang={doc.lang ?? undefined}>
      <header className="mb-8 border-b border-[color:var(--land-hair)] pb-7">
        <p className="dash-eyebrow flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[color:var(--land-gold)]">{doc.siteName ?? displayHost(doc.url)}</span>
          {published ? <span>· {published}</span> : null}
          <span>· {minutes} min read</span>
          {savedCopy ? <span className="text-[color:var(--land-gold-soft)]">· Saved copy</span> : null}
        </p>
        <h1 className="mt-4 text-[clamp(1.7rem,3vw,2.35rem)] font-medium leading-[1.15] tracking-[-0.02em] text-[color:var(--land-ink)]">
          {doc.title}
        </h1>
        {doc.author ? <p className="mt-3 text-[14.5px] text-[color:var(--land-muted)]">By {doc.author}</p> : null}
        <dl className="mt-4 grid gap-1 text-[12px] text-[color:var(--land-faint)]">
          <div className="flex min-w-0 gap-2">
            <dt className="shrink-0">Source</dt>
            <dd className="min-w-0 truncate">
              <a href={doc.url} target="_blank" rel="noopener noreferrer" className="hover:text-[color:var(--land-gold-soft)]">
                {doc.url}
              </a>
            </dd>
          </div>
          {canonical ? (
            <div className="flex min-w-0 gap-2">
              <dt className="shrink-0">Canonical</dt>
              <dd className="min-w-0 truncate">
                <a href={canonical} target="_blank" rel="noopener noreferrer" className="hover:text-[color:var(--land-gold-soft)]">
                  {canonical}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      </header>

      <div
        ref={contentRef}
        onClick={onClick}
        onMouseUp={() => window.setTimeout(readSelection, 0)}
        onKeyUp={readSelection}
      >
        <Article html={doc.contentHtml} />
      </div>
      {doc.wordCount < 40 ? (
        <p className="mt-6 rounded-xl border border-[color:var(--land-hair)] px-4 py-3 text-[13.5px] text-[color:var(--land-muted)]">
          Very little readable text came through. This page may need scripts to render, so try the original.
        </p>
      ) : null}

      {selection ? (
        <button
          type="button"
          className="reader-highlight-button shadow-md"
          style={{ left: selection.x, top: selection.y }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onHighlight(selection.quote);
            window.getSelection()?.removeAllRanges();
            setSelection(null);
          }}
        >
          Highlight
        </button>
      ) : null}
    </article>
  );
}
