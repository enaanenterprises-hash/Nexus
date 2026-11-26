"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import {
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  Library,
  Plus,
  RotateCw,
  Search,
  X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";
import { nexusBus } from "@/lib/extensions";
import { RESEARCH_NODE_ID } from "@/extensions/research/node";
import type { ReaderDocument, ResearchSourceSummary } from "@/lib/research/types";
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

function subscribeDesktop(onChange: () => void) {
  const mql = window.matchMedia("(min-width: 768px)");
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getIsDesktop() {
  return window.matchMedia("(min-width: 768px)").matches;
}

/** The browser built into Nexus: search, clean reader, tabs, and research collections. */
export function ResearchView({ request, onClose }: Props) {
  const browser = useResearchBrowser();
  const library = useResearchLibrary();
  const { entry, load } = browser;
  const [address, setAddress] = useState("");
  const [editing, setEditing] = useState(false);
  const [liveFor, setLiveFor] = useState<string | null>(null);
  const isDesktop = useSyncExternalStore(subscribeDesktop, getIsDesktop, () => true);
  const [showLibrary, setShowLibrary] = useState(true);
  const [libraryOverlay, setLibraryOverlay] = useState(false);
  const openLibrary = () => (isDesktop ? setShowLibrary(true) : setLibraryOverlay(true));
  const [saving, setSaving] = useState(false);
  const [focusQuote, setFocusQuote] = useState<{ quote: string; serial: number } | null>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const handled = useRef<number | null>(null);

  const doc: ReaderDocument | null =
    load?.status === "ready"
      ? load.kind === "page"
        ? load.data
        : load.kind === "source"
          ? sourceToDocument(load.data)
          : null
      : null;
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
    browser.navigate(
      parsed.kind === "url" ? { kind: "page", url: parsed.url } : { kind: "search", query: parsed.query },
      { newTab },
    );
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
    browser.navigate(
      parsed.kind === "url" ? { kind: "page", url: parsed.url } : { kind: "search", query: parsed.query },
      { newTab: !fresh },
    );
  }, [request, browser]);

  const viewKey = `${browser.activeId}|${key}`;
  const mode: "reader" | "live" = liveFor === viewKey ? "live" : "reader";
  const setMode = (next: "reader" | "live") => setLiveFor(next === "live" ? viewKey : null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [viewKey]);

  useEffect(() => {
    if (!doc) return;
    nexusBus.emit(
      "research:page-opened",
      { url: doc.url, title: doc.title, siteName: doc.siteName, sourceId: currentSource?.id ?? null },
      RESEARCH_NODE_ID,
    );
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
    body = (
      <LoadingState
        label={
          entry.kind === "search"
            ? `Searching for “${entry.query}”`
            : `Reading ${displayHost(addressText(entry))}`
        }
      />
    );
  } else if (load.status === "error") {
    body = (
      <div className="mx-auto w-full max-w-[46rem] px-6 pt-10 sm:px-10">
        <SearchNotice
          title={load.code === "blocked" ? "That address can't be opened" : "This page didn't come through"}
        >
          <p>{load.message}</p>
          {entry.kind === "page" && load.code !== "blocked" ? (
            <p className="mt-2">
              <a
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[color:var(--land-gold-soft)] hover:underline"
              >
                Open the original in a new tab
              </a>{" "}
              or{" "}
              <button
                type="button"
                onClick={browser.reload}
                className="font-medium text-[color:var(--land-gold-soft)] hover:underline"
              >
                try again
              </button>
              .
            </p>
          ) : null}
        </SearchNotice>
      </div>
    );
  } else if (load.kind === "search") {
    body = (
      <SearchResults
        response={load.data}
        onOpen={(url, newTab) => browser.navigate({ kind: "page", url }, { newTab })}
      />
    );
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
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => browser.selectTab(tab.id)}
                className="min-w-0 flex-1 truncate text-left"
                title={title}
              >
                {title}
              </button>
              <button
                type="button"
                onClick={() => browser.closeTab(tab.id)}
                aria-label={`Close ${title}`}
                className="research-tab-close"
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  browser.newTab();
                  window.setTimeout(() => addressRef.current?.focus(), 0);
                }}
                disabled={browser.tabs.length >= MAX_TABS}
                className="mb-1 rounded-lg"
                aria-label="New tab"
              >
                <Plus className="size-4" />
              </Button>
            }
          />
          <TooltipContent side="bottom">New tab</TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                className="mb-1 rounded-lg"
                aria-label="Close Research"
              >
                <X className="size-4" />
              </Button>
            }
          />
          <TooltipContent side="bottom">Back to the network</TooltipContent>
        </Tooltip>
      </div>

      <div className="research-toolbar flex items-center gap-1.5 border-y border-border/70 px-3 py-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-lg"
                onClick={browser.back}
                disabled={!browser.canBack}
                aria-label="Back"
              >
                <ChevronLeft className="size-4" />
              </Button>
            }
          />
          <TooltipContent side="bottom">Back</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-lg"
                onClick={browser.forward}
                disabled={!browser.canForward}
                aria-label="Forward"
              >
                <ChevronRight className="size-4" />
              </Button>
            }
          />
          <TooltipContent side="bottom">Forward</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-lg max-sm:hidden"
                onClick={browser.reload}
                disabled={entry.kind === "start"}
                aria-label="Reload"
              >
                <RotateCw className="size-4" />
              </Button>
            }
          />
          <TooltipContent side="bottom">Reload page</TooltipContent>
        </Tooltip>

        <form onSubmit={submit} className="research-address mx-1 min-w-0 flex-1">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
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
          <Tabs value={mode} onValueChange={(v) => setMode(v as "reader" | "live")}>
            <TabsList aria-label="View" className="h-8 rounded-lg bg-muted/60 p-0.5">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <TabsTrigger value="reader" className="h-7 rounded-md px-2">
                      <BookOpen className="size-3.5" />
                      <span className="sr-only">Reader view</span>
                    </TabsTrigger>
                  }
                />
                <TooltipContent side="bottom">Reader view</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <TabsTrigger value="live" className="h-7 rounded-md px-2">
                      <Globe className="size-3.5" />
                      <span className="sr-only">Live page</span>
                    </TabsTrigger>
                  }
                />
                <TooltipContent side="bottom">Live page</TooltipContent>
              </Tooltip>
            </TabsList>
          </Tabs>
        ) : null}

        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={`rounded-lg ${currentSource ? "text-[color:var(--land-gold)]" : ""}`}
              onClick={() => (currentSource ? openLibrary() : void save())}
              disabled={!doc || !library.available || saving}
              aria-label={currentSource ? "Saved to collection" : "Save to collection"}
            >
              <Bookmark className="size-4" fill={currentSource ? "currentColor" : "none"} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {!library.available
              ? "Saving needs the research library (DATABASE_URL)"
              : currentSource
                ? "Saved"
                : "Save to collection"}
          </TooltipContent>
        </Tooltip>

        {originalUrl ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <a
                  href={originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open original"
                  className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "rounded-lg")}
                >
                  <ExternalLink className="size-4" />
                </a>
              }
            />
            <TooltipContent side="bottom">Open original</TooltipContent>
          </Tooltip>
        ) : null}

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={`rounded-lg ${showLibrary ? "md:text-[color:var(--land-gold-soft)]" : ""}`}
                onClick={() =>
                  isDesktop ? setShowLibrary((v) => !v) : setLibraryOverlay((v) => !v)
                }
                aria-pressed={showLibrary}
                aria-label="Collections"
              >
                <Library className="size-4" />
              </Button>
            }
          />
          <TooltipContent side="bottom">Collections</TooltipContent>
        </Tooltip>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div ref={scrollRef} data-reader-scroll className="relative min-w-0 flex-1 overflow-y-auto">
          {body}
        </div>

        {showLibrary ? (
          <aside
            className="research-library-aside hidden shrink-0 border-l border-border/70 md:block md:w-[300px]"
            aria-label="Collections"
          >
            <LibraryPanel
              library={library}
              doc={doc}
              currentSource={currentSource}
              activeSourceId={storedSource?.id ?? null}
              onOpenSource={openSource}
              onFocusQuote={(quote) => setFocusQuote((f) => ({ quote, serial: (f?.serial ?? 0) + 1 }))}
              onSave={() => void save()}
              saving={saving}
            />
          </aside>
        ) : null}

        <Sheet open={libraryOverlay && !isDesktop} onOpenChange={setLibraryOverlay}>
          <SheetContent
            side="right"
            showCloseButton={true}
            className="w-[min(340px,100%)] border-l border-border bg-popover p-0 text-popover-foreground md:hidden"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Collections</SheetTitle>
            </SheetHeader>
            <LibraryPanel
              library={library}
              doc={doc}
              currentSource={currentSource}
              activeSourceId={storedSource?.id ?? null}
              onOpenSource={(source) => {
                setLibraryOverlay(false);
                openSource(source);
              }}
              onFocusQuote={(quote) => {
                setLibraryOverlay(false);
                setFocusQuote((f) => ({ quote, serial: (f?.serial ?? 0) + 1 }));
              }}
              onSave={() => void save()}
              saving={saving}
            />
          </SheetContent>
        </Sheet>
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
      <h2 className="font-editorial mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)] font-medium leading-tight tracking-[-0.025em]">
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
          placeholder={
            searchReady === false ? "Enter an address, e.g. apnews.com" : "Search the web or enter an address"
          }
          autoComplete="off"
        />
        <button type="submit" className="dash-send" disabled={!draft.trim()} aria-label="Go">
          <Search className="size-4" />
        </button>
      </form>
      {searchReady === false ? (
        <div className="mt-5">
          <SearchNotice title="Web search isn't set up">
            Add <code className="dash-code text-foreground">BRAVE_SEARCH_API_KEY</code> on the server to
            search. Entering an address works now.
          </SearchNotice>
        </div>
      ) : null}
      {recent.length > 0 ? (
        <div className="mt-12">
          <p className="dash-eyebrow">Recent in {library.active?.name}</p>
          <ul className="mt-2">
            {recent.map((s) => (
              <li key={s.id} className="border-b border-border/70 last:border-b-0">
                <button
                  type="button"
                  onClick={() => onOpenSource(s)}
                  className="group block w-full py-3 text-left"
                >
                  <span className="block truncate text-[15px] font-medium group-hover:text-[color:var(--land-gold-soft)]">
                    {s.title}
                  </span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {s.siteName ?? displayHost(s.url)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
