"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { nexusBus } from "@/lib/extensions";
import { RESEARCH_NODE_ID } from "@/extensions/research/node";
import type {
  ReaderDocument,
  ResearchCollection,
  ResearchSourceSummary,
  ResearchStatus,
  SourceHighlight,
} from "@/lib/research/types";
import { ApiFailure, researchApi } from "./research-client";

const ACTIVE_KEY = "nexus.research.collection";

export type TextQuote = { quote: string; prefix: string; suffix: string };

function message(error: unknown) {
  return error instanceof ApiFailure ? error.message : "Your research library could not be reached.";
}

/** Collections, saved sources and highlights for the signed-in user. */
export function useResearchLibrary() {
  const [status, setStatus] = useState<ResearchStatus | null>(null);
  const [collections, setCollections] = useState<ResearchCollection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sources, setSources] = useState<ResearchSourceSummary[]>([]);
  const [highlights, setHighlights] = useState<Record<string, SourceHighlight[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const s = await researchApi.status();
        if (!live) return;
        setStatus(s);
        if (!s.library.configured) return;
        const { collections: list } = await researchApi.collections();
        if (!live) return;
        setCollections(list);
        const remembered = window.localStorage.getItem(ACTIVE_KEY);
        setActiveId(list.find((c) => c.id === remembered)?.id ?? list[0]?.id ?? null);
      } catch (e) {
        if (live) setError(message(e));
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!activeId) return;
    window.localStorage.setItem(ACTIVE_KEY, activeId);
    let live = true;
    researchApi
      .sources(activeId)
      .then(({ sources: list }) => live && setSources(list))
      .catch((e) => live && setError(message(e)));
    return () => {
      live = false;
    };
  }, [activeId]);

  const bumpCount = useCallback((collectionId: string, delta: number) => {
    setCollections((list) => list.map((c) => (c.id === collectionId ? { ...c, sourceCount: Math.max(0, c.sourceCount + delta) } : c)));
  }, []);

  const createCollection = useCallback(async (name: string) => {
    try {
      const { collection } = await researchApi.createCollection(name);
      setCollections((list) => [collection, ...list]);
      setSources([]);
      setActiveId(collection.id);
      return collection;
    } catch (e) {
      setError(message(e));
      return null;
    }
  }, []);

  const renameCollection = useCallback(async (id: string, name: string) => {
    try {
      const { collection } = await researchApi.renameCollection(id, name);
      setCollections((list) => list.map((c) => (c.id === id ? collection : c)));
    } catch (e) {
      setError(message(e));
    }
  }, []);

  const deleteCollection = useCallback(
    async (id: string) => {
      try {
        await researchApi.deleteCollection(id);
        const rest = collections.filter((c) => c.id !== id);
        if (rest.length === 0) {
          const { collections: fresh } = await researchApi.collections();
          setCollections(fresh);
          setActiveId(fresh[0]?.id ?? null);
        } else {
          setCollections(rest);
          if (activeId === id) setActiveId(rest[0]!.id);
        }
      } catch (e) {
        setError(message(e));
      }
    },
    [collections, activeId],
  );

  const sourceForUrl = useCallback(
    (url: string | null | undefined) => (url ? sources.find((s) => s.url === url) ?? null : null),
    [sources],
  );

  const save = useCallback(
    async (doc: ReaderDocument, tags: string[] = []) => {
      if (!activeId) return null;
      try {
        const existed = sources.some((s) => s.url === doc.url);
        const { source } = await researchApi.saveSource(activeId, doc, tags);
        setSources((list) => [source, ...list.filter((s) => s.id !== source.id)]);
        if (!existed) bumpCount(activeId, 1);
        nexusBus.emit(
          "research:source-saved",
          { sourceId: source.id, collectionId: activeId, url: source.url, title: source.title },
          RESEARCH_NODE_ID,
        );
        return source;
      } catch (e) {
        setError(message(e));
        return null;
      }
    },
    [activeId, sources, bumpCount],
  );

  const setTags = useCallback(async (sourceId: string, tags: string[]) => {
    try {
      const { source } = await researchApi.updateSource(sourceId, { tags });
      setSources((list) => list.map((s) => (s.id === sourceId ? source : s)));
    } catch (e) {
      setError(message(e));
    }
  }, []);

  const removeSource = useCallback(
    async (sourceId: string) => {
      try {
        await researchApi.deleteSource(sourceId);
        setSources((list) => list.filter((s) => s.id !== sourceId));
        if (activeId) bumpCount(activeId, -1);
      } catch (e) {
        setError(message(e));
      }
    },
    [activeId, bumpCount],
  );

  const loadHighlights = useCallback(async (sourceId: string, known?: SourceHighlight[]) => {
    if (known) {
      setHighlights((map) => ({ ...map, [sourceId]: known }));
      return;
    }
    try {
      const { source } = await researchApi.source(sourceId);
      setHighlights((map) => ({ ...map, [sourceId]: source.highlights }));
    } catch {
      /* highlights are best-effort decoration */
    }
  }, []);

  const addHighlight = useCallback(async (sourceId: string, quote: TextQuote) => {
    try {
      const { highlight } = await researchApi.addHighlight(sourceId, quote);
      setHighlights((map) => ({ ...map, [sourceId]: [...(map[sourceId] ?? []), highlight] }));
      setSources((list) => list.map((s) => (s.id === sourceId ? { ...s, highlightCount: s.highlightCount + 1 } : s)));
      nexusBus.emit("research:highlight-added", { sourceId, highlightId: highlight.id, quote: highlight.quote }, RESEARCH_NODE_ID);
      return highlight;
    } catch (e) {
      setError(message(e));
      return null;
    }
  }, []);

  const removeHighlight = useCallback(async (sourceId: string, id: string) => {
    try {
      await researchApi.deleteHighlight(id);
      setHighlights((map) => ({ ...map, [sourceId]: (map[sourceId] ?? []).filter((h) => h.id !== id) }));
      setSources((list) => list.map((s) => (s.id === sourceId ? { ...s, highlightCount: Math.max(0, s.highlightCount - 1) } : s)));
    } catch (e) {
      setError(message(e));
    }
  }, []);

  const active = useMemo(() => collections.find((c) => c.id === activeId) ?? null, [collections, activeId]);

  return {
    ready,
    status,
    available: Boolean(status?.library.configured) && Boolean(activeId),
    collections,
    active,
    sources,
    highlights,
    error,
    clearError: useCallback(() => setError(null), []),
    selectCollection: setActiveId,
    createCollection,
    renameCollection,
    deleteCollection,
    sourceForUrl,
    save,
    setTags,
    removeSource,
    loadHighlights,
    addHighlight,
    removeHighlight,
  };
}

export type ResearchLibrary = ReturnType<typeof useResearchLibrary>;
