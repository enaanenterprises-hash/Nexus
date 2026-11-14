"use client";

import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ReaderDocument, ResearchSourceSummary } from "@/lib/research/types";
import { CloseIcon, PlusIcon, TrashIcon } from "@/components/dashboard/icons";
import { displayHost } from "./research-client";
import type { ResearchLibrary } from "./use-research-library";

type Props = {
  library: ResearchLibrary;
  doc: ReaderDocument | null;
  currentSource: ResearchSourceSummary | null;
  activeSourceId: string | null;
  onOpenSource: (source: ResearchSourceSummary) => void;
  onFocusQuote: (quote: string) => void;
  onSave: () => void;
  saving: boolean;
};

export function LibraryPanel({ library, doc, currentSource, activeSourceId, onOpenSource, onFocusQuote, onSave, saving }: Props) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const allTags = useMemo(() => [...new Set(library.sources.flatMap((s) => s.tags))].sort(), [library.sources]);
  const visible = tagFilter ? library.sources.filter((s) => s.tags.includes(tagFilter)) : library.sources;
  const highlights = currentSource ? (library.highlights[currentSource.id] ?? []) : [];

  if (library.status && !library.status.library.configured) {
    return (
      <div className="p-5 text-[13.5px] leading-relaxed text-[color:var(--land-muted)]">
        <p className="font-medium text-[color:var(--land-ink)]">Library offline</p>
        <p className="mt-1">Saving sources needs Postgres. Set DATABASE_URL on the server.</p>
      </div>
    );
  }

  async function submitCollection(event: FormEvent) {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) return;
    await library.createCollection(name);
    setDraftName("");
    setCreating(false);
    setTagFilter(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[color:var(--land-hair)] p-4">
        <div className="flex items-center justify-between">
          <p className="dash-eyebrow">Collection</p>
          <button
            type="button"
            className="research-icon-button"
            onClick={() => setCreating((v) => !v)}
            aria-label="New collection"
            title="New collection"
          >
            <PlusIcon size={15} />
          </button>
        </div>
        {creating ? (
          <form onSubmit={submitCollection} className="mt-2 flex gap-2">
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Name, e.g. Housing policy"
              className="research-field flex-1"
              maxLength={80}
              aria-label="Collection name"
            />
            <button type="submit" className="dash-button dash-button--gold">
              Create
            </button>
          </form>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <select
              className="research-field min-w-0 flex-1"
              value={library.active?.id ?? ""}
              onChange={(e) => {
                library.selectCollection(e.target.value);
                setTagFilter(null);
              }}
              aria-label="Active collection"
            >
              {library.collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.sourceCount})
                </option>
              ))}
            </select>
            {library.active && library.collections.length > 0 ? (
              <button
                type="button"
                className="research-icon-button"
                aria-label={`Delete ${library.active.name}`}
                title="Delete collection"
                onClick={() => {
                  if (window.confirm(`Delete “${library.active!.name}” and its ${library.active!.sourceCount} sources?`)) {
                    void library.deleteCollection(library.active!.id);
                  }
                }}
              >
                <TrashIcon size={15} />
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="dash-panel min-h-0 flex-1 overflow-y-auto">
        {doc ? (
          <section className="border-b border-[color:var(--land-hair)] p-4" aria-label="This page">
            <p className="dash-eyebrow">This page</p>
            {currentSource ? (
              <>
                <p className="mt-2 text-[13px] text-[color:var(--land-muted)]">
                  Saved to <span className="text-[color:var(--land-ink)]">{library.active?.name}</span>
                </p>
                <TagEditor tags={currentSource.tags} onChange={(tags) => void library.setTags(currentSource.id, tags)} />
                <div className="mt-4">
                  <p className="text-[12px] font-medium text-[color:var(--land-faint)]">
                    Highlights {highlights.length ? `(${highlights.length})` : ""}
                  </p>
                  {highlights.length === 0 ? (
                    <p className="mt-1 text-[12.5px] text-[color:var(--land-faint)]">Select text in the article to highlight it.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {highlights.map((h) => (
                        <li key={h.id} className="group flex gap-2">
                          <button
                            type="button"
                            onClick={() => onFocusQuote(h.quote)}
                            className="min-w-0 flex-1 border-l-2 border-[color:var(--land-gold)] pl-2.5 text-left text-[12.5px] leading-snug text-[color:var(--land-muted)] hover:text-[color:var(--land-ink)]"
                          >
                            <span className="line-clamp-3">{h.quote}</span>
                          </button>
                          <button
                            type="button"
                            className="research-icon-button opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            onClick={() => void library.removeHighlight(currentSource.id, h.id)}
                            aria-label="Remove highlight"
                          >
                            <CloseIcon size={13} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={onSave}
                disabled={saving || !library.available}
                className="dash-button dash-button--gold mt-2 w-full"
              >
                {saving ? "Saving…" : `Save to ${library.active?.name ?? "collection"}`}
              </button>
            )}
          </section>
        ) : null}

        <section className="p-4" aria-label="Sources">
          <div className="flex items-baseline justify-between">
            <p className="dash-eyebrow">Sources</p>
            <p className="text-[11.5px] text-[color:var(--land-faint)]">{visible.length}</p>
          </div>
          {allTags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTagFilter((t) => (t === tag ? null : tag))}
                  className={`research-tag ${tagFilter === tag ? "research-tag--on" : ""}`}
                  aria-pressed={tagFilter === tag}
                >
                  #{tag}
                </button>
              ))}
            </div>
          ) : null}
          {visible.length === 0 ? (
            <p className="mt-3 text-[12.5px] leading-relaxed text-[color:var(--land-faint)]">
              {library.ready ? "Nothing saved here yet. Open a page and press Save." : "Loading…"}
            </p>
          ) : (
            <ul className="mt-2">
              {visible.map((s) => (
                <li key={s.id} className="group relative border-b border-[color:var(--land-hair)] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onOpenSource(s)}
                    className={`block w-full py-3 pr-7 text-left ${activeSourceId === s.id ? "text-[color:var(--land-gold-soft)]" : ""}`}
                  >
                    <span className="line-clamp-2 text-[13.5px] font-medium leading-snug">{s.title}</span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-[color:var(--land-faint)]">
                      {s.siteName ?? displayHost(s.url)}
                      {s.highlightCount ? ` · ${s.highlightCount} highlight${s.highlightCount === 1 ? "" : "s"}` : ""}
                    </span>
                    {s.tags.length ? (
                      <span className="mt-1 block truncate text-[11px] text-[color:var(--land-gold)]">
                        {s.tags.map((t) => `#${t}`).join("  ")}
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="research-icon-button absolute right-0 top-2.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => void library.removeSource(s.id)}
                    aria-label={`Remove ${s.title}`}
                  >
                    <TrashIcon size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {library.error ? (
        <div role="status" className="flex items-start gap-2 border-t border-[color:var(--land-hair)] p-3 text-[12.5px] text-[color:var(--land-gold-soft)]">
          <p className="flex-1">{library.error}</p>
          <button type="button" className="research-icon-button" onClick={library.clearError} aria-label="Dismiss">
            <CloseIcon size={13} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function commit() {
    const next = draft
      .split(",")
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-"))
      .filter(Boolean);
    setDraft("");
    if (next.length) onChange([...new Set([...tags, ...next])]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit();
    } else if (event.key === "Backspace" && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="research-field mt-3 flex min-h-9 flex-wrap items-center gap-1.5 py-1.5">
      {tags.map((tag) => (
        <span key={tag} className="research-tag research-tag--on">
          #{tag}
          <button type="button" onClick={() => onChange(tags.filter((t) => t !== tag))} aria-label={`Remove tag ${tag}`} className="ml-1">
            <CloseIcon size={10} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={tags.length ? "" : "Add tags…"}
        aria-label="Add tag"
        className="min-w-[5rem] flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[color:var(--land-faint)]"
      />
    </div>
  );
}
