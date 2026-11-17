"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Bookmark,
  ChevronDown,
  Copy,
  Download,
  FolderPlus,
  Headphones,
  Layers,
  Loader2,
  Metronome,
  MousePointer,
  Plus,
  Radio,
  Save,
  Scissors,
  SlidersHorizontal,
  Trash2,
  Upload,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { STUDIO_NODE_ID } from "@/extensions/studio/node";
import type { ExtensionHubSnapshot, ExtensionId } from "@/lib/extensions";
import { loadAudioBlob, saveAudioBlob } from "@/lib/studio/audio-db";
import {
  createStudioCollection,
  deleteStudioRecording,
  fetchStudioStatus,
  getStudioRecording,
  listStudioCollections,
  listStudioRecordings,
  saveStudioRecording,
} from "@/lib/studio/studio-client";
import type {
  StudioCollection,
  StudioMarkerKind,
  StudioMarkerV1,
  StudioRecording,
  StudioRecordingSummary,
  StudioTrackRole,
  StudioTrackV1,
} from "@/lib/studio/types";
import { slicePeaksForRange } from "@/lib/studio/wav";
import { useTheme } from "@/lib/theme";
import { ReactiveRecordBar } from "./ReactiveRecordBar";
import { StudioCaptureStage } from "./StudioCaptureStage";
import { StudioRoutingSheet } from "./StudioRoutingSheet";
import {
  TimelineWaveform,
  type LayerMixerState,
  type StudioTimelineTool,
} from "./TimelineWaveform";
import { useStudioAudio } from "./use-studio-audio";

const COUNT_IN_LABELS: Record<string, string> = {
  "0": "Count: Off",
  "1": "Count: 1 bar",
  "2": "Count: 2 bars",
};

const MARKER_KIND_LABELS: Record<StudioMarkerKind, string> = {
  chapter: "Chapter",
  cue: "Cue",
  note: "Note",
  edit: "Edit point",
};

const DEFAULT_LAYER_MIXER: LayerMixerState = {
  gain: 1,
  pan: 0,
  muted: false,
  solo: false,
};

function fmtDuration(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const mins = Math.floor(safe / 60_000);
  const secs = Math.floor((safe % 60_000) / 1000);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function fmtExactSec(ms: number): string {
  const safe = Math.max(0, ms);
  return `${(safe / 1000).toFixed(1)}s`;
}

function makeClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function deriveLayerMixers(list: StudioTrackV1[]): Record<number, LayerMixerState> {
  const map: Record<number, LayerMixerState> = {
    0: { ...DEFAULT_LAYER_MIXER },
    1: { ...DEFAULT_LAYER_MIXER },
  };
  for (const tr of list) {
    const idx = Math.max(0, tr.layerIndex ?? 0);
    if (!map[idx]) {
      map[idx] = {
        gain: tr.gain,
        pan: tr.pan,
        muted: tr.muted,
        solo: tr.solo,
      };
    }
  }
  return map;
}

export function StudioView({
  hub,
  onClose,
  onReleaseNode,
  onRouteTransfer,
}: {
  hub: ExtensionHubSnapshot;
  onClose: () => void;
  onReleaseNode: () => void;
  onRouteTransfer?: (fromId: ExtensionId, toId?: ExtensionId) => void;
}) {
  const { theme } = useTheme();
  const [databaseConfigured, setDatabaseConfigured] = useState(false);
  const [collections, setCollections] = useState<StudioCollection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<string>("");
  const [summaries, setSummaries] = useState<StudioRecordingSummary[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);

  const [title, setTitle] = useState("Untitled session");
  const [description, setDescription] = useState("");
  const [bpm, setBpm] = useState(120);
  const [countInBars, setCountInBars] = useState(1);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [masterGain, setMasterGain] = useState(1);
  const [tracks, setTracks] = useState<StudioTrackV1[]>([]);
  const [markers, setMarkers] = useState<StudioMarkerV1[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  const [layerCount, setLayerCount] = useState(2);
  const [activeLayerIndex, setActiveLayerIndex] = useState(0);
  const [layerMixers, setLayerMixers] = useState<Record<number, LayerMixerState>>({
    0: { ...DEFAULT_LAYER_MIXER },
    1: { ...DEFAULT_LAYER_MIXER },
  });

  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [captureRole, setCaptureRole] = useState<StudioTrackRole>("voice");
  const [markerKind, setMarkerKind] = useState<StudioMarkerKind>("chapter");
  const [toolMode, setToolMode] = useState<StudioTimelineTool>("select");
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [studioPage, setStudioPage] = useState<"record" | "edit">("record");

  const [takesDrawerOpen, setTakesDrawerOpen] = useState(false);
  const [notesDrawerOpen, setNotesDrawerOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [routingOpen, setRoutingOpen] = useState(false);
  const [savedProjectSnapshot, setSavedProjectSnapshot] = useState<StudioRecording | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerTimerRef = useRef<number | undefined>(undefined);
  const sourcePeaksCacheRef = useRef<Map<string, { peaks: number[]; durationMs: number }>>(new Map());

  const showNotice = useCallback((msg: string) => {
    setStatusBanner(msg);
    window.clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = window.setTimeout(() => setStatusBanner(null), 4500);
  }, []);

  useEffect(() => () => window.clearTimeout(bannerTimerRef.current), []);

  const totalTimelineMs = useMemo(
    () => tracks.reduce((max, t) => Math.max(max, t.offsetMs + t.durationMs), 0),
    [tracks],
  );

  const summaryPeaks = useMemo(() => {
    const active = tracks.filter((t) => !t.muted && t.peaks.length > 0);
    const pool = active.length > 0 ? active : tracks.filter((t) => t.peaks.length > 0);
    if (pool.length === 0 || totalTimelineMs <= 0) return [];
    const buckets = 110;
    const out = new Array<number>(buckets).fill(0);
    for (const tr of pool) {
      const startBucket = Math.floor((tr.offsetMs / totalTimelineMs) * buckets);
      const endBucket = Math.min(buckets - 1, Math.ceil(((tr.offsetMs + tr.durationMs) / totalTimelineMs) * buckets));
      const span = Math.max(1, endBucket - startBucket);
      for (let b = startBucket; b <= endBucket; b++) {
        const u = (b - startBucket) / span;
        const pIdx = Math.min(tr.peaks.length - 1, Math.floor(u * tr.peaks.length));
        const amp = Math.min(1, (tr.peaks[pIdx] ?? 0) * tr.gain);
        if (amp > out[b]!) out[b] = amp;
      }
    }
    return out;
  }, [totalTimelineMs, tracks]);

  const persistDraft = useCallback(
    async (
      nextTracks: StudioTrackV1[],
      nextMarkers: StudioMarkerV1[],
      overrides?: {
        id?: string;
        title?: string;
        collectionId?: string;
        bpm?: number;
        countInBars?: number;
        masterGain?: number;
      },
    ): Promise<StudioRecording | null> => {
      const colId = overrides?.collectionId ?? activeCollectionId;
      if (!colId) return null;
      setSaving(true);
      try {
        const dur = nextTracks.reduce((m, t) => Math.max(m, t.offsetMs + t.durationMs), 0);
        const saved = await saveStudioRecording(databaseConfigured, {
          id: overrides?.id ?? activeId,
          collectionId: colId,
          title: (overrides?.title ?? title).trim() || "Untitled session",
          description: description.trim() || null,
          bpm: overrides?.bpm ?? bpm,
          countInBars: overrides?.countInBars ?? countInBars,
          durationMs: dur,
          masterGain: overrides?.masterGain ?? masterGain,
          tracks: nextTracks,
          markers: nextMarkers,
          tags,
        });
        setActiveId(saved.id);
        setSavedProjectSnapshot(saved);
        const list = await listStudioRecordings(databaseConfigured, colId);
        setSummaries(list);
        return saved;
      } catch {
        showNotice("Could not save session metadata.");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [
      activeCollectionId,
      activeId,
      bpm,
      countInBars,
      databaseConfigured,
      description,
      masterGain,
      showNotice,
      tags,
      title,
    ],
  );

  const handleTrackCaptured = useCallback(
    (track: StudioTrackV1) => {
      const key = track.audioRef.idbKey || track.id;
      sourcePeaksCacheRef.current.set(key, {
        peaks: track.peaks,
        durationMs: track.sourceDurationMs ?? track.durationMs,
      });
      const layerIdx = Math.max(0, track.layerIndex ?? activeLayerIndex);
      const layerMix = layerMixers[layerIdx] ?? DEFAULT_LAYER_MIXER;
      const stamped: StudioTrackV1 = {
        ...track,
        layerIndex: layerIdx,
        gain: layerMix.gain,
        pan: layerMix.pan,
        muted: layerMix.muted,
        solo: layerMix.solo,
      };
      setTracks((prev) => {
        const next = [...prev, stamped];
        void persistDraft(next, markers);
        return next;
      });
      setLayerCount((prev) => Math.max(prev, layerIdx + 1));
      setSelectedTrackId(stamped.id);
      showNotice(`Captured ${stamped.name} (${fmtDuration(stamped.durationMs)}) — ready in Edit.`);
    },
    [activeLayerIndex, layerMixers, markers, persistDraft, showNotice],
  );

  const audio = useStudioAudio({
    tracks,
    masterGain,
    bpm,
    countInBars,
    metronomeEnabled,
    onTrackCaptured: handleTrackCaptured,
    onNotice: showNotice,
  });

  function applySessionLoaded(full: StudioRecording) {
    for (const tr of full.tracks) {
      const key = tr.audioRef.idbKey || tr.id;
      if (!sourcePeaksCacheRef.current.has(key) && tr.peaks.length > 0) {
        sourcePeaksCacheRef.current.set(key, {
          peaks: tr.peaks,
          durationMs: tr.sourceDurationMs ?? tr.durationMs,
        });
      }
    }
    const maxLayer = full.tracks.reduce((m, t) => Math.max(m, (t.layerIndex ?? 0) + 1), 2);
    setActiveId(full.id);
    setTitle(full.title);
    setDescription(full.description ?? "");
    setBpm(full.bpm);
    setCountInBars(full.countInBars);
    setMasterGain(full.masterGain);
    setTracks(full.tracks);
    setMarkers(full.markers);
    setTags(full.tags);
    setLayerCount(Math.max(2, maxLayer));
    setLayerMixers(deriveLayerMixers(full.tracks));
    setSelectedTrackId(full.tracks[0]?.id ?? null);
    setSavedProjectSnapshot(full);
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const st = await fetchStudioStatus();
      if (!alive) return;
      setDatabaseConfigured(st.databaseConfigured);
      const cols = await listStudioCollections(st.databaseConfigured);
      if (!alive) return;
      setCollections(cols);
      const firstColId = cols[0]?.id ?? "";
      setActiveCollectionId(firstColId);
      if (firstColId) {
        const recs = await listStudioRecordings(st.databaseConfigured, firstColId);
        if (!alive) return;
        setSummaries(recs);
        if (recs[0]) {
          const full = await getStudioRecording(st.databaseConfigured, recs[0].id);
          if (full && alive) applySessionLoaded(full);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function selectCollection(nextColId: string) {
    setActiveCollectionId(nextColId);
    const list = await listStudioRecordings(databaseConfigured, nextColId);
    setSummaries(list);
  }

  async function loadSession(id: string) {
    audio.pausePlayback();
    if (audio.transport === "recording" || audio.transport === "paused") {
      audio.stopRecording();
    }
    const full = await getStudioRecording(databaseConfigured, id);
    if (!full) return;
    applySessionLoaded(full);
    audio.seek(0);
  }

  function startNewSession() {
    audio.pausePlayback();
    setActiveId(undefined);
    setTitle(`Session ${summaries.length + 1}`);
    setDescription("");
    setTracks([]);
    setMarkers([]);
    setTags([]);
    setLayerCount(2);
    setActiveLayerIndex(0);
    setLayerMixers({ 0: { ...DEFAULT_LAYER_MIXER }, 1: { ...DEFAULT_LAYER_MIXER } });
    setSelectedTrackId(null);
    setSavedProjectSnapshot(null);
    setStudioPage("record");
    audio.seek(0);
  }

  async function handleDeleteSession(id: string) {
    const ok = await deleteStudioRecording(databaseConfigured, id);
    if (!ok) return;
    const list = await listStudioRecordings(databaseConfigured, activeCollectionId);
    setSummaries(list);
    if (activeId === id) {
      if (list[0]) await loadSession(list[0].id);
      else startNewSession();
    }
    showNotice("Deleted studio session.");
  }

  async function handleCreateFolder() {
    const clean = newFolderName.trim();
    if (!clean) return;
    const created = await createStudioCollection(databaseConfigured, clean);
    setCollections((prev) => [created, ...prev]);
    setActiveCollectionId(created.id);
    setSummaries([]);
    setNewFolderName("");
    setNewFolderOpen(false);
    startNewSession();
  }

  const updateTrack = useCallback(
    (trackId: string, updater: (t: StudioTrackV1) => StudioTrackV1) => {
      setTracks((prev) => prev.map((t) => (t.id === trackId ? updater(t) : t)));
    },
    [],
  );

  const handleMoveClip = useCallback(
    (trackId: string, offsetMs: number, nextLayerIndex: number) => {
      const clampedLayer = Math.max(0, Math.min(15, nextLayerIndex));
      const targetMix = layerMixers[clampedLayer] ?? DEFAULT_LAYER_MIXER;
      setLayerCount((prev) => Math.max(prev, clampedLayer + 1));
      setLayerMixers((prev) => (prev[clampedLayer] ? prev : { ...prev, [clampedLayer]: { ...DEFAULT_LAYER_MIXER } }));
      setTracks((prev) =>
        prev.map((tr) =>
          tr.id === trackId
            ? {
                ...tr,
                offsetMs: Math.max(0, Math.round(offsetMs)),
                layerIndex: clampedLayer,
                gain: targetMix.gain,
                pan: targetMix.pan,
                muted: targetMix.muted,
                solo: targetMix.solo,
              }
            : tr,
        ),
      );
    },
    [layerMixers],
  );

  const handleTrimClip = useCallback(
    (trackId: string, patch: { offsetMs: number; trimStartMs: number; durationMs: number }) => {
      setTracks((prev) =>
        prev.map((tr) => {
          if (tr.id !== trackId) return tr;
          const key = tr.audioRef.idbKey || tr.id;
          const cachedFull = sourcePeaksCacheRef.current.get(key);
          const sourceDuration = cachedFull?.durationMs ?? tr.sourceDurationMs ?? (tr.trimStartMs ?? 0) + tr.durationMs;
          const basePeaks = cachedFull?.peaks ?? tr.peaks;
          const peaks =
            cachedFull && sourceDuration > 0
              ? slicePeaksForRange(basePeaks, sourceDuration, patch.trimStartMs, patch.durationMs, 140)
              : slicePeaksForRange(
                  tr.peaks,
                  tr.durationMs,
                  Math.max(0, patch.trimStartMs - (tr.trimStartMs ?? 0)),
                  patch.durationMs,
                  140,
                );
          return {
            ...tr,
            offsetMs: Math.max(0, Math.round(patch.offsetMs)),
            trimStartMs: Math.max(0, Math.round(patch.trimStartMs)),
            durationMs: Math.max(180, Math.round(patch.durationMs)),
            sourceDurationMs: sourceDuration,
            peaks: peaks.length > 0 ? peaks : tr.peaks,
          };
        }),
      );
    },
    [],
  );

  const splitClipAt = useCallback(
    (trackId: string, atTimelineMs: number) => {
      const target = tracks.find((t) => t.id === trackId);
      if (!target) return;
      const cutInClipMs = Math.round(atTimelineMs - target.offsetMs);
      if (cutInClipMs < 140 || cutInClipMs > target.durationMs - 140) {
        showNotice("Place the cut point strictly inside the audio clip to split it.");
        return;
      }

      const origTrimStart = target.trimStartMs ?? 0;
      const sourceDur = target.sourceDurationMs ?? origTrimStart + target.durationMs;
      const leftDur = cutInClipMs;
      const rightDur = target.durationMs - cutInClipMs;
      const rightTrimStart = origTrimStart + cutInClipMs;

      const key = target.audioRef.idbKey || target.id;
      const cachedFull = sourcePeaksCacheRef.current.get(key);
      const leftPeaks = cachedFull
        ? slicePeaksForRange(cachedFull.peaks, cachedFull.durationMs, origTrimStart, leftDur, 120)
        : slicePeaksForRange(target.peaks, target.durationMs, 0, leftDur, 120);
      const rightPeaks = cachedFull
        ? slicePeaksForRange(cachedFull.peaks, cachedFull.durationMs, rightTrimStart, rightDur, 120)
        : slicePeaksForRange(target.peaks, target.durationMs, cutInClipMs, rightDur, 120);

      const baseTitle = target.name.replace(/\s+\(cut(?:\s+\d+)?\)$/i, "");
      const leftClip: StudioTrackV1 = {
        ...target,
        trimStartMs: origTrimStart,
        durationMs: leftDur,
        sourceDurationMs: sourceDur,
        peaks: leftPeaks.length > 0 ? leftPeaks : target.peaks,
      };
      const rightClip: StudioTrackV1 = {
        ...target,
        id: makeClientId("trk"),
        name: `${baseTitle} (cut)`,
        offsetMs: target.offsetMs + cutInClipMs,
        trimStartMs: rightTrimStart,
        durationMs: rightDur,
        sourceDurationMs: sourceDur,
        peaks: rightPeaks.length > 0 ? rightPeaks : target.peaks,
        createdAt: new Date().toISOString(),
      };

      const nextTracks = tracks.flatMap((t) => (t.id === trackId ? [leftClip, rightClip] : [t]));
      setTracks(nextTracks);
      setSelectedTrackId(rightClip.id);
      if (activeId) void persistDraft(nextTracks, markers);
      showNotice(`Split “${target.name}” at ${fmtExactSec(atTimelineMs)}.`);
    },
    [activeId, markers, persistDraft, showNotice, tracks],
  );

  const splittableTrackAtPlayhead = useMemo(() => {
    const preferred = selectedTrackId ? tracks.find((t) => t.id === selectedTrackId) : undefined;
    const isSplittableAtPlayhead = (t: StudioTrackV1) =>
      audio.playheadMs > t.offsetMs + 140 && audio.playheadMs < t.offsetMs + t.durationMs - 140;
    if (preferred && isSplittableAtPlayhead(preferred)) return preferred;
    return tracks.find(isSplittableAtPlayhead) ?? null;
  }, [audio.playheadMs, selectedTrackId, tracks]);

  const handleDuplicateClip = useCallback(
    (track: StudioTrackV1) => {
      const targetLayer = Math.max(0, track.layerIndex ?? 0);
      const copy: StudioTrackV1 = {
        ...track,
        id: makeClientId("trk"),
        name: `${track.name} copy`.slice(0, 60),
        offsetMs: track.offsetMs + track.durationMs + 250,
        layerIndex: targetLayer,
        createdAt: new Date().toISOString(),
      };
      const next = [...tracks, copy];
      setTracks(next);
      setSelectedTrackId(copy.id);
      if (activeId) void persistDraft(next, markers);
      showNotice(`Duplicated “${track.name}”.`);
    },
    [activeId, markers, persistDraft, showNotice, tracks],
  );

  const handleRemoveTrack = useCallback(
    async (track: StudioTrackV1) => {
      const nextTracks = tracks.filter((t) => t.id !== track.id);
      setTracks(nextTracks);
      if (selectedTrackId === track.id) setSelectedTrackId(nextTracks[0]?.id ?? null);
      await audio.removeCachedTrackAudio(track, nextTracks);
      if (activeId) void persistDraft(nextTracks, markers);
    },
    [activeId, audio, markers, persistDraft, selectedTrackId, tracks],
  );

  function updateLayerMixer(layerIndex: number, updater: (prev: LayerMixerState) => LayerMixerState) {
    const nextMixer = updater(layerMixers[layerIndex] ?? DEFAULT_LAYER_MIXER);
    setLayerMixers((prev) => ({ ...prev, [layerIndex]: nextMixer }));
    setTracks((prev) =>
      prev.map((tr) =>
        (tr.layerIndex ?? 0) === layerIndex
          ? {
              ...tr,
              gain: nextMixer.gain,
              pan: nextMixer.pan,
              muted: nextMixer.muted,
              solo: nextMixer.solo,
            }
          : tr,
      ),
    );
  }

  function handleAddLayer() {
    const nextIdx = layerCount;
    setLayerCount((c) => c + 1);
    setLayerMixers((prev) => ({ ...prev, [nextIdx]: { ...DEFAULT_LAYER_MIXER } }));
    setActiveLayerIndex(nextIdx);
  }

  function handleRemoveLayer(layerIdx: number) {
    if (layerIdx < 2) return;
    if (tracks.some((t) => (t.layerIndex ?? 0) === layerIdx)) return;
    setTracks((prev) =>
      prev.map((tr) =>
        (tr.layerIndex ?? 0) > layerIdx ? { ...tr, layerIndex: (tr.layerIndex ?? 0) - 1 } : tr,
      ),
    );
    setLayerCount((c) => Math.max(2, c - 1));
    if (activeLayerIndex >= layerIdx) setActiveLayerIndex((i) => Math.max(0, i - 1));
  }

  async function handleImportStem(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const tr = await audio.importAudioFile(file, activeLayerIndex, Math.round(audio.playheadMs));
    if (!tr) return;
    const key = tr.audioRef.idbKey || tr.id;
    sourcePeaksCacheRef.current.set(key, {
      peaks: tr.peaks,
      durationMs: tr.sourceDurationMs ?? tr.durationMs,
    });
    const nextTracks = [...tracks, tr];
    setTracks(nextTracks);
    setLayerCount((prev) => Math.max(prev, activeLayerIndex + 1));
    setSelectedTrackId(tr.id);
    await persistDraft(nextTracks, markers);
    showNotice(`Imported ${tr.name} onto Layer ${activeLayerIndex + 1}.`);
  }

  const dropMarkerAtPlayhead = useCallback(() => {
    const atMs =
      audio.transport === "recording" || audio.transport === "paused"
        ? Math.round(audio.telemetryRef.current?.recordingProgressMs ?? audio.playheadMs)
        : Math.round(audio.playheadMs);
    const label =
      markerKind === "chapter"
        ? `Section ${markers.filter((m) => m.kind === "chapter").length + 1}`
        : markerKind === "note"
          ? `Note @ ${fmtDuration(atMs)}`
          : `Cue ${markers.length + 1}`;
    const created: StudioMarkerV1 = {
      id: makeClientId("mrk"),
      atMs,
      label,
      kind: markerKind,
      note: null,
    };
    const next = [...markers, created].sort((a, b) => a.atMs - b.atMs);
    setMarkers(next);
    if (activeId || tracks.length > 0) void persistDraft(tracks, next);
    showNotice(`Dropped ${markerKind} marker at ${fmtDuration(atMs)}.`);
  }, [
    activeId,
    audio.playheadMs,
    audio.telemetryRef,
    audio.transport,
    markerKind,
    markers,
    persistDraft,
    showNotice,
    tracks,
  ]);

  async function handleExportMix() {
    setExporting(true);
    try {
      const res = await audio.exportMixWav();
      if (res) {
        triggerDownload(res.blob, res.filename);
        showNotice("Rendered mixed multi-layer WAV.");
      }
    } finally {
      setExporting(false);
    }
  }

  async function handleDownloadRawTrack(track: StudioTrackV1) {
    let blob = await loadAudioBlob(track.audioRef.idbKey);
    if (!blob && track.audioRef.url) {
      try {
        const res = await fetch(track.audioRef.url);
        if (res.ok) {
          blob = await res.blob();
          if (track.audioRef.idbKey) {
            void saveAudioBlob(track.audioRef.idbKey, blob).catch(() => {});
          }
        }
      } catch {
        blob = null;
      }
    }
    if (!blob) {
      showNotice("Audio file is unavailable offline or on the server.");
      return;
    }
    const ext = track.audioRef.mimeType.includes("wav")
      ? "wav"
      : track.audioRef.mimeType.includes("mp4")
        ? "m4a"
        : "webm";
    const safeName = track.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "track";
    triggerDownload(blob, `${safeName}.${ext}`);
  }

  async function openRouting() {
    if (!savedProjectSnapshot && tracks.length > 0) {
      await persistDraft(tracks, markers);
    }
    setRoutingOpen(true);
  }

  const selectedTrack = useMemo(
    () => (selectedTrackId ? tracks.find((t) => t.id === selectedTrackId) ?? null : null),
    [selectedTrackId, tracks],
  );

  // Keyboard shortcuts: Space (Play/Pause), R (Rec/Stop on Record page), M (Marker), V (Move), C (Split), X (Split at playhead)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (audio.transport === "playing") audio.pausePlayback();
        else if (audio.transport === "idle") void audio.play();
      } else if ((e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey && studioPage === "record") {
        e.preventDefault();
        if (audio.transport === "recording" || audio.transport === "paused" || audio.transport === "counting-in") {
          audio.stopRecording();
        } else {
          void audio.startRecording(captureRole, activeLayerIndex);
        }
      } else if ((e.key === "m" || e.key === "M") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        dropMarkerAtPlayhead();
      } else if ((e.key === "v" || e.key === "V") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setToolMode("select");
      } else if ((e.key === "c" || e.key === "C") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setToolMode("cut");
      } else if ((e.key === "x" || e.key === "X") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (splittableTrackAtPlayhead) splitClipAt(splittableTrackAtPlayhead.id, audio.playheadMs);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedTrack && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        void handleRemoveTrack(selectedTrack);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeLayerIndex,
    audio,
    captureRole,
    dropMarkerAtPlayhead,
    handleRemoveTrack,
    selectedTrack,
    splitClipAt,
    splittableTrackAtPlayhead,
    studioPage,
  ]);

  const activeFolderName = collections.find((c) => c.id === activeCollectionId)?.name ?? "Studio sessions";
  const isCaptureLive =
    audio.transport === "recording" || audio.transport === "paused" || audio.transport === "counting-in";
  const micLabel =
    audio.selectedDeviceId === "default"
      ? "Default microphone"
      : (audio.devices.find((d) => d.deviceId === audio.selectedDeviceId)?.label ?? "Default microphone");

  return (
    <section
      aria-label="Nexus Recording Studio"
      data-studio-ready={collections.length > 0 ? "true" : "false"}
      data-studio-page={studioPage}
      className="studio-screen flex h-full w-full flex-col overflow-hidden"
    >
      {/* Unified Full-Screen Header: Left clears Nexus emblem, Centered Record | Edit tabs, Right contextual actions */}
      <header
        data-page={studioPage}
        className="studio-header grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 border-b border-border/75 py-2.5 pl-[92px] pr-4 sm:pr-6 md:grid-cols-[1fr_auto_1fr] md:gap-y-0 md:py-2"
      >
        <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-1 justify-self-start">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (tracks.length > 0 || activeId) void persistDraft(tracks, markers);
            }}
            aria-label="Recording project title"
            className="h-8 w-full min-w-0 max-w-[168px] border-0 bg-transparent px-1.5 text-[14px] font-medium shadow-none focus-visible:ring-1 sm:max-w-[195px]"
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setTakesDrawerOpen(true)}
                  aria-label={`Browse takes (${summaries.length})`}
                  className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className="size-4" />
                </Button>
              }
            />
            <TooltipContent side="bottom">Takes &amp; folders ({summaries.length})</TooltipContent>
          </Tooltip>
          <Badge variant="outline" className="hidden shrink-0 text-[10px] font-normal lg:inline-flex">
            {databaseConfigured ? "Synced" : "Local IDB"}
          </Badge>
        </div>

        <div
          className="studio-tabs col-span-2 row-start-2 -ml-[76px] justify-self-center sm:-ml-[68px] md:col-span-1 md:col-start-2 md:row-start-1 md:ml-0"
          role="tablist"
          aria-label="Studio workspace page"
        >
          <span className="studio-tabs-indicator" data-page={studioPage} aria-hidden />
          <button
            type="button"
            role="tab"
            id="studio-tab-record"
            aria-selected={studioPage === "record"}
            aria-controls="studio-panel-record"
            onClick={() => setStudioPage("record")}
            className={`studio-tab ${studioPage === "record" ? "studio-tab--active" : ""}`}
          >
            <span className={`studio-tab-dot ${isCaptureLive ? "studio-tab-dot--live" : ""}`} aria-hidden />
            <span>Record</span>
          </button>
          <button
            type="button"
            role="tab"
            id="studio-tab-edit"
            aria-selected={studioPage === "edit"}
            aria-controls="studio-panel-edit"
            onClick={() => setStudioPage("edit")}
            className={`studio-tab ${studioPage === "edit" ? "studio-tab--active" : ""}`}
          >
            <span>Edit</span>
            {tracks.length > 0 ? <span className="studio-tab-count">{tracks.length}</span> : null}
          </button>
        </div>

        <div className="contents md:col-start-3 md:row-start-1 md:flex md:items-center md:justify-end md:gap-2 md:justify-self-end">
          {studioPage === "edit" ? (
            <div className="col-span-2 row-start-3 -ml-[76px] flex flex-wrap items-center justify-center gap-1.5 sm:-ml-[68px] md:ml-0 md:gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void persistDraft(tracks, markers)}
                disabled={saving || tracks.length === 0}
                className="h-8 gap-1.5 rounded-full border-border/80 bg-background/40 text-[12px]"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                <span>{saving ? "Saving" : "Save"}</span>
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleExportMix()}
                disabled={exporting || tracks.length === 0}
                className="h-8 gap-1.5 rounded-full border-border/80 bg-background/40 text-[12px]"
              >
                {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                <span>Export WAV</span>
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => void openRouting()}
                className="h-8 gap-1.5 rounded-full bg-foreground text-background hover:opacity-90"
              >
                <Zap className="size-3.5" />
                <span>Send → Node</span>
              </Button>
            </div>
          ) : null}

          <div className="col-start-2 row-start-1 flex items-center gap-1 justify-self-end md:gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="h-8 rounded-full text-[12px] text-muted-foreground hover:text-foreground"
            >
              Exit
            </Button>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onReleaseNode}
              className="hidden h-8 rounded-full text-[12px] text-muted-foreground hover:text-destructive sm:inline-flex"
            >
              Disconnect
            </Button>
          </div>
        </div>
      </header>

      {/* Sliding Dual-Page Container: Record (Default) <-> Edit */}
      <div className="studio-pages-viewport">
        <div className="studio-pages-track" data-page={studioPage}>
          {/* Page 1: Minimal Dedicated Recording Stage (Image 1) */}
          <div
            id="studio-panel-record"
            role="tabpanel"
            aria-labelledby="studio-tab-record"
            aria-hidden={studioPage !== "record"}
            inert={studioPage !== "record"}
            data-active={studioPage === "record" ? "true" : "false"}
            className="studio-page-pane"
          >
            <StudioCaptureStage
              transport={audio.transport}
              micReady={audio.micReady}
              micError={audio.micError}
              statusNotice={statusBanner}
              countInBeat={audio.countInBeat}
              metronomeEnabled={metronomeEnabled}
              overdubEnabled={audio.overdubEnabled}
              monitorInput={audio.monitorInput}
              studioRawMic={audio.studioRawMic}
              inputGain={audio.inputGain}
              devices={audio.devices}
              selectedDeviceId={audio.selectedDeviceId}
              theme={theme}
              sampleTelemetry={audio.sampleTelemetry}
              onArmMic={() => void audio.armMicrophone()}
              onStartRecord={() => void audio.startRecording(captureRole, activeLayerIndex)}
              onPauseRecord={audio.pauseRecording}
              onResumeRecord={audio.resumeRecording}
              onStopRecord={audio.stopRecording}
              onToggleMetronome={() => setMetronomeEnabled((v) => !v)}
              onToggleOverdub={() => audio.setOverdubEnabled(!audio.overdubEnabled)}
              onToggleMonitor={(next) => audio.setMonitorInput(next)}
              onToggleRawMic={(next) => audio.setStudioRawMic(next)}
              onChangeInputGain={(val) => audio.setInputGain(val)}
              onSelectDevice={(id) => audio.setSelectedDeviceId(id)}
              onDropMarker={dropMarkerAtPlayhead}
            />
          </div>

          {/* Page 2: Dedicated Multi-Layer Editorial DAW Workspace (Image 2) */}
          <div
            id="studio-panel-edit"
            role="tabpanel"
            aria-labelledby="studio-tab-edit"
            aria-hidden={studioPage !== "edit"}
            inert={studioPage !== "edit"}
            data-active={studioPage === "edit" ? "true" : "false"}
            className="studio-page-pane"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden px-4 py-3 sm:px-6">
              {audio.micError ? (
                <div role="alert" className="shrink-0 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-[12.5px] text-destructive">
                  {audio.micError}
                </div>
              ) : null}

              {statusBanner ? (
                <div role="status" className="shrink-0 rounded-xl border border-border/80 bg-muted/40 px-4 py-1.5 text-[12px] text-foreground">
                  {statusBanner}
                </div>
              ) : null}

              <div className="shrink-0">
                <ReactiveRecordBar
                  transport={audio.transport}
                  micReady={audio.micReady}
                  playheadMs={audio.playheadMs}
                  totalTimelineMs={totalTimelineMs}
                  summaryPeaks={summaryPeaks}
                  countInBeat={audio.countInBeat}
                  theme={theme}
                  sampleTelemetry={audio.sampleTelemetry}
                  onSeek={audio.seek}
                  onPlay={() => void audio.play()}
                  onPausePlay={audio.pausePlayback}
                  onDropMarker={dropMarkerAtPlayhead}
                />
              </div>

            {/* Row 1: Primary Timeline Editing Tools + Inline Clip Quick Actions (Image 2 Style) */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="inline-flex rounded-full border border-border/80 bg-card/60 p-0.5" role="group" aria-label="Timeline edit mode">
                  <Button
                    type="button"
                    size="sm"
                    variant={toolMode === "select" ? "secondary" : "ghost"}
                    onClick={() => setToolMode("select")}
                    className="h-7 gap-1.5 rounded-full px-2.5 text-[12px]"
                  >
                    <MousePointer className="size-3.5" />
                    <span>Move (V)</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={toolMode === "cut" ? "destructive" : "ghost"}
                    onClick={() => setToolMode("cut")}
                    className="h-7 gap-1.5 rounded-full px-2.5 text-[12px]"
                  >
                    <Scissors className="size-3.5" />
                    <span>Split (C)</span>
                  </Button>
                </div>

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!splittableTrackAtPlayhead}
                        onClick={() => {
                          if (splittableTrackAtPlayhead) splitClipAt(splittableTrackAtPlayhead.id, audio.playheadMs);
                        }}
                        className="h-8 gap-1.5 rounded-full border-border/80 bg-card/60 text-[12px]"
                      >
                        <Scissors className="size-3.5" />
                        <span>Split @ Playhead</span>
                      </Button>
                    }
                  />
                  <TooltipContent side="bottom">Cut audio clip at red playhead line (X)</TooltipContent>
                </Tooltip>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddLayer}
                  className="h-8 gap-1.5 rounded-full border-border/80 bg-card/60 text-[12px]"
                >
                  <Layers className="size-3.5" />
                  <span>+ Layer</span>
                </Button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={(e) => void handleImportStem(e)}
                  className="hidden"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 gap-1.5 rounded-full border-border/80 bg-card/60 text-[12px]"
                >
                  <Upload className="size-3.5" />
                  <span>Import</span>
                </Button>
              </div>

              {selectedTrack ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Input
                    value={selectedTrack.name}
                    onChange={(e) =>
                      updateTrack(selectedTrack.id, (prev) => ({ ...prev, name: e.target.value }))
                    }
                    aria-label="Selected clip name"
                    className="h-7 w-32 rounded-full border-border/75 bg-card/60 px-2.5 text-[11.5px] font-medium"
                  />
                  <span className="hidden font-mono text-[11px] text-muted-foreground tabular-nums lg:inline">
                    {fmtExactSec(selectedTrack.offsetMs)} →{" "}
                    {fmtExactSec(selectedTrack.offsetMs + selectedTrack.durationMs)}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      !(
                        audio.playheadMs > selectedTrack.offsetMs + 140 &&
                        audio.playheadMs < selectedTrack.offsetMs + selectedTrack.durationMs - 140
                      )
                    }
                    onClick={() => splitClipAt(selectedTrack.id, audio.playheadMs)}
                    className="h-7 gap-1 rounded-full border-border/80 bg-card/60 px-2.5 text-[11.5px]"
                  >
                    <Scissors className="size-3" />
                    <span>Split here</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleDuplicateClip(selectedTrack)}
                    className="h-7 gap-1 rounded-full border-border/80 bg-card/60 px-2.5 text-[11.5px]"
                  >
                    <Copy className="size-3" />
                    <span>Duplicate</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleDownloadRawTrack(selectedTrack)}
                    className="h-7 gap-1 rounded-full border-border/80 bg-card/60 px-2.5 text-[11.5px]"
                  >
                    <Download className="size-3" />
                    <span>Audio</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleRemoveTrack(selectedTrack)}
                    className="h-7 gap-1 rounded-full px-2.5 text-[11.5px] text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                    <span>Delete</span>
                  </Button>
                </div>
              ) : null}
            </div>

            {/* Row 2: Timing, Metronome, I/O Popover, Markers & Zoom */}
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <div className="flex h-8 items-center gap-1.5 rounded-full border border-border/80 bg-card/60 px-2.5 text-[12px]">
                <span className="text-muted-foreground">BPM</span>
                <input
                  type="number"
                  min={40}
                  max={240}
                  value={bpm}
                  onChange={(e) => setBpm(Math.max(40, Math.min(240, Number(e.target.value) || 120)))}
                  aria-label="Tempo BPM"
                  className="w-10 bg-transparent text-right font-mono font-semibold text-foreground focus:outline-none"
                />
              </div>

              <Button
                type="button"
                size="sm"
                variant={metronomeEnabled ? "secondary" : "outline"}
                onClick={() => setMetronomeEnabled((v) => !v)}
                aria-pressed={metronomeEnabled}
                className="h-8 gap-1.5 rounded-full border-border/80 bg-card/60 text-[12px]"
              >
                <Metronome className="size-3.5" />
                <span>Click</span>
                {metronomeEnabled ? <span className="h-1.5 w-1.5 rounded-full bg-[#ef332c]" aria-hidden /> : null}
              </Button>

              <Select
                value={String(countInBars)}
                onValueChange={(v) => {
                  if (v !== null) setCountInBars(Number(v));
                }}
              >
                <SelectTrigger aria-label="Count-in bars" className="h-8 min-w-[126px] rounded-full border-border/80 bg-card/60 text-[12px]">
                  <SelectValue>{COUNT_IN_LABELS[String(countInBars)] ?? "Count: 1 bar"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(COUNT_IN_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                size="sm"
                variant={audio.overdubEnabled ? "secondary" : "outline"}
                onClick={() => audio.setOverdubEnabled(!audio.overdubEnabled)}
                className="h-8 gap-1.5 rounded-full border-border/80 bg-card/60 text-[12px]"
              >
                {audio.overdubEnabled ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-[#ef332c]" aria-hidden />
                ) : null}
                <span>Overdub {audio.overdubEnabled ? "On" : "Off"}</span>
              </Button>

              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 rounded-full border-border/80 bg-card/60 text-[12px]"
                    >
                      <SlidersHorizontal className="size-3.5" />
                      <span>Input &amp; Mix</span>
                    </Button>
                  }
                />
                <PopoverContent align="start" className="w-80 space-y-4 rounded-2xl p-4">
                  <div className="space-y-1.5">
                    <label className="text-[11.5px] font-medium text-muted-foreground">Microphone Input</label>
                    <Select
                      value={audio.selectedDeviceId}
                      onValueChange={(v) => {
                        if (v) audio.setSelectedDeviceId(v);
                      }}
                    >
                      <SelectTrigger aria-label="Microphone input" className="h-8 w-full text-[12px]">
                        <SelectValue>{micLabel}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default microphone</SelectItem>
                        {audio.devices.map((d) => (
                          <SelectItem key={d.deviceId} value={d.deviceId}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11.5px] font-medium text-muted-foreground">Capture Tag</label>
                    <Select
                      value={captureRole}
                      onValueChange={(v) => {
                        if (v) setCaptureRole(v as StudioTrackRole);
                      }}
                    >
                      <SelectTrigger aria-label="Next track role" className="h-8 w-full text-[12px]">
                        <SelectValue className="capitalize">{captureRole}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="voice">Voice / Lead</SelectItem>
                        <SelectItem value="overdub">Overdub</SelectItem>
                        <SelectItem value="instrumental">Layer / Instrumental</SelectItem>
                        <SelectItem value="scratch">Scratch / Draft</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[12.5px]">
                      <Headphones className="size-3.5 text-muted-foreground" />
                      <span>Headphone Monitor</span>
                    </div>
                    <Switch
                      checked={audio.monitorInput}
                      onCheckedChange={(checked) => audio.setMonitorInput(checked)}
                      aria-label="Toggle headphone monitor"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[12.5px]">
                      <Radio className="size-3.5 text-muted-foreground" />
                      <span>Raw Unprocessed Mic</span>
                    </div>
                    <Switch
                      checked={audio.studioRawMic}
                      onCheckedChange={(checked) => audio.setStudioRawMic(checked)}
                      aria-label="Toggle raw microphone processing"
                    />
                  </div>

                  <Separator />

                  <div className="space-y-2.5 text-[12px]">
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Mic Gain</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0.5}
                          max={2}
                          step={0.05}
                          value={audio.inputGain}
                          onChange={(e) => audio.setInputGain(Number(e.target.value))}
                          className="studio-range w-28"
                        />
                        <span className="w-9 text-right font-mono text-[11px] tabular-nums">
                          {Math.round(audio.inputGain * 100)}%
                        </span>
                      </div>
                    </label>
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Master Output</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={1.5}
                          step={0.05}
                          value={masterGain}
                          onChange={(e) => setMasterGain(Number(e.target.value))}
                          className="studio-range w-28"
                        />
                        <span className="w-9 text-right font-mono text-[11px] tabular-nums">
                          {Math.round(masterGain * 100)}%
                        </span>
                      </div>
                    </label>
                  </div>
                </PopoverContent>
              </Popover>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setNotesDrawerOpen(true)}
                className="h-8 gap-1.5 rounded-full border-border/80 bg-card/60 text-[12px]"
              >
                <Bookmark className="size-3.5 text-[color:var(--land-gold)]" />
                <span>Markers ({markers.length})</span>
              </Button>

              <div className="inline-flex h-8 items-center rounded-full border border-border/80 bg-card/60 px-1">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setTimelineZoom((z) => Math.max(1, Number((z - 0.5).toFixed(1))))}
                  disabled={timelineZoom <= 1}
                  aria-label="Zoom out timeline"
                  className="h-6 w-6 rounded-full"
                >
                  <ZoomOut className="size-3.5" />
                </Button>
                <span className="px-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                  {timelineZoom}×
                </span>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setTimelineZoom((z) => Math.min(4, Number((z + 0.5).toFixed(1))))}
                  disabled={timelineZoom >= 4}
                  aria-label="Zoom in timeline"
                  className="h-6 w-6 rounded-full"
                >
                  <ZoomIn className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* Full-Height Multi-Layer DAW Canvas */}
            <TimelineWaveform
              tracks={tracks}
              markers={markers}
              layerCount={layerCount}
              activeLayerIndex={activeLayerIndex}
              layerMixers={layerMixers}
              playheadMs={audio.playheadMs}
              totalTimelineMs={totalTimelineMs}
              bpm={bpm}
              zoom={timelineZoom}
              toolMode={toolMode}
              selectedTrackId={selectedTrackId}
              theme={theme}
              onSelectTrack={(id) => setSelectedTrackId(id)}
              onSelectLayer={(idx) => setActiveLayerIndex(idx)}
              onAddLayer={handleAddLayer}
              onRemoveLayer={handleRemoveLayer}
              onMoveClip={handleMoveClip}
              onTrimClip={handleTrimClip}
              onSplitClipAt={splitClipAt}
              onSeek={audio.seek}
              onSelectMarker={(m) => showNotice(`${m.label} (${fmtDuration(m.atMs)})`)}
              onToggleLayerMute={(idx) =>
                updateLayerMixer(idx, (prev) => ({ ...prev, muted: !prev.muted }))
              }
              onToggleLayerSolo={(idx) =>
                updateLayerMixer(idx, (prev) => ({ ...prev, solo: !prev.solo }))
              }
              onChangeLayerGain={(idx, gain) =>
                updateLayerMixer(idx, (prev) => ({ ...prev, gain }))
              }
            />
          </div>
        </div>
      </div>
    </div>

      {/* Left Takes & Folders Sheet Drawer (keeps workspace full width by default) */}
      <Sheet open={takesDrawerOpen} onOpenChange={setTakesDrawerOpen}>
        <SheetContent side="left" className="w-[300px] p-0 sm:max-w-[340px]">
          <SheetHeader className="border-b border-border/60 px-4 py-3">
            <SheetTitle className="text-[14px]">Studio Takes · {activeFolderName}</SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 p-3">
              <Select
                value={activeCollectionId}
                onValueChange={(val) => {
                  if (val) void selectCollection(val);
                }}
              >
                <SelectTrigger aria-label="Studio folder" className="h-8 text-[12px]">
                  <SelectValue>{activeFolderName}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {collections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                onClick={() => setNewFolderOpen((v) => !v)}
                aria-label="New studio folder"
                className="h-8 w-8 shrink-0"
              >
                <FolderPlus className="size-3.5" />
              </Button>
            </div>

            {newFolderOpen ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleCreateFolder();
                }}
                className="flex gap-1.5 border-b border-border/60 p-2.5"
              >
                <Input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name…"
                  className="h-7 text-[12px]"
                />
                <Button type="submit" size="sm" className="h-7 px-2.5 text-[11.5px]">
                  Add
                </Button>
              </form>
            ) : null}

            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Takes ({summaries.length})
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  startNewSession();
                  setTakesDrawerOpen(false);
                }}
                className="h-7 gap-1 px-2 text-[11.5px]"
              >
                <Plus className="size-3" />
                <span>New take</span>
              </Button>
            </div>

            <ScrollArea className="min-h-0 flex-1 px-2 pb-3">
              <div className="space-y-1.5">
                {summaries.length === 0 ? (
                  <p className="px-2 py-4 text-[12px] text-muted-foreground">
                    No saved takes yet. Capture a recording to keep it here.
                  </p>
                ) : (
                  summaries.map((item) => {
                    const selected = item.id === activeId;
                    return (
                      <div
                        key={item.id}
                        className={`group flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 transition-colors ${
                          selected
                            ? "border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/10"
                            : "border-transparent hover:border-border/70 hover:bg-muted/35"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            void loadSession(item.id);
                            setTakesDrawerOpen(false);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="truncate text-[12.5px] font-medium text-foreground">{item.title}</div>
                          <div className="mt-0.5 flex items-center gap-2 font-mono text-[10.5px] text-muted-foreground tabular-nums">
                            <span>{fmtDuration(item.durationMs)}</span>
                            <span>·</span>
                            <span>
                              {item.trackCount} {item.trackCount === 1 ? "clip" : "clips"}
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteSession(item.id)}
                          aria-label={`Delete ${item.title}`}
                          className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>

      {/* Right Markers & Session Context Sheet Drawer */}
      <Sheet open={notesDrawerOpen} onOpenChange={setNotesDrawerOpen}>
        <SheetContent side="right" className="w-[340px] p-0 sm:max-w-[380px]">
          <SheetHeader className="border-b border-border/60 px-4 py-3">
            <SheetTitle className="text-[14px]">Markers &amp; Session Notes</SheetTitle>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-foreground">Timeline Markers ({markers.length})</span>
                <div className="flex items-center gap-1.5">
                  <Select
                    value={markerKind}
                    onValueChange={(v) => {
                      if (v) setMarkerKind(v as StudioMarkerKind);
                    }}
                  >
                    <SelectTrigger aria-label="Marker type" className="h-7 min-w-[104px] text-[11.5px]">
                      <SelectValue>{MARKER_KIND_LABELS[markerKind]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(MARKER_KIND_LABELS) as [StudioMarkerKind, string][]).map(([val, label]) => (
                        <SelectItem key={val} value={val}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={dropMarkerAtPlayhead}
                    className="h-7 rounded-full px-2.5 text-[11.5px]"
                  >
                    Drop @ {fmtDuration(audio.playheadMs)}
                  </Button>
                </div>
              </div>

              {markers.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">
                  Press <kbd className="rounded border border-border px-1 font-mono text-[10.5px]">M</kbd> while recording
                  or playing to mark chapters for Study Space or cut cues for Video Studio.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {markers.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 rounded-xl border border-border/80 bg-background/60 px-2.5 py-1.5 text-[12px]"
                    >
                      <button
                        type="button"
                        onClick={() => audio.seek(m.atMs)}
                        className="font-mono text-[11px] font-semibold text-[color:var(--land-gold)] tabular-nums"
                      >
                        {fmtDuration(m.atMs)}
                      </button>
                      <input
                        value={m.label}
                        onChange={(e) =>
                          setMarkers((prev) => prev.map((x) => (x.id === m.id ? { ...x, label: e.target.value } : x)))
                        }
                        aria-label="Marker label"
                        className="min-w-0 flex-1 bg-transparent text-[12px] text-foreground focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setMarkers((prev) => prev.filter((x) => x.id !== m.id))}
                        aria-label={`Remove marker ${m.label}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <label className="text-[12px] font-medium text-foreground" htmlFor="studio-session-notes">
                Session Context &amp; Notes
              </label>
              <textarea
                id="studio-session-notes"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => {
                  if (tracks.length > 0 || activeId) void persistDraft(tracks, markers);
                }}
                placeholder="Capture lecture topic, lyrics, or edit notes before pushing to Video Studio or Study Space…"
                rows={5}
                className="w-full resize-none rounded-xl border border-border/80 bg-background/60 px-3 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-[color:var(--land-gold)]"
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <StudioRoutingSheet
        open={routingOpen}
        onOpenChange={setRoutingOpen}
        recording={savedProjectSnapshot}
        hub={hub}
        theme={theme}
        onRouteTransfer={(targetId) => onRouteTransfer?.(STUDIO_NODE_ID, targetId)}
      />
    </section>
  );
}
