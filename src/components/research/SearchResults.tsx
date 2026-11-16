"use client";

import type { MouseEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { SearchResponse } from "@/lib/research/types";
import { displayHost } from "./research-client";

type Props = {
  response: SearchResponse;
  onOpen: (url: string, newTab: boolean) => void;
};

export function SearchNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Alert className="rounded-2xl border-[rgba(240,181,74,0.35)] bg-[rgba(240,181,74,0.06)] px-5 py-4">
      <AlertTitle className="text-[14px] font-medium text-[color:var(--land-gold-soft)]">
        {title}
      </AlertTitle>
      <AlertDescription className="mt-1 text-[13.5px] leading-relaxed text-[color:var(--land-muted)]">
        {children}
      </AlertDescription>
    </Alert>
  );
}

export function SearchResults({ response, onOpen }: Props) {
  if (!response.ok) {
    return (
      <div className="mx-auto w-full max-w-[46rem] px-6 pt-10 sm:px-10">
        <SearchNotice
          title={response.reason === "not_configured" ? "Web search isn't set up" : "Search failed"}
        >
          <p>{response.message}</p>
          {response.reason === "not_configured" ? (
            <p className="mt-2">
              Try an address such as{" "}
              <span className="text-[color:var(--land-ink)]">en.wikipedia.org/wiki/Neural_network</span>.
            </p>
          ) : null}
        </SearchNotice>
      </div>
    );
  }

  function open(event: MouseEvent, url: string) {
    event.preventDefault();
    onOpen(url, event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1);
  }

  return (
    <div className="mx-auto w-full max-w-[46rem] px-6 pb-24 pt-8 sm:px-10">
      <p className="dash-eyebrow">
        {response.results.length} results · {response.provider}
      </p>
      {response.results.length === 0 ? (
        <p className="mt-6 text-[15px] text-[color:var(--land-muted)]">
          Nothing came back for “{response.query}”.
        </p>
      ) : (
        <ol className="mt-4">
          {response.results.map((r) => (
            <li key={r.url} className="group border-b border-[color:var(--land-hair)] py-5 last:border-b-0">
              <p className="flex min-w-0 items-center gap-2 text-[12px] text-[color:var(--land-faint)]">
                <span className="truncate text-[color:var(--land-muted)]">
                  {r.siteName ?? displayHost(r.url)}
                </span>
                <span className="truncate">
                  {displayHost(r.url) !== r.siteName ? displayHost(r.url) : null}
                </span>
                {r.age ? <span className="shrink-0">· {r.age}</span> : null}
              </p>
              <a
                href={r.url}
                onClick={(e) => open(e, r.url)}
                onAuxClick={(e) => e.button === 1 && open(e, r.url)}
                className="mt-1 block text-[17px] font-medium leading-snug text-[color:var(--land-ink)] transition-colors group-hover:text-[color:var(--land-gold-soft)]"
              >
                {r.title}
              </a>
              {r.description ? (
                <p className="mt-1.5 line-clamp-3 text-[14px] leading-relaxed text-[color:var(--land-muted)]">
                  {r.description}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
