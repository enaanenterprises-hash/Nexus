"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { nexusBus } from "@/lib/extensions";
import { RESEARCH_NODE_ID } from "@/extensions/research/node";
import type { ReaderDocument, ResearchSourceSummary } from "@/lib/research/types";
import {
  BookmarkIcon,
  ChevronLeft,
  ChevronRight,
  CloseIcon,
  ExternalIcon,
  LibraryIcon,
  LiveIcon,
  PlusIcon,
  ReaderIcon,
  ReloadIcon,
  SearchIcon,
} from "@/components/dashboard/icons";
import { LibraryPanel } from "./LibraryPanel";
import { ReaderView } from "./ReaderView";
import { displayHost, parseAddress, sourceToDocument } from "./research-client";
import { SearchNotice, SearchResults } from "./SearchResults";
import { MAX_TABS, entryKey, tabTitle, useResearchBrowser, type Entry } from "./use-research-browser";
import { useResearchLibrary } from "./use-research-library";

type Props = {
  /** Input handed over from the chat box; `serial` changes for every new request. */
  request: { input: string; serial: number } | null;
  onClose: () => void;
};

function addressText(entry: Entry): string {
  if (entry.kind === "search") return entry.query;
  if (entry.kind === "page" || entry.kind === "source") return entry.url;
  return "";
}

/** The browser built into Nexus: search, clean reader, tabs, and research collections. */
export function ResearchView({ request, onClose }: Props) {
  const browser = useResearchBrowser();
  const library = useResearchLibrary();
  const { entry, load } = browser;
  const [address, setAddress] = useState("");
  const [editing, setEditing] = useState(false);
  const [liveFor, setLiveFor] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(true);
  const [libraryOverlay, setLibraryOverlay] = useState(false);
  const openLibrary = () => (window.innerWidth < 768 ? setLibraryOverlay(true) : setShowLibrary(true));
  const [saving, setSaving] = useState(false);
  const [focusQuote, setFocusQuote] = useState<{ quote: string; serial: number } | null>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const handled = useRef<number | null>(null);

  const doc: ReaderDocument | null =
    load?.status === "ready" ? (load.kind === "page" ? load.data : load.kind === "source" ? sourceToDocument(load.data) : null) : null;
  const storedSource = load?.status === "ready" && load.kind === "source" ? load.data : null;
  const currentSource = storedSource
    ? (library.sources.find((s) => s.id === storedSource.id) ?? storedSource)
    : library.sourceForUrl(doc?.url);
  const key = entryKey(entry);

  const shownAddress = editing ? address : addressText(entry);

  function go(input: string, newTab = false) {
    const parsed = parseAddress(input);
    if (!parsed) return;
    nexusBus.emit("research:query", { query: input.trim(), kind: parsed.kind }, RESEARCH_NODE_ID);
    browser.navigate(parsed.kind === "url" ? { kind: "page", url: parsed.url } : { kind: "search", query: parsed.query }, { newTab });
    setEditing(false);
    addressRef.current?.blur();
  }

  useEffect(() => {
    if (!request || handled.current === request.serial) return;
    handled.current = request.serial;
    const parsed = parseAddress(request.input);
    if (!parsed) {
      addressRef.current?.focus();
      return;
    }
    nexusBus.emit("research:query", { query: request.input.trim(), kind: parsed.kind }, RESEARCH_NODE_ID);
    const fresh = browser.entry.kind === "start";
    browser.navigate(parsed.kind === "url" ? { kind: "page", url: parsed.url } : { kind: "search", query: parsed.query }, { newTab: !fresh });
  }, [request, browser]);

  const viewKey = `${browser.activeId}|${key}`;
  const mode: "reader" | "live" = liveFor === viewKey ? "live" : "reader";
  const setMode = (next: "reader" | "live") => setLiveFor(next === "live" ? viewKey : null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [viewKey]);

  useEffect(() => {
    if (!doc) return;
    nexusBus.emit("research:page-opened", { url: doc.url, title: doc.title, siteName: doc.siteName, sourceId: currentSource?.id ?? null }, RESEARCH_NODE_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.url, doc?.fetchedAt]);

  const { loadHighlights } = library;
  const currentSourceId = currentSource?.id ?? null;
  useEffect(() => {
    if (!currentSourceId) return;
    if (storedSource?.id === currentSourceId) void loadHighlights(currentSourceId, storedSource.highlights);
    else void loadHighlights(currentSourceId);
  }, [currentSourceId, storedSource, loadHighlights]);

  async function save() {
    if (!doc || saving) return;
    setSaving(true);
    const saved = await library.save(doc);
    setSaving(false);
    if (saved) openLibrary();
  }

  async function highlight(quote: { quote: string; prefix: string; suffix: string }) {
    if (!doc) return;
    let sourceId = currentSource?.id ?? null;
    if (!sourceId) sourceId = (await library.save(doc))?.id ?? null;
    if (sourceId) await library.addHighlight(sourceId, quote);
  }

  function openSource(source: ResearchSourceSummary) {
    browser.navigate({ kind: "source", sourceId: source.id, url: source.url, title: source.title });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    go(address);
  }

  let body: ReactNode;
  if (entry.kind === "start") {
    body = <StartPage library={library} onGo={(input) => go(input)} onOpenSource={openSource} />;
  } else if (!load || load.status === "loading") {
    body = <LoadingState label={entry.kind === "search" ? `Searching for “${entry.query}”` : `Reading ${displayHost(addressText(entry))}`} />;
  } else if (load.status === "error") {
    body = (
      <div className="mx-auto w-full max-w-[46rem] px-6 pt-10 sm:px-10">
        <SearchNotice title={load.code === "blocked" ? "That address can't be opened" : "This page didn't come through"}>
          <p>{load.message}</p>
          {entry.kind === "page" && load.code !== "blocked" ? (
            <p className="mt-2">
              <a href={entry.url} target="_blank" rel="noopener noreferrer" className="font-medium text-[color:var(--land-gold-soft)] hover:underline">
                Open the original in a new tab
              </a>{" "}
              or{" "}
              <button type="button" onClick={browser.reload} className="font-medium text-[color:var(--land-gold-soft)] hover:underline">
                try again
              </button>
              .
            </p>
          ) : null}
        </SearchNotice>
      </div>
    );
  } else if (load.kind === "search") {
    body = <SearchResults response={load.data} onOpen={(url, newTab) => browser.navigate({ kind: "page", url }, { newTab })} />;
  } else {
    body = (
      <ReaderView
        doc={doc!}
        mode={mode}
        savedCopy={storedSource ? { savedAt: storedSource.savedAt } : null}
        highlights={currentSource ? (library.highlights[currentSource.id] ?? []) : []}
        canHighlight={library.available}
        focusQuote={focusQuote}
        onHighlight={(q) => void highlight(q)}
        onNavigate={(url, newTab) => browser.navigate({ kind: "page", url }, { newTab })}
      />
    );
  }

  const originalUrl = doc?.url ?? (entry.kind === "page" ? entry.url : null);

  return (
    <section aria-label="Research" className="research flex h-full min-h-0 flex-col">
      <div className="flex items-end gap-1 overflow-x-auto px-3 pt-2" role="tablist" aria-label="Research tabs">
        {browser.tabs.map((tab) => {
          const selected = tab.id === browser.activeId;
          const title = tabTitle(tab, browser.loads);
          return (
            <div key={tab.id} className={`research-tab ${selected ? "research-tab--on" : ""}`}>
              <button type="button" role="tab" aria-selected={selected} onClick={() => browser.selectTab(tab.id)} className="min-w-0 flex-1 truncate text-left" title={title}>
                {title}
              </button>
              <button type="button" onClick={() => browser.closeTab(tab.id)} aria-label={`Close ${title}`} className="research-tab-close">
                <CloseIcon size={12} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => {
            browser.newTab();
            window.setTimeout(() => addressRef.current?.focus(), 0);
          }}
          disabled={browser.tabs.length >= MAX_TABS}
          className="research-icon-button mb-1"
          aria-label="New tab"
          title="New tab"
        >
          <PlusIcon size={15} />
        </button>
        <div className="flex-1" />
        <button type="button" onClick={onClose} className="research-icon-button mb-1" aria-label="Close Research" title="Back to the network">
          <CloseIcon size={15} />
        </button>
      </div>

      <div className="flex items-center gap-1.5 border-y border-[color:var(--land-hair)] bg-[rgba(10,9,7,0.9)] px-3 py-2">
        <button type="button" className="research-icon-button" onClick={browser.back} disabled={!browser.canBack} aria-label="Back">
          <ChevronLeft />
        </button>
        <button type="button" className="research-icon-button" onClick={browser.forward} disabled={!browser.canForward} aria-label="Forward">
          <ChevronRight />
        </button>
        <button type="button" className="research-icon-button max-sm:hidden" onClick={browser.reload} disabled={entry.kind === "start"} aria-label="Reload">
          <ReloadIcon size={16} />
        </button>
        <form onSubmit={submit} className="research-address mx-1 min-w-0 flex-1">
          <SearchIcon size={15} className="shrink-0 text-[color:var(--land-faint)]" />
          <label htmlFor="research-address" className="sr-only">
            Search or enter address
          </label>
          <input
            id="research-address"
            ref={addressRef}
            value={shownAddress}
            onFocus={(e) => {
              setAddress(addressText(entry));
              setEditing(true);
              requestAnimationFrame(() => e.target.select());
            }}
            onBlur={() => setEditing(false)}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && addressRef.current?.blur()}
            placeholder="Search the web or enter an address"
            autoComplete="off"
            spellCheck={false}
          />
        </form>
        {doc?.embeddable ? (
          <div className="research-segment" role="group" aria-label="View">
            <button type="button" aria-pressed={mode === "reader"} onClick={() => setMode("reader")} title="Reader view">
              <ReaderIcon size={15} />
            </button>
            <button type="button" aria-pressed={mode === "live"} onClick={() => setMode("live")} title="Live page">
              <LiveIcon size={15} />
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className={`research-icon-button ${currentSource ? "text-[color:var(--land-gold)]" : ""}`}
          onClick={() => (currentSource ? openLibrary() : void save())}
          disabled={!doc || !library.available || saving}
          aria-label={currentSource ? "Saved to collection" : "Save to collection"}
          title={!library.available ? "Saving needs the research library (DATABASE_URL)" : currentSource ? "Saved" : "Save to collection"}
        >
          <BookmarkIcon size={16} filled={Boolean(currentSource)} />
        </button>
        {originalUrl ? (
          <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="research-icon-button" aria-label="Open original" title="Open original">
            <ExternalIcon size={16} />
          </a>
        ) : null}
        <button
          type="button"
          className={`research-icon-button ${showLibrary ? "md:text-[color:var(--land-gold-soft)]" : ""}`}
          onClick={() => (window.innerWidth < 768 ? setLibraryOverlay((v) => !v) : setShowLibrary((v) => !v))}
          aria-pressed={showLibrary}
          aria-label="Collections"
          title="Collections"
        >
          <LibraryIcon size={16} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div ref={scrollRef} data-reader-scroll className="relative min-w-0 flex-1 overflow-y-auto">
          {body}
        </div>
        {showLibrary || libraryOverlay ? (
          <aside
            className={`shrink-0 border-l border-[color:var(--land-hair)] bg-[rgba(8,7,5,0.97)] md:static md:w-[300px] md:bg-[rgba(8,7,5,0.92)] ${
              libraryOverlay ? "absolute inset-y-0 right-0 z-10 w-[min(320px,100%)]" : "hidden"
            } ${showLibrary ? "md:block" : "md:hidden"}`}
            aria-label="Collections"
          >
            <LibraryPanel
              library={library}
              doc={doc}
              currentSource={currentSource}
              activeSourceId={storedSource?.id ?? null}
              onOpenSource={(source) => {
                setLibraryOverlay(false);
                openSource(source);
              }}
              onFocusQuote={(quote) => setFocusQuote((f) => ({ quote, serial: (f?.serial ?? 0) + 1 }))}
              onSave={() => void save()}
              saving={saving}
            />
          </aside>
        ) : null}
      </div>
    </section>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="mx-auto w-full max-w-[44rem] px-6 pt-10 sm:px-10" aria-busy="true">
      <p className="dash-eyebrow flex items-center gap-2" aria-live="polite">
        <span className="state-dot state-dot--thinking" />
        {label}
      </p>
      <div className="mt-6 space-y-3">
        {[92, 78, 85, 60, 88, 70].map((w, i) => (
          <div key={i} className="research-skeleton h-3.5" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}

function StartPage({
  library,
  onGo,
  onOpenSource,
}: {
  library: ReturnType<typeof useResearchLibrary>;
  onGo: (input: string) => void;
  onOpenSource: (source: ResearchSourceSummary) => void;
}) {
  const [draft, setDraft] = useState("");
  const searchReady = library.status?.search.configured;
  const recent = library.sources.slice(0, 5);

  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col px-6 pb-24 pt-[12vh] sm:px-10">
      <p className="dash-eyebrow">Research · core node</p>
      <h2 className="mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)] font-light leading-tight tracking-[-0.025em]">
        Search, read, and keep what matters.
      </h2>
      <form
        className="dash-input mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          onGo(draft);
        }}
      >
        <label htmlFor="research-start" className="sr-only">
          Search or enter address
        </label>
        <input
          id="research-start"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={searchReady === false ? "Enter an address, e.g. apnews.com" : "Search the web or enter an address"}
          autoComplete="off"
        />
        <button type="submit" className="dash-send" disabled={!draft.trim()} aria-label="Go">
          <SearchIcon size={16} />
        </button>
      </form>
      {searchReady === false ? (
        <div className="mt-5">
          <SearchNotice title="Web search isn't set up">
            Add <code className="dash-code text-[color:var(--land-ink)]">BRAVE_SEARCH_API_KEY</code> on the server to search. Entering an
            address works now.
          </SearchNotice>
        </div>
      ) : null}
      {recent.length > 0 ? (
        <div className="mt-12">
          <p className="dash-eyebrow">Recent in {library.active?.name}</p>
          <ul className="mt-2">
            {recent.map((s) => (
              <li key={s.id} className="border-b border-[color:var(--land-hair)] last:border-b-0">
                <button type="button" onClick={() => onOpenSource(s)} className="group block w-full py-3 text-left">
                  <span className="block truncate text-[15px] font-medium group-hover:text-[color:var(--land-gold-soft)]">{s.title}</span>
                  <span className="block truncate text-[12px] text-[color:var(--land-faint)]">{s.siteName ?? displayHost(s.url)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
