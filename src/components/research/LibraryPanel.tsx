"use client";

import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReaderDocument, ResearchSourceSummary } from "@/lib/research/types";
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

export function LibraryPanel({
  library,
  doc,
  currentSource,
  activeSourceId,
  onOpenSource,
  onFocusQuote,
  onSave,
  saving,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    sourceCount: number;
  } | null>(null);

  const allTags = useMemo(
    () => [...new Set(library.sources.flatMap((s) => s.tags))].sort(),
    [library.sources],
  );
  const visible = tagFilter
    ? library.sources.filter((s) => s.tags.includes(tagFilter))
    : library.sources;
  const highlights = currentSource ? (library.highlights[currentSource.id] ?? []) : [];

  if (library.status && !library.status.library.configured) {
    return (
      <div className="p-5 text-[13.5px] leading-relaxed text-muted-foreground">
        <p className="font-medium text-foreground">Library offline</p>
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
      <div className="border-b border-border/70 p-4">
        <div className="flex items-center justify-between">
          <p className="dash-eyebrow">Collection</p>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setCreating((v) => !v)}
                  aria-label="New collection"
                >
                  <Plus className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent side="left">New collection</TooltipContent>
          </Tooltip>
        </div>

        {creating ? (
          <form onSubmit={submitCollection} className="mt-2.5 flex gap-2">
            <Input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Name, e.g. Housing policy"
              className="h-8 flex-1 rounded-lg border border-border bg-background/50 text-xs"
              maxLength={80}
              aria-label="Collection name"
            />
            <Button
              type="submit"
              size="sm"
              className="border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
            >
              Create
            </Button>
          </form>
        ) : (
          <div className="mt-2.5 flex items-center gap-1.5">
            <Select
              value={library.active?.id ?? ""}
              onValueChange={(value) => {
                if (!value) return;
                library.selectCollection(value);
                setTagFilter(null);
              }}
            >
              <SelectTrigger
                aria-label="Active collection"
                size="sm"
                className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background/50 text-xs"
              >
                <SelectValue>
                  {library.active
                    ? `${library.active.name} (${library.active.sourceCount})`
                    : "Choose collection"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                {library.collections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.sourceCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {library.active && library.collections.length > 0 ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${library.active.name}`}
                      onClick={() =>
                        setDeleteTarget({
                          id: library.active!.id,
                          name: library.active!.name,
                          sourceCount: library.active!.sourceCount,
                        })
                      }
                    >
                      <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  }
                />
                <TooltipContent side="left">Delete collection</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {doc ? (
          <section className="border-b border-border/70 p-4" aria-label="This page">
            <p className="dash-eyebrow">This page</p>
            {currentSource ? (
              <>
                <p className="mt-2 text-[13px] text-muted-foreground">
                  Saved to <span className="text-foreground">{library.active?.name}</span>
                </p>
                <TagEditor
                  tags={currentSource.tags}
                  onChange={(tags) => void library.setTags(currentSource.id, tags)}
                />
                <div className="mt-4">
                  <p className="text-[12px] font-medium text-muted-foreground">
                    Highlights {highlights.length ? `(${highlights.length})` : ""}
                  </p>
                  {highlights.length === 0 ? (
                    <p className="mt-1 text-[12.5px] text-muted-foreground/80">
                      Select text in the article to highlight it.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {highlights.map((h) => (
                        <li key={h.id} className="group flex gap-2">
                          <button
                            type="button"
                            onClick={() => onFocusQuote(h.quote)}
                            className="min-w-0 flex-1 border-l-2 border-[color:var(--land-gold)] pl-2.5 text-left text-[12.5px] leading-snug text-muted-foreground hover:text-foreground"
                          >
                            <span className="line-clamp-3">{h.quote}</span>
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                            onClick={() => void library.removeHighlight(currentSource.id, h.id)}
                            aria-label="Remove highlight"
                          >
                            <X className="size-3" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={onSave}
                disabled={saving || !library.available}
                className="mt-2.5 w-full border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
              >
                {saving ? "Saving…" : `Save to ${library.active?.name ?? "collection"}`}
              </Button>
            )}
          </section>
        ) : null}

        <section className="p-4" aria-label="Sources">
          <div className="flex items-center justify-between">
            <p className="dash-eyebrow">Sources</p>
            <Badge variant="outline" className="h-5 px-2 text-[11px] font-normal tabular-nums">
              {visible.length}
            </Badge>
          </div>
          {allTags.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
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
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
              {library.ready ? "Nothing saved here yet. Open a page and press Save." : "Loading…"}
            </p>
          ) : (
            <ul className="mt-2">
              {visible.map((s) => (
                <li
                  key={s.id}
                  className="group relative border-b border-border/70 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => onOpenSource(s)}
                    className={`block w-full py-3 pr-7 text-left ${
                      activeSourceId === s.id ? "text-[color:var(--land-gold-soft)]" : ""
                    }`}
                  >
                    <span className="line-clamp-2 text-[13.5px] font-medium leading-snug">
                      {s.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                      {s.siteName ?? displayHost(s.url)}
                      {s.highlightCount
                        ? ` · ${s.highlightCount} highlight${s.highlightCount === 1 ? "" : "s"}`
                        : ""}
                    </span>
                    {s.tags.length ? (
                      <span className="mt-1 block truncate text-[11px] text-[color:var(--land-gold)]">
                        {s.tags.map((t) => `#${t}`).join("  ")}
                      </span>
                    ) : null}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="absolute right-0 top-2.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                    onClick={() => void library.removeSource(s.id)}
                    aria-label={`Remove ${s.title}`}
                  >
                    <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </ScrollArea>

      {library.error ? (
        <div className="border-t border-border/70 p-3">
          <Alert role="status" variant="destructive" className="rounded-xl py-2">
            <AlertDescription className="text-xs">{library.error}</AlertDescription>
            <AlertAction>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={library.clearError}
                aria-label="Dismiss"
              >
                <X className="size-3" />
              </Button>
            </AlertAction>
          </Alert>
        </div>
      ) : null}

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="border border-border bg-popover text-popover-foreground ring-0 sm:max-w-md">
          <AlertDialogHeader className="place-items-start text-left">
            <AlertDialogTitle className="font-heading text-xl font-normal">
              Delete collection “{deleteTarget?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the collection and its{" "}
              {deleteTarget?.sourceCount ?? 0} saved{" "}
              {(deleteTarget?.sourceCount ?? 0) === 1 ? "source" : "sources"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  void library.deleteCollection(deleteTarget.id);
                }
                setDeleteTarget(null);
              }}
            >
              Delete collection
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            aria-label={`Remove tag ${tag}`}
            className="ml-1"
          >
            <X className="size-2.5" />
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
        className="min-w-[5rem] flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
