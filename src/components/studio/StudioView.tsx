"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  ChevronDown,
  Download,
  Film,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Layers,
  Link2,
  Loader2,
  Magnet,
  Metronome,
  MonitorPlay,
  MoreHorizontal,
  PanelRight,
  Pause,
  Play,
  Plus,
  Redo2,
  Repeat,
  Save,
  Scissors,
  SkipBack,
  SlidersHorizontal,
  SplitSquareHorizontal,
  Square,
  Trash2,
  Undo2,
  Upload,
  Waves,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { CinemaExtractedAudioTransfer, CinemaVoiceoverRequest } from "@/lib/cinema/types";
import GlassSurface from "@/components/landing/GlassSurface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { STUDIO_NODE_ID } from "@/extensions/studio/node";
import { detectBeatsAndTransients, detectSpeechAndSilenceRegions } from "@/lib/creative/nexus-bridge";
import type { ExtensionHubSnapshot, ExtensionId } from "@/lib/extensions";
import { loadAudioBlob, saveAudioBlob } from "@/lib/studio/audio-db";
import { defaultStudioColorForSlot } from "@/lib/studio/colors";
import {
  createStudioCollection,
  deleteStudioRecording,
  emitStudioAudioRepaired,
  emitStudioRhythmGrid,
  emitStudioSmartCuts,
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
  StudioTrackColor,
  StudioTrackV1,
} from "@/lib/studio/types";
import { computePeaksFromBuffer, slicePeaksForRange } from "@/lib/studio/wav";
import { StudioCaptureStage } from "./StudioCaptureStage";
import { StudioCinemaMonitor } from "./StudioCinemaMonitor";
import { StudioInspectorContent, type StudioInspectorTab } from "./StudioInspector";
import { StudioIoPatchbay } from "./StudioIoPatchbay";
import { StudioRoutingSheet } from "./StudioRoutingSheet";
import {
  TimelineWaveform,
  type LayerMixerState,
} from "./TimelineWaveform";
import { useStudioAudio } from "./use-studio-audio";
import { resolveVaultItemBlob, saveBlobToVault, useVault } from "@/lib/storage/vault-client";

const DEFAULT_LAYER_MIXER: LayerMixerState = {
  gain: 1,
  pan: 0,
  muted: false,
  solo: false,
};

type HistorySnapshot = {
  tracks: StudioTrackV1[];
  markers: StudioMarkerV1[];
};

const MAX_HISTORY = 30;

function defaultLayerColor(idx: number): StudioTrackColor {
  return defaultStudioColorForSlot(idx);
}

function fmtDuration(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const mins = Math.floor(safe / 60_000);
  const secs = Math.floor((safe % 60_000) / 1000);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function fmtTimecode(ms: number): string {
  const safe = Math.max(0, ms);
  const mins = Math.floor(safe / 60_000);
  const secs = Math.floor((safe % 60_000) / 1000);
  const tenths = Math.floor((safe % 1000) / 100);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
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
    0: { ...DEFAULT_LAYER_MIXER, name: "Track 1", colorTag: "blue" },
    1: { ...DEFAULT_LAYER_MIXER, name: "Track 2", colorTag: "teal" },
  };
  for (const tr of list) {
    const idx = Math.max(0, tr.layerIndex ?? 0);
    const existing = map[idx];
    if (!existing || (idx < 2 && existing.inputHint === undefined && tr.inputSource)) {
      map[idx] = {
        name: tr.name.replace(/\s+\(cut(?:\s+\d+)?\)$/i, ""),
        inputHint: tr.inputSource,
        colorTag: tr.colorTag ?? defaultLayerColor(idx),
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
  incomingVoiceover,
  incomingCinemaAudio,
  incomingVaultItem,
  onClose,
  onReleaseNode,
  onOpenCinema,
  onOpenCommandStorage,
  onRouteTransfer,
  onSendToCinema,
}: {
  hub: ExtensionHubSnapshot;
  incomingVoiceover?: { request: CinemaVoiceoverRequest; serial: number } | null;
  incomingCinemaAudio?: { transfer: CinemaExtractedAudioTransfer; serial: number } | null;
  incomingVaultItem?: { itemId: string; serial: number } | null;
  onClose: () => void;
  onReleaseNode: () => void;
  onOpenCinema?: () => void;
  onOpenCommandStorage?: (itemId?: string) => void;
  onRouteTransfer?: (fromId: ExtensionId, toId?: ExtensionId) => void;
  onSendToCinema?: (recording: StudioRecording, mode: "mix" | "stems") => void;
}) {
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
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [masterGain, setMasterGain] = useState(1);
  const [tracks, setTracks] = useState<StudioTrackV1[]>([]);
  const [markers, setMarkers] = useState<StudioMarkerV1[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  const [layerCount, setLayerCount] = useState(2);
  const [activeLayerIndex, setActiveLayerIndex] = useState(0);
  const [layerMixers, setLayerMixers] = useState<Record<number, LayerMixerState>>({
    0: { ...DEFAULT_LAYER_MIXER, name: "Track 1", colorTag: "blue" },
    1: { ...DEFAULT_LAYER_MIXER, name: "Track 2", colorTag: "teal" },
  });

  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [markerKind, setMarkerKind] = useState<StudioMarkerKind>("chapter");
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [studioPage, setStudioPage] = useState<"record" | "edit">("record");

  // Drawers, Inspector & Patchbay (Inspector stays quietly collapsed by default for gallery calm)
  const [takesDrawerOpen, setTakesDrawerOpen] = useState(false);
  const [patchbayOpen, setPatchbayOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<StudioInspectorTab>("clip");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [routingOpen, setRoutingOpen] = useState(false);
  const [savedProjectSnapshot, setSavedProjectSnapshot] = useState<StudioRecording | null>(null);

  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<"mix" | "stems" | null>(null);
  const [normalizing, setNormalizing] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [linkedCinemaVoiceover, setLinkedCinemaVoiceover] = useState<CinemaVoiceoverRequest | null>(
    null,
  );
  const [activeCinemaRepair, setActiveCinemaRepair] = useState<CinemaExtractedAudioTransfer | null>(
    null,
  );
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [analyzingBridge, setAnalyzingBridge] = useState<string | null>(null);
  const voiceoverSerialRef = useRef(0);
  const cinemaAudioSerialRef = useRef(0);
  const vault = useVault();
  const [savingToVault, setSavingToVault] = useState(false);
  const vaultItemSerialRef = useRef(0);

  // Undo / Redo Stacks
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerTimerRef = useRef<number | undefined>(undefined);
  const sourcePeaksCacheRef = useRef<Map<string, { peaks: number[]; durationMs: number }>>(new Map());
  const tracksRef = useRef(tracks);
  const markersRef = useRef(markers);

  useEffect(() => {
    tracksRef.current = tracks;
    markersRef.current = markers;
  }, [markers, tracks]);

  const showNotice = useCallback((msg: string) => {
    setStatusBanner(msg);
    window.clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = window.setTimeout(() => setStatusBanner(null), 4800);
  }, []);

  useEffect(() => () => window.clearTimeout(bannerTimerRef.current), []);

  const pushHistory = useCallback(() => {
    const snap: HistorySnapshot = {
      tracks: tracksRef.current,
      markers: markersRef.current,
    };
    setUndoStack((prev) => [...prev.slice(-(MAX_HISTORY - 1)), snap]);
    setRedoStack([]);
  }, []);

  const totalTimelineMs = useMemo(
    () => tracks.reduce((max, t) => Math.max(max, t.offsetMs + t.durationMs), 0),
    [tracks],
  );

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

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1]!;
      setRedoStack((r) => [...r.slice(-(MAX_HISTORY - 1)), { tracks: tracksRef.current, markers: markersRef.current }]);
      setTracks(last.tracks);
      setMarkers(last.markers);
      if (activeId) void persistDraft(last.tracks, last.markers);
      showNotice("Undid last edit.");
      return prev.slice(0, -1);
    });
  }, [activeId, persistDraft, showNotice]);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1]!;
      setUndoStack((u) => [...u.slice(-(MAX_HISTORY - 1)), { tracks: tracksRef.current, markers: markersRef.current }]);
      setTracks(next.tracks);
      setMarkers(next.markers);
      if (activeId) void persistDraft(next.tracks, next.markers);
      showNotice("Redid edit.");
      return prev.slice(0, -1);
    });
  }, [activeId, persistDraft, showNotice]);

  const handleTracksCaptured = useCallback(
    (captured: StudioTrackV1[]) => {
      if (captured.length === 0) return;
      pushHistory();

      let highestLayer = layerCount - 1;
      const mixerPatches: Record<number, LayerMixerState> = {};

      const stamped = captured.map((tr) => {
        const key = tr.audioRef.idbKey || tr.id;
        sourcePeaksCacheRef.current.set(key, {
          peaks: tr.peaks,
          durationMs: tr.sourceDurationMs ?? tr.durationMs,
        });
        const layerIdx = Math.max(0, tr.layerIndex ?? activeLayerIndex);
        if (layerIdx > highestLayer) highestLayer = layerIdx;
        const existingMix = layerMixers[layerIdx] ?? {
          ...DEFAULT_LAYER_MIXER,
          colorTag: tr.colorTag ?? defaultLayerColor(layerIdx),
        };
        mixerPatches[layerIdx] = {
          ...existingMix,
          name: tr.name,
          inputHint: tr.inputSource ?? existingMix.inputHint,
          colorTag: tr.colorTag ?? existingMix.colorTag ?? defaultLayerColor(layerIdx),
        };
        return {
          ...tr,
          layerIndex: layerIdx,
          gain: existingMix.gain,
          pan: existingMix.pan,
          muted: existingMix.muted,
          solo: existingMix.solo,
        };
      });

      setLayerMixers((prev) => ({ ...prev, ...mixerPatches }));
      setLayerCount((prev) => Math.max(prev, highestLayer + 1));
      setTracks((prev) => {
        const next = [...prev, ...stamped];
        void persistDraft(next, markersRef.current);
        return next;
      });
      setSelectedTrackId(stamped[0]!.id);

      const durLabel = fmtDuration(stamped[0]!.durationMs);
      showNotice(
        stamped.length > 1
          ? `Captured ${stamped.length} sample-locked WAV stems (${durLabel}) — ready in Arrange.`
          : `Captured ${stamped[0]!.name} (${durLabel}) — ready in Arrange.`,
      );
    },
    [activeLayerIndex, layerCount, layerMixers, persistDraft, pushHistory, showNotice],
  );

  const audio = useStudioAudio({
    tracks,
    masterGain,
    bpm,
    countInBars,
    metronomeEnabled,
    loopEnabled,
    onTracksCaptured: handleTracksCaptured,
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
    setUndoStack([]);
    setRedoStack([]);
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
    setLayerMixers({
      0: { ...DEFAULT_LAYER_MIXER, name: audio.inputs[0]?.label || "Track 1", colorTag: "blue" },
      1: { ...DEFAULT_LAYER_MIXER, name: audio.inputs[1]?.label || "Track 2", colorTag: "teal" },
    });
    setSelectedTrackId(null);
    setSavedProjectSnapshot(null);
    setUndoStack([]);
    setRedoStack([]);
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
      pushHistory();
      const clampedLayer = Math.max(0, Math.min(15, nextLayerIndex));
      const targetMix = layerMixers[clampedLayer] ?? {
        ...DEFAULT_LAYER_MIXER,
        name: `Track ${clampedLayer + 1}`,
        colorTag: defaultLayerColor(clampedLayer),
      };
      setLayerCount((prev) => Math.max(prev, clampedLayer + 1));
      setLayerMixers((prev) => (prev[clampedLayer] ? prev : { ...prev, [clampedLayer]: targetMix }));
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
    [layerMixers, pushHistory],
  );

  const handleTrimClip = useCallback(
    (trackId: string, patch: { offsetMs: number; trimStartMs: number; durationMs: number }) => {
      pushHistory();
      setTracks((prev) =>
        prev.map((tr) => {
          if (tr.id !== trackId) return tr;
          const key = tr.audioRef.idbKey || tr.id;
          const cachedFull = sourcePeaksCacheRef.current.get(key);
          const sourceDuration = cachedFull?.durationMs ?? tr.sourceDurationMs ?? (tr.trimStartMs ?? 0) + tr.durationMs;
          const basePeaks = cachedFull?.peaks ?? tr.peaks;
          const peaks =
            cachedFull && sourceDuration > 0
              ? slicePeaksForRange(basePeaks, sourceDuration, patch.trimStartMs, patch.durationMs, 160)
              : slicePeaksForRange(
                  tr.peaks,
                  tr.durationMs,
                  Math.max(0, patch.trimStartMs - (tr.trimStartMs ?? 0)),
                  patch.durationMs,
                  160,
                );
          return {
            ...tr,
            offsetMs: Math.max(0, Math.round(patch.offsetMs)),
            trimStartMs: Math.max(0, Math.round(patch.trimStartMs)),
            durationMs: Math.max(160, Math.round(patch.durationMs)),
            sourceDurationMs: sourceDuration,
            peaks: peaks.length > 0 ? peaks : tr.peaks,
          };
        }),
      );
    },
    [pushHistory],
  );

  const buildSplitPair = useCallback((target: StudioTrackV1, atTimelineMs: number): [StudioTrackV1, StudioTrackV1] | null => {
    const cutInClipMs = Math.round(atTimelineMs - target.offsetMs);
    if (cutInClipMs < 140 || cutInClipMs > target.durationMs - 140) return null;

    const origTrimStart = target.trimStartMs ?? 0;
    const sourceDur = target.sourceDurationMs ?? origTrimStart + target.durationMs;
    const leftDur = cutInClipMs;
    const rightDur = target.durationMs - cutInClipMs;
    const rightTrimStart = origTrimStart + cutInClipMs;

    const key = target.audioRef.idbKey || target.id;
    const cachedFull = sourcePeaksCacheRef.current.get(key);
    const leftPeaks = cachedFull
      ? slicePeaksForRange(cachedFull.peaks, cachedFull.durationMs, origTrimStart, leftDur, 140)
      : slicePeaksForRange(target.peaks, target.durationMs, 0, leftDur, 140);
    const rightPeaks = cachedFull
      ? slicePeaksForRange(cachedFull.peaks, cachedFull.durationMs, rightTrimStart, rightDur, 140)
      : slicePeaksForRange(target.peaks, target.durationMs, cutInClipMs, rightDur, 140);

    const baseTitle = target.name.replace(/\s+\(cut(?:\s+\d+)?\)$/i, "");
    const leftClip: StudioTrackV1 = {
      ...target,
      trimStartMs: origTrimStart,
      durationMs: leftDur,
      sourceDurationMs: sourceDur,
      fadeOutMs: 0,
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
      fadeInMs: 0,
      peaks: rightPeaks.length > 0 ? rightPeaks : target.peaks,
      createdAt: new Date().toISOString(),
    };
    return [leftClip, rightClip];
  }, []);

  const splitClipAt = useCallback(
    (trackId: string, atTimelineMs: number) => {
      const target = tracksRef.current.find((t) => t.id === trackId);
      if (!target) return;
      const pair = buildSplitPair(target, atTimelineMs);
      if (!pair) {
        showNotice("Place the cut point strictly inside the audio clip to split it.");
        return;
      }
      pushHistory();
      const [leftClip, rightClip] = pair;
      const nextTracks = tracksRef.current.flatMap((t) => (t.id === trackId ? [leftClip, rightClip] : [t]));
      setTracks(nextTracks);
      setSelectedTrackId(rightClip.id);
      if (activeId) void persistDraft(nextTracks, markersRef.current);
      showNotice(`Split “${target.name}” at ${fmtExactSec(atTimelineMs)}.`);
    },
    [activeId, buildSplitPair, persistDraft, pushHistory, showNotice],
  );

  const splitAllAtPlayhead = useCallback(() => {
    const atMs = audio.playheadMs;
    const candidates = tracksRef.current.filter(
      (t) => atMs > t.offsetMs + 140 && atMs < t.offsetMs + t.durationMs - 140,
    );
    if (candidates.length === 0) {
      showNotice("Move the playhead across one or more clips to split all lanes.");
      return;
    }
    pushHistory();
    let count = 0;
    let lastRightId: string | null = null;
    const nextTracks = tracksRef.current.flatMap((tr) => {
      const pair = buildSplitPair(tr, atMs);
      if (!pair) return [tr];
      count += 1;
      lastRightId = pair[1].id;
      return pair;
    });
    setTracks(nextTracks);
    if (lastRightId) setSelectedTrackId(lastRightId);
    if (activeId) void persistDraft(nextTracks, markersRef.current);
    showNotice(`Split ${count} aligned ${count === 1 ? "clip" : "clips"} at ${fmtExactSec(atMs)}.`);
  }, [activeId, audio.playheadMs, buildSplitPair, persistDraft, pushHistory, showNotice]);

  const splittableTrackAtPlayhead = useMemo(() => {
    const preferred = selectedTrackId ? tracks.find((t) => t.id === selectedTrackId) : undefined;
    const isSplittable = (t: StudioTrackV1) =>
      audio.playheadMs > t.offsetMs + 140 && audio.playheadMs < t.offsetMs + t.durationMs - 140;
    if (preferred && isSplittable(preferred)) return preferred;
    return tracks.find(isSplittable) ?? null;
  }, [audio.playheadMs, selectedTrackId, tracks]);

  const splittableCountAtPlayhead = useMemo(
    () =>
      tracks.filter(
        (t) => audio.playheadMs > t.offsetMs + 140 && audio.playheadMs < t.offsetMs + t.durationMs - 140,
      ).length,
    [audio.playheadMs, tracks],
  );

  const handleDuplicateClip = useCallback(
    (track: StudioTrackV1) => {
      pushHistory();
      const targetLayer = Math.max(0, track.layerIndex ?? 0);
      const copy: StudioTrackV1 = {
        ...track,
        id: makeClientId("trk"),
        name: `${track.name} copy`.slice(0, 60),
        offsetMs: track.offsetMs + track.durationMs + 250,
        layerIndex: targetLayer,
        createdAt: new Date().toISOString(),
      };
      const next = [...tracksRef.current, copy];
      setTracks(next);
      setSelectedTrackId(copy.id);
      if (activeId) void persistDraft(next, markersRef.current);
      showNotice(`Duplicated “${track.name}”.`);
    },
    [activeId, persistDraft, pushHistory, showNotice],
  );

  const handleNormalizeClip = useCallback(
    async (track: StudioTrackV1) => {
      setNormalizing(true);
      try {
        const nextGain = await audio.computeNormalizedGain(track);
        if (nextGain === null) {
          showNotice("Could not measure peak amplitude for that clip.");
          return;
        }
        pushHistory();
        const layerIdx = Math.max(0, track.layerIndex ?? 0);
        setLayerMixers((prev) => ({
          ...prev,
          [layerIdx]: { ...(prev[layerIdx] ?? DEFAULT_LAYER_MIXER), gain: nextGain },
        }));
        setTracks((prev) => prev.map((t) => (t.id === track.id ? { ...t, gain: nextGain } : t)));
        showNotice(`Normalized “${track.name}” to -1.0 dBFS (${Math.round(nextGain * 100)}% gain).`);
      } finally {
        setNormalizing(false);
      }
    },
    [audio, pushHistory, showNotice],
  );

  const handleRemoveTrack = useCallback(
    async (track: StudioTrackV1) => {
      pushHistory();
      const nextTracks = tracksRef.current.filter((t) => t.id !== track.id);
      setTracks(nextTracks);
      if (selectedTrackId === track.id) setSelectedTrackId(nextTracks[0]?.id ?? null);
      if (activeId) void persistDraft(nextTracks, markersRef.current);
      // Note: retain IDB audio blob during current session so Undo restores audio cleanly
    },
    [activeId, persistDraft, pushHistory, selectedTrackId],
  );

  function updateLayerMixer(layerIndex: number, updater: (prev: LayerMixerState) => LayerMixerState) {
    const nextMixer = updater(
      layerMixers[layerIndex] ?? {
        ...DEFAULT_LAYER_MIXER,
        name: `Track ${layerIndex + 1}`,
        colorTag: defaultLayerColor(layerIndex),
      },
    );
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
    setLayerMixers((prev) => ({
      ...prev,
      [nextIdx]: {
        ...DEFAULT_LAYER_MIXER,
        name: `Track ${nextIdx + 1}`,
        colorTag: defaultLayerColor(nextIdx),
      },
    }));
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

  const importFilesList = useCallback(
    async (files: FileList | File[], targetLayer: number, offsetMs: number) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      const imported: StudioTrackV1[] = [];
      for (let i = 0; i < list.length; i++) {
        const file = list[i]!;
        const lane = targetLayer + i;
        const tr = await audio.importAudioFile(file, lane, offsetMs);
        if (tr) {
          const key = tr.audioRef.idbKey || tr.id;
          sourcePeaksCacheRef.current.set(key, {
            peaks: tr.peaks,
            durationMs: tr.sourceDurationMs ?? tr.durationMs,
          });
          imported.push(tr);
        }
      }
      if (imported.length === 0) return;
      pushHistory();
      const nextTracks = [...tracksRef.current, ...imported];
      setTracks(nextTracks);
      const maxImportedLayer = imported.reduce((m, t) => Math.max(m, t.layerIndex ?? 0), targetLayer);
      setLayerCount((prev) => Math.max(prev, maxImportedLayer + 1));
      setLayerMixers((prev) => {
        const next = { ...prev };
        for (const tr of imported) {
          const lIdx = tr.layerIndex ?? 0;
          next[lIdx] = {
            ...(next[lIdx] ?? DEFAULT_LAYER_MIXER),
            name: next[lIdx]?.name ?? tr.name,
            inputHint: "Imported WAV/Audio",
            colorTag: tr.colorTag ?? defaultLayerColor(lIdx),
          };
        }
        return next;
      });
      setSelectedTrackId(imported[0]!.id);
      await persistDraft(nextTracks, markersRef.current);
      showNotice(
        imported.length === 1
          ? `Imported “${imported[0]!.name}” onto Track ${(imported[0]!.layerIndex ?? 0) + 1}.`
          : `Imported ${imported.length} audio stems onto the timeline.`,
      );
    },
    [audio, persistDraft, pushHistory, showNotice],
  );

  async function handleImportInputChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const copied = Array.from(files);
    e.target.value = "";
    await importFilesList(copied, activeLayerIndex, Math.round(audio.playheadMs));
  }

  const dropMarkerAtPlayhead = useCallback(() => {
    const atMs =
      audio.transport === "recording" || audio.transport === "paused"
        ? Math.round(audio.telemetryRef.current?.recordingProgressMs ?? audio.playheadMs)
        : Math.round(audio.playheadMs);
    const label =
      markerKind === "chapter"
        ? `Chapter ${markersRef.current.filter((m) => m.kind === "chapter").length + 1}`
        : markerKind === "note"
          ? `Note @ ${fmtDuration(atMs)}`
          : `Cue ${markersRef.current.length + 1}`;
    const created: StudioMarkerV1 = {
      id: makeClientId("mrk"),
      atMs,
      label,
      kind: markerKind,
      note: null,
    };
    pushHistory();
    const next = [...markersRef.current, created].sort((a, b) => a.atMs - b.atMs);
    setMarkers(next);
    if (activeId || tracksRef.current.length > 0) void persistDraft(tracksRef.current, next);
    showNotice(`Dropped ${markerKind} marker at ${fmtDuration(atMs)}.`);
  }, [activeId, audio.playheadMs, audio.telemetryRef, audio.transport, markerKind, persistDraft, pushHistory, showNotice]);

  async function handleExportMix() {
    setExporting("mix");
    try {
      const res = await audio.exportMixWav();
      if (res) {
        triggerDownload(res.blob, res.filename);
        void saveBlobToVault({
          blob: res.blob,
          name: res.filename,
          mimeType: res.blob.type || "audio/wav",
          folderId: "podcast-audio",
          tags: ["podcast", "studio-mix"],
          source: "studio",
          metadata: {
            durationMs: totalTimelineMs > 0 ? totalTimelineMs : undefined,
            sourceNodeId: STUDIO_NODE_ID,
            sourceRecordingId: activeId,
            excerpt: description.trim() || undefined,
          },
        }).catch(() => {
          // Non-fatal: WAV download already succeeded
        });
        showNotice("Exported mastered WAV & archived a copy in Command Storage.");
      }
    } finally {
      setExporting(null);
    }
  }

  async function handleSaveMixToStorage() {
    setSavingToVault(true);
    try {
      const res = await audio.exportMixWav();
      if (!res) return;
      const saved = await saveBlobToVault({
        blob: res.blob,
        name: res.filename,
        mimeType: res.blob.type || "audio/wav",
        folderId: "podcast-audio",
        tags: ["podcast", "studio-mix"],
        source: "studio",
        metadata: {
          durationMs: totalTimelineMs > 0 ? totalTimelineMs : undefined,
          sourceNodeId: STUDIO_NODE_ID,
          sourceRecordingId: activeId,
          excerpt: description.trim() || undefined,
        },
      });
      showNotice(`Saved “${saved.name}” to Command Storage (Podcast & Audio).`);
    } catch {
      showNotice("Could not save mix to Command Storage.");
    } finally {
      setSavingToVault(false);
    }
  }

  async function handleExportStems() {
    setExporting("stems");
    try {
      const names: Record<number, string> = {};
      for (const [k, v] of Object.entries(layerMixers)) {
        if (v.name) names[Number(k)] = v.name;
      }
      const stems = await audio.exportStemsWav(names);
      if (stems.length > 0) {
        for (const stem of stems) {
          triggerDownload(stem.blob, stem.filename);
        }
        showNotice(`Exported ${stems.length} synced isolated track WAV ${stems.length === 1 ? "stem" : "stems"}.`);
      }
    } finally {
      setExporting(null);
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

  const handleEditInCinema = useCallback(
    async (mode: "mix" | "stems" = "mix") => {
      if (tracksRef.current.length === 0) {
        showNotice("Record or import an audio layer before sending to Cinema.");
        return;
      }
      const saved = await persistDraft(tracksRef.current, markersRef.current);
      if (saved) {
        onSendToCinema?.(saved, mode);
      }
    },
    [onSendToCinema, persistDraft, showNotice],
  );

  // Sync Cinema voiceover context & timeline markers into Recording Studio
  useEffect(() => {
    if (!incomingVoiceover) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || incomingVoiceover.serial === voiceoverSerialRef.current) return;
      voiceoverSerialRef.current = incomingVoiceover.serial;
      const req = incomingVoiceover.request;
      setLinkedCinemaVoiceover(req);
      if (req.markers.length > 0) {
        setMarkers((prev) => {
          const keys = new Set(prev.map((m) => `${m.atMs}:${m.label}`));
          const additions: StudioMarkerV1[] = req.markers
            .filter((m) => !keys.has(`${m.atMs}:${m.label}`))
            .map((m) => ({
              id: makeClientId("cmrk"),
              atMs: m.atMs,
              label: m.label,
              kind: "chapter",
              note: `Synced from Cinema (${req.projectTitle})`,
            }));
          if (additions.length === 0) return prev;
          return [...prev, ...additions].sort((a, b) => a.atMs - b.atMs);
        });
      }
      setStudioPage("record");
      setMonitorOpen(true);
      showNotice(`Voiceover ready for Cinema “${req.projectTitle}” (${req.markers.length} cues synced).`);
    });
    return () => {
      cancelled = true;
    };
  }, [incomingVoiceover, showNotice]);

  // Import extracted audio WAV directly from Cinema into Studio Arrange timeline
  useEffect(() => {
    if (!incomingCinemaAudio) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || incomingCinemaAudio.serial === cinemaAudioSerialRef.current) return;
      cinemaAudioSerialRef.current = incomingCinemaAudio.serial;
      const tr = incomingCinemaAudio.transfer;
      const newTrack: StudioTrackV1 = {
        id: makeClientId("trk"),
        name: `${tr.clipName} (Cinema)`.slice(0, 80),
        role: "voice",
        layerIndex: 0,
        offsetMs: 0,
        trimStartMs: 0,
        durationMs: Math.max(250, tr.durationMs),
        sourceDurationMs: Math.max(250, tr.durationMs),
        inputSource: "Cinema Extract",
        colorTag: "blue",
        hpfEnabled: false,
        compressorEnabled: false,
        gain: 1,
        pan: 0,
        muted: false,
        solo: false,
        peaks: tr.peaks,
        audioRef: {
          storage: "idb",
          idbKey: tr.audioKey,
          url: null,
          mimeType: tr.mimeType,
          byteLength: tr.byteLength,
          sampleRate: tr.sampleRate,
        },
        createdAt: tr.extractedAt,
      };
      setTracks((prev) => {
        const next = [...prev, newTrack];
        void persistDraft(next, markersRef.current);
        return next;
      });
      setActiveCinemaRepair(tr);
      setMonitorOpen(true);
      setSelectedTrackId(newTrack.id);
      setStudioPage("edit");
      showNotice("Imported soundtrack from Cinema — polish with EQ & Compressor, then return sample-locked.");
    });
    return () => {
      cancelled = true;
    };
  }, [incomingCinemaAudio, persistDraft, showNotice]);

  // Import audio file opened from Command Storage Vault onto Studio Arrange timeline
  useEffect(() => {
    if (!incomingVaultItem) return;
    if (incomingVaultItem.serial === vaultItemSerialRef.current) return;
    const item = vault.items.find((entry) => entry.id === incomingVaultItem.itemId);
    if (!item) return;
    vaultItemSerialRef.current = incomingVaultItem.serial;
    let cancelled = false;
    void (async () => {
      const blob = await resolveVaultItemBlob(item);
      if (cancelled) return;
      if (!blob) {
        showNotice(`Could not load “${item.name}” binary from Command Storage.`);
        return;
      }
      const file = new File([blob], item.name, {
        type: item.mimeType || blob.type || "audio/wav",
      });
      await importFilesList([file], Math.max(0, activeLayerIndex), 0);
      if (!cancelled) {
        setStudioPage("edit");
        showNotice(`Imported “${item.name}” from Command Storage.`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeLayerIndex, importFilesList, incomingVaultItem, showNotice, vault.items]);

  const decodeMixedWavBuffer = useCallback(async (): Promise<{
    blob: Blob;
    buffer: AudioBuffer;
    saved: StudioRecording | null;
  } | null> => {
    if (tracksRef.current.length === 0) {
      showNotice("Record or import an audio layer first.");
      return null;
    }
    const saved = await persistDraft(tracksRef.current, markersRef.current);
    const mix = await audio.exportMixWav();
    if (!mix) return null;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    try {
      const buffer = await ctx.decodeAudioData(await mix.blob.arrayBuffer());
      return { blob: mix.blob, buffer, saved };
    } finally {
      void ctx.close();
    }
  }, [audio, persistDraft, showNotice]);

  const handleSendSmartCutsToCinema = useCallback(async () => {
    setAnalyzingBridge("smart-cut");
    try {
      const res = await decodeMixedWavBuffer();
      if (!res) return;
      const detected = detectSpeechAndSilenceRegions(res.buffer);
      emitStudioSmartCuts({
        recordingId: res.saved?.id ?? activeId ?? makeClientId("rec"),
        title: title.trim() || "Untitled session",
        keepRegions: detected.keepRegions,
        removedMs: detected.removedMs,
        silenceCount: detected.silenceRegions.length,
        createdAt: new Date().toISOString(),
      });
    } finally {
      setAnalyzingBridge(null);
    }
  }, [activeId, decodeMixedWavBuffer, title]);

  const handleSendRhythmGridToCinema = useCallback(async () => {
    setAnalyzingBridge("beat-grid");
    try {
      const res = await decodeMixedWavBuffer();
      if (!res) return;
      const rhythm = detectBeatsAndTransients(res.buffer, bpm);
      emitStudioRhythmGrid({
        recordingId: res.saved?.id ?? activeId ?? makeClientId("rec"),
        title: title.trim() || "Untitled session",
        bpm: rhythm.bpm,
        beatMs: rhythm.beatMs,
        transientMs: rhythm.transientMs,
        createdAt: new Date().toISOString(),
      });
    } finally {
      setAnalyzingBridge(null);
    }
  }, [activeId, bpm, decodeMixedWavBuffer, title]);

  const handleReturnRepairedAudioToCinema = useCallback(async () => {
    if (!activeCinemaRepair) return;
    setAnalyzingBridge("repair");
    try {
      const res = await decodeMixedWavBuffer();
      if (!res) return;
      const key = `st-repaired-${makeClientId("wav")}`;
      await saveAudioBlob(key, res.blob);
      const peaks = computePeaksFromBuffer(res.buffer, 180);
      emitStudioAudioRepaired({
        recordingId: res.saved?.id ?? activeId ?? makeClientId("rec"),
        title: activeCinemaRepair.clipName,
        targetProjectId: activeCinemaRepair.projectId,
        targetVideoClipId: activeCinemaRepair.sourceVideoClipId,
        sourceStartMs: activeCinemaRepair.sourceStartMs,
        audioKey: key,
        durationMs: Math.round(res.buffer.duration * 1000),
        sampleRate: res.buffer.sampleRate,
        byteLength: res.blob.size,
        mimeType: "audio/wav",
        peaks,
        repairedAt: new Date().toISOString(),
      });
      setActiveCinemaRepair(null);
    } finally {
      setAnalyzingBridge(null);
    }
  }, [activeCinemaRepair, activeId, decodeMixedWavBuffer]);

  const selectedTrack = useMemo(
    () => (selectedTrackId ? tracks.find((t) => t.id === selectedTrackId) ?? null : null),
    [selectedTrackId, tracks],
  );

  // Sync input channel label edits into corresponding timeline track headers
  const handleUpdateInput = useCallback(
    (id: string, patch: Partial<(typeof audio.inputs)[number]>) => {
      const slotIdx = audio.inputs.findIndex((i) => i.id === id);
      audio.updateInput(id, patch);
      if (patch.label !== undefined && slotIdx >= 0) {
        setLayerMixers((prev) => ({
          ...prev,
          [slotIdx]: {
            ...(prev[slotIdx] ?? DEFAULT_LAYER_MIXER),
            name: patch.label || `Track ${slotIdx + 1}`,
            colorTag: prev[slotIdx]?.colorTag ?? defaultLayerColor(slotIdx),
          },
        }));
      }
    },
    [audio],
  );

  // Pro Keyboard Shortcuts
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

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        if (audio.transport === "playing") audio.pausePlayback();
        else if (audio.transport === "idle") void audio.play();
      } else if ((e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (audio.transport === "recording" || audio.transport === "paused" || audio.transport === "counting-in") {
          audio.stopRecording();
        } else {
          const baseLane = audio.captureMode === "solo" ? activeLayerIndex : 0;
          void audio.startRecording("voice", baseLane);
        }
      } else if ((e.key === "m" || e.key === "M") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        dropMarkerAtPlayhead();
      } else if ((e.key === "x" || e.key === "X") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (e.shiftKey) {
          splitAllAtPlayhead();
        } else if (splittableTrackAtPlayhead) {
          splitClipAt(splittableTrackAtPlayhead.id, audio.playheadMs);
        }
      } else if ((e.key === "l" || e.key === "L") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setLoopEnabled((v) => !v);
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
    dropMarkerAtPlayhead,
    handleRedo,
    handleRemoveTrack,
    handleUndo,
    selectedTrack,
    splitAllAtPlayhead,
    splitClipAt,
    splittableTrackAtPlayhead,
  ]);

  const activeFolderName = collections.find((c) => c.id === activeCollectionId)?.name ?? "Studio sessions";
  const isCaptureLive =
    audio.transport === "recording" || audio.transport === "paused" || audio.transport === "counting-in";

  const inspectorProps = {
    tab: inspectorTab,
    onChangeTab: setInspectorTab,
    selectedTrack,
    playheadMs: audio.playheadMs,
    markers,
    markerKind,
    description,
    bpm,
    countInBars,
    masterGain,
    overdubEnabled: audio.overdubEnabled,
    normalizing,
    onUpdateTrack: updateTrack,
    onSplitClipAtPlayhead: (id: string) => splitClipAt(id, audio.playheadMs),
    onDuplicateClip: handleDuplicateClip,
    onNormalizeClip: (tr: StudioTrackV1) => void handleNormalizeClip(tr),
    onDownloadRawTrack: (tr: StudioTrackV1) => void handleDownloadRawTrack(tr),
    onRemoveTrack: (tr: StudioTrackV1) => void handleRemoveTrack(tr),
    onChangeMarkerKind: setMarkerKind,
    onDropMarker: dropMarkerAtPlayhead,
    onSeek: audio.seek,
    onUpdateMarker: (markerId: string, label: string) =>
      setMarkers((prev) => prev.map((m) => (m.id === markerId ? { ...m, label } : m))),
    onDeleteMarker: (markerId: string) => {
      pushHistory();
      setMarkers((prev) => prev.filter((m) => m.id !== markerId));
    },
    onChangeDescription: setDescription,
    onBlurDescription: () => {
      if (tracks.length > 0 || activeId) void persistDraft(tracks, markers);
    },
    onChangeBpm: setBpm,
    onChangeCountInBars: setCountInBars,
    onChangeMasterGain: setMasterGain,
    onToggleOverdub: () => audio.setOverdubEnabled(!audio.overdubEnabled),
    onOpenPatchbay: () => setPatchbayOpen(true),
  };

  return (
    <section
      aria-label="Nexus Audio Studio"
      data-studio-ready={collections.length > 0 ? "true" : "false"}
      data-studio-page={studioPage}
      className="studio-screen flex h-full w-full flex-col overflow-hidden"
    >
      {/* Floating Refractive Liquid Glass Top Studio Capsule (<GlassSurface /> from Landing Page) */}
      <header
        data-page={studioPage}
        className="shrink-0 pt-1.5 pb-1 pl-[64px] pr-3 sm:pr-4"
      >
        <GlassSurface
          width="100%"
          height="auto"
          borderRadius={23}
          distortionScale={-180}
          displace={0.5}
          backgroundOpacity={0.1}
          className="studio-liquid-glass w-full"
        >
          <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 px-3 py-1.5 md:h-[44px] md:grid-cols-[1fr_auto_1fr] md:gap-y-0 md:py-0">
            {/* Left: Quiet Session Title + Sessions Chevron */}
            <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-1 justify-self-start">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  if (tracks.length > 0 || activeId) void persistDraft(tracks, markers);
                }}
                aria-label="Recording session title"
                className="font-heading h-8 w-full min-w-0 max-w-[168px] border-0 bg-transparent px-1.5 text-[14.5px] font-medium tracking-[-0.015em] text-foreground/90 shadow-none hover:text-foreground focus-visible:ring-1 sm:max-w-[204px]"
              />
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setTakesDrawerOpen(true)}
                      aria-label={`Browse saved sessions (${summaries.length})`}
                      className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                  }
                />
                <TooltipContent side="bottom">Sessions &amp; folders ({summaries.length})</TooltipContent>
              </Tooltip>
            </div>

            {/* Center: Minimal Segmented Pill (Record | Arrange) */}
            <div
              className="studio-tabs col-span-2 row-start-2 justify-self-center md:col-span-1 md:col-start-2 md:row-start-1"
              role="tablist"
              aria-label="Studio workspace view"
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
                <span>Arrange</span>
                {tracks.length > 0 ? <span className="studio-tab-count">{tracks.length}</span> : null}
              </button>
            </div>

            {/* Right: Subtle Gold Links Popover + Consolidated Export Menu + Quiet Exit */}
            <div className="col-start-2 row-start-1 flex items-center justify-end gap-1.5 justify-self-end md:col-start-3">
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 rounded-lg border-[color:var(--nexus-link-border)] bg-[color:var(--nexus-link-soft)] px-2.5 text-[11.5px] font-medium text-foreground hover:border-[color:var(--nexus-link)]"
                >
                  <span className="size-1.5 rounded-full bg-[color:var(--nexus-link)]" />
                  <Link2 className="size-3.5 text-[color:var(--nexus-link)]" />
                  <span className="hidden sm:inline">Links</span>
                </Button>
              }
            />
            <PopoverContent align="end" className="w-64 space-y-1 rounded-xl p-2">
              <div className="flex items-center justify-between px-2 py-1 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">Nexus Node Links</span>
                <span className="size-1.5 rounded-full bg-[color:var(--nexus-link)]" />
              </div>

              <button
                type="button"
                onClick={() => setMonitorOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[12px] text-foreground hover:bg-foreground/[0.06]"
              >
                <span className="flex items-center gap-2">
                  <MonitorPlay className="size-3.5 text-[color:var(--nexus-link)]" />
                  <span>Cinema Live Video Monitor</span>
                </span>
                <span className="font-mono text-[10px] text-[color:var(--nexus-link)]">
                  {monitorOpen ? "On" : "Off"}
                </span>
              </button>

              {activeCinemaRepair ? (
                <button
                  type="button"
                  disabled={analyzingBridge !== null}
                  onClick={() => void handleReturnRepairedAudioToCinema()}
                  className="flex w-full items-center gap-2 rounded-lg bg-[color:var(--nexus-link-soft)] px-2 py-1.5 text-left text-[12px] font-medium text-[color:var(--nexus-link)] hover:opacity-90 disabled:opacity-45"
                >
                  <Waves className="size-3.5" />
                  <span>Return Repaired Audio → Cinema</span>
                </button>
              ) : null}

              <button
                type="button"
                disabled={tracks.length === 0 || analyzingBridge !== null}
                onClick={() => void handleSendSmartCutsToCinema()}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-foreground hover:bg-foreground/[0.06] disabled:opacity-45"
              >
                <Scissors className="size-3.5 text-[color:var(--nexus-link)]" />
                <span>
                  {analyzingBridge === "smart-cut" ? "Detecting speech…" : "Send Smart Jump-Cuts → Cinema"}
                </span>
              </button>

              <button
                type="button"
                disabled={tracks.length === 0 || analyzingBridge !== null}
                onClick={() => void handleSendRhythmGridToCinema()}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-foreground hover:bg-foreground/[0.06] disabled:opacity-45"
              >
                <Waves className="size-3.5 text-[color:var(--nexus-link)]" />
                <span>
                  {analyzingBridge === "beat-grid" ? "Detecting beats…" : "Send Beat Grid → Cinema"}
                </span>
              </button>

              <button
                type="button"
                disabled={tracks.length === 0}
                onClick={() => void handleEditInCinema("stems")}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-foreground hover:bg-foreground/[0.06] disabled:opacity-45"
              >
                <Layers className="size-3.5 text-[color:var(--nexus-link)]" />
                <span>Send Isolated Stems → Cinema</span>
              </button>

              <Separator className="my-1" />

              <button
                type="button"
                onClick={() => void openRouting()}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11.5px] text-[color:var(--nexus-link)] hover:bg-[color:var(--nexus-link-soft)]"
              >
                <span>Route to Other Nexus Nodes…</span>
                <Zap className="size-3" />
              </button>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger
              render={
                tracks.length > 0 || studioPage === "edit" ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={exporting !== null}
                    className="h-8 gap-1.5 rounded-full bg-foreground px-3.5 text-[12px] font-medium text-background hover:opacity-90"
                  >
                    {exporting || saving ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    <span>Export</span>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Studio actions"
                    className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                )
              }
            />
            <PopoverContent align="end" className="w-64 rounded-2xl p-2">
              <div className="space-y-1">
                <button
                  type="button"
                  disabled={tracks.length === 0 || exporting !== null || savingToVault}
                  onClick={() => void handleSaveMixToStorage()}
                  className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-foreground/[0.06] disabled:opacity-45"
                >
                  {savingToVault ? (
                    <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-[#d89b2c]" />
                  ) : (
                    <HardDrive className="mt-0.5 size-4 shrink-0 text-[#d89b2c]" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium text-foreground">
                      {savingToVault ? "Saving to Storage…" : "Save Mix to Storage"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">Store WAV in Command Vault for Cinema</div>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={tracks.length === 0 || exporting !== null}
                  onClick={() => void handleExportMix()}
                  className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-foreground/[0.06] disabled:opacity-45"
                >
                  <Download className="mt-0.5 size-4 shrink-0 text-foreground" />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium text-foreground">Master Mix (.WAV)</div>
                    <div className="text-[11px] text-muted-foreground">Peak-limited stereo master</div>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={tracks.length === 0 || exporting !== null}
                  onClick={() => void handleExportStems()}
                  className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-foreground/[0.06] disabled:opacity-45"
                >
                  <Layers className="mt-0.5 size-4 shrink-0 text-[color:var(--studio-accent)]" />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium text-foreground">Isolated Track Stems (.WAV)</div>
                    <div className="text-[11px] text-muted-foreground">Synced per-mic stems from 00:00</div>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={saving || tracks.length === 0}
                  onClick={() => void persistDraft(tracks, markers)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12.5px] font-medium text-foreground transition-colors hover:bg-foreground/[0.06] disabled:opacity-45"
                >
                  <Save className="size-4 shrink-0 text-muted-foreground" />
                  <span>{saving ? "Saving session…" : "Save session"}</span>
                </button>

                <button
                  type="button"
                  disabled={tracks.length === 0}
                  onClick={() => void handleEditInCinema("mix")}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12.5px] font-medium text-[color:var(--nexus-link)] transition-colors hover:bg-[color:var(--nexus-link-soft)] disabled:opacity-45"
                >
                  <Film className="size-4 shrink-0" />
                  <span>Edit in Cinema</span>
                </button>

                {onOpenCommandStorage ? (
                  <button
                    type="button"
                    onClick={() => onOpenCommandStorage()}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12.5px] font-medium text-foreground transition-colors hover:bg-foreground/[0.06]"
                  >
                    <FolderOpen className="size-4 shrink-0 text-[#d89b2c]" />
                    <span>Open Storage Vault</span>
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => void openRouting()}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12.5px] font-medium text-foreground transition-colors hover:bg-foreground/[0.06]"
                >
                  <Zap className="size-4 shrink-0 text-[color:var(--nexus-link)]" />
                  <span>Route to Nexus Node</span>
                </button>

                <Separator className="my-1" />

                <button
                  type="button"
                  onClick={() => setPatchbayOpen(true)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12.5px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                >
                  <SlidersHorizontal className="size-4 shrink-0" />
                  <span>Audio I/O Patchbay</span>
                </button>

                <button
                  type="button"
                  onClick={onReleaseNode}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12.5px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4 shrink-0" />
                  <span>Disconnect Studio node</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="h-8 rounded-full px-3 text-[12px] text-muted-foreground hover:text-foreground"
          >
            Done
          </Button>
            </div>
          </div>
        </GlassSurface>
      </header>

      {/* Subtle Gold Cross-Node Sync Bar (shown when actively scoring or repairing for Cinema) */}
      {linkedCinemaVoiceover || activeCinemaRepair ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--nexus-link-border)] bg-[color:var(--nexus-link-soft)] px-4 py-1.5 text-[12px]">
          <div className="flex min-w-0 items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full bg-[color:var(--nexus-link)]" />
            <Film className="size-3.5 shrink-0 text-[color:var(--nexus-link)]" />
            <span className="truncate font-medium text-foreground">
              {activeCinemaRepair
                ? `Repairing Cinema Clip · ${activeCinemaRepair.clipName}`
                : `Synced w/ Cinema · ${linkedCinemaVoiceover?.projectTitle}`}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setMonitorOpen((v) => !v)}
              className="h-7 gap-1 rounded-lg px-2.5 text-[11px]"
            >
              <MonitorPlay className="size-3 text-[color:var(--nexus-link)]" />
              <span>{monitorOpen ? "Hide Video" : "Monitor Video"}</span>
            </Button>
            {activeCinemaRepair ? (
              <Button
                type="button"
                size="sm"
                disabled={tracks.length === 0 || analyzingBridge !== null}
                onClick={() => void handleReturnRepairedAudioToCinema()}
                className="h-7 rounded-lg bg-foreground px-3 text-[11px] font-medium text-background hover:opacity-90"
              >
                Return Repaired Audio → Cinema
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={tracks.length === 0}
                onClick={() => void handleEditInCinema("mix")}
                className="h-7 rounded-lg bg-foreground px-3 text-[11px] font-medium text-background hover:opacity-90"
              >
                Send Take → Cinema
              </Button>
            )}
            <button
              type="button"
              onClick={() => {
                setLinkedCinemaVoiceover(null);
                setActiveCinemaRepair(null);
              }}
              aria-label="Dismiss Cinema sync banner"
              className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="studio-pages-viewport">
        <div className="studio-pages-track" data-page={studioPage}>
          {/* Page 1: Minimal Sculptural Recorder with Scalable Multi-Mic Console */}
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
              captureMode={audio.captureMode}
              useBroadcastChannelMap={audio.useBroadcastChannelMap}
              devices={audio.devices}
              selectedDeviceId={audio.selectedDeviceId}
              inputs={audio.inputs}
              micReady={audio.micReady}
              micError={audio.micError}
              statusNotice={statusBanner}
              detectedChannels={audio.detectedChannels}
              sampleRate={audio.sampleRate}
              countInBeat={audio.countInBeat}
              countInBars={countInBars}
              bpm={bpm}
              metronomeEnabled={metronomeEnabled}
              overdubEnabled={audio.overdubEnabled}
              monitorInput={audio.monitorInput}
              recordSafetyMix={audio.recordSafetyMix}
              theme="dark"
              sampleTelemetry={audio.sampleTelemetry}
              onAddInput={audio.addInput}
              onRemoveInput={audio.removeInput}
              onUpdateInput={handleUpdateInput}
              onArmInputs={() => void audio.armInputs()}
              onClearClipIndicators={audio.clearClipIndicators}
              onOpenPatchbay={() => setPatchbayOpen(true)}
              onStartRecord={() => {
                const baseLane = audio.captureMode === "solo" ? activeLayerIndex : 0;
                void audio.startRecording("voice", baseLane);
              }}
              onPauseRecord={audio.pauseRecording}
              onResumeRecord={audio.resumeRecording}
              onStopRecord={audio.stopRecording}
              onDiscardRecord={audio.discardRecording}
              onChangeBpm={setBpm}
              onToggleMetronome={() => setMetronomeEnabled((v) => !v)}
              onCycleCountIn={() => setCountInBars((v) => (v === 0 ? 1 : v === 1 ? 2 : 0))}
              onToggleOverdub={() => audio.setOverdubEnabled(!audio.overdubEnabled)}
              onToggleMonitor={(next) => audio.setMonitorInput(next)}
              onDropMarker={dropMarkerAtPlayhead}
            />
          </div>

          {/* Page 2: Crisp Multi-Track Arrange & Mix Workspace */}
          <div
            id="studio-panel-edit"
            role="tabpanel"
            aria-labelledby="studio-tab-edit"
            aria-hidden={studioPage !== "edit"}
            inert={studioPage !== "edit"}
            data-active={studioPage === "edit" ? "true" : "false"}
            className="studio-page-pane"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden px-4 py-3 sm:px-5">
              {audio.micError ? (
                <div
                  role="alert"
                  className="shrink-0 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-[12.5px] text-destructive"
                >
                  {audio.micError}
                </div>
              ) : statusBanner ? (
                <div
                  role="status"
                  className="shrink-0 rounded-xl border border-border/80 bg-card/80 px-3.5 py-1.5 text-[12px] text-foreground"
                >
                  {statusBanner}
                </div>
              ) : null}

              {/* Single Cohesive Refractive Liquid Glass Arrange Transport & Editing Strip */}
              <GlassSurface
                width="100%"
                height="auto"
                borderRadius={20}
                distortionScale={-180}
                displace={0.5}
                backgroundOpacity={0.1}
                className="studio-liquid-glass w-full shrink-0"
              >
                <div className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2">
                  {/* Left: Liquid Glass Transport Orbs (Rewind, Play/Pause Hero, Punch-In, Loop, Metronome) + Timecode */}
                  <div className="flex items-center gap-1.5">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            onClick={() => audio.seek(0)}
                            aria-label="Rewind to start"
                            className="rounded-full"
                          >
                            <GlassSurface
                              width={34}
                              height={34}
                              borderRadius={17}
                              distortionScale={-180}
                              displace={0.5}
                              backgroundOpacity={0.1}
                              className="glass-control"
                            >
                              <span className="flex h-full w-full items-center justify-center text-foreground/85 hover:text-foreground">
                                <SkipBack className="size-3.5" />
                              </span>
                            </GlassSurface>
                          </button>
                        }
                      />
                      <TooltipContent side="bottom">Rewind to 00:00</TooltipContent>
                    </Tooltip>

                    <button
                      type="button"
                      onClick={() => {
                        if (audio.transport === "playing") audio.pausePlayback();
                        else void audio.play();
                      }}
                      disabled={isCaptureLive}
                      aria-label={audio.transport === "playing" ? "Pause playback (Space)" : "Play timeline (Space)"}
                      className="rounded-full disabled:opacity-45"
                    >
                      <GlassSurface
                        width={40}
                        height={40}
                        borderRadius={20}
                        distortionScale={-180}
                        displace={0.5}
                        backgroundOpacity={0.16}
                        className={`glass-control ${
                          audio.transport === "playing" ? "glass-control--active" : ""
                        }`}
                      >
                        <span
                          className={`flex h-full w-full items-center justify-center ${
                            audio.transport === "playing"
                              ? "text-[color:var(--studio-accent)]"
                              : "text-foreground"
                          }`}
                        >
                          {audio.transport === "playing" ? (
                            <Pause className="size-4 fill-current" />
                          ) : (
                            <Play className="size-4 translate-x-[0.5px] fill-current" />
                          )}
                        </span>
                      </GlassSurface>
                    </button>

                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            onClick={() => {
                              if (isCaptureLive) audio.stopRecording();
                              else {
                                const baseLane = audio.captureMode === "solo" ? activeLayerIndex : 0;
                                void audio.startRecording("overdub", baseLane);
                              }
                            }}
                            aria-label={isCaptureLive ? "Stop punch-in recording" : "Punch-in record at playhead"}
                            className="rounded-full"
                          >
                            <GlassSurface
                              width={34}
                              height={34}
                              borderRadius={17}
                              distortionScale={-180}
                              displace={0.5}
                              backgroundOpacity={0.1}
                              className={`glass-control ${isCaptureLive ? "glass-control--active" : ""}`}
                            >
                              <span className="flex h-full w-full items-center justify-center text-[#fc3a34]">
                                {isCaptureLive ? (
                                  <Square className="size-3 fill-current" />
                                ) : (
                                  <span className="h-2.5 w-2.5 rounded-full bg-[#fc3a34]" aria-hidden />
                                )}
                              </span>
                            </GlassSurface>
                          </button>
                        }
                      />
                      <TooltipContent side="bottom">
                        {isCaptureLive ? "Stop capture & commit stems" : "Punch-in record at playhead (R)"}
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            onClick={() => setLoopEnabled((v) => !v)}
                            aria-pressed={loopEnabled}
                            aria-label="Toggle loop playback (L)"
                            className="rounded-full"
                          >
                            <GlassSurface
                              width={34}
                              height={34}
                              borderRadius={17}
                              distortionScale={-180}
                              displace={0.5}
                              backgroundOpacity={loopEnabled ? 0.18 : 0.08}
                              className={`glass-control ${loopEnabled ? "glass-control--active" : ""}`}
                            >
                              <span
                                className={`flex h-full w-full items-center justify-center ${
                                  loopEnabled ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                <Repeat className="size-3.5" />
                              </span>
                            </GlassSurface>
                          </button>
                        }
                      />
                      <TooltipContent side="bottom">Loop playback (L)</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            onClick={() => setMetronomeEnabled((v) => !v)}
                            aria-pressed={metronomeEnabled}
                            aria-label="Toggle metronome click"
                            className="rounded-full"
                          >
                            <GlassSurface
                              width={34}
                              height={34}
                              borderRadius={17}
                              distortionScale={-180}
                              displace={0.5}
                              backgroundOpacity={metronomeEnabled ? 0.18 : 0.08}
                              className={`glass-control ${metronomeEnabled ? "glass-control--active" : ""}`}
                            >
                              <span
                                className={`flex h-full w-full items-center justify-center ${
                                  metronomeEnabled
                                    ? "text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                <Metronome className="size-3.5" />
                              </span>
                            </GlassSurface>
                          </button>
                        }
                      />
                      <TooltipContent side="bottom">Click metronome ({bpm} BPM)</TooltipContent>
                    </Tooltip>

                    <div className="ml-1 flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[12px] tabular-nums">
                      <span className="font-medium text-foreground">{fmtTimecode(audio.playheadMs)}</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-muted-foreground">{fmtTimecode(totalTimelineMs)}</span>
                    </div>
                  </div>

                {/* Center: Edit Tools (Split / Split All / Snap / Undo / Redo) */}
                <div className="flex flex-wrap items-center gap-1.5">
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
                          className="h-8 gap-1 rounded-full px-2.5 text-[11.5px]"
                        >
                          <Scissors className="size-3.5" />
                          <span>Split</span>
                        </Button>
                      }
                    />
                    <TooltipContent side="bottom">
                      Split selected clip at playhead (X) · Right-click any clip to razor cut
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={splittableCountAtPlayhead === 0}
                          onClick={splitAllAtPlayhead}
                          className="h-8 gap-1 rounded-full px-2.5 text-[11.5px]"
                        >
                          <SplitSquareHorizontal className="size-3.5" />
                          <span className="hidden sm:inline">Split All</span>
                        </Button>
                      }
                    />
                    <TooltipContent side="bottom">
                      Cut all aligned mic tracks at playhead simultaneously (Shift+X)
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          size="icon-sm"
                          variant={snapEnabled ? "secondary" : "ghost"}
                          onClick={() => setSnapEnabled((v) => !v)}
                          aria-pressed={snapEnabled}
                          aria-label="Toggle magnetic snap"
                          className="h-8 w-8 rounded-full"
                        >
                          <Magnet className="size-3.5" />
                        </Button>
                      }
                    />
                    <TooltipContent side="bottom">
                      Magnetic snap to grid, markers &amp; clip edges (hold Shift to bypass)
                    </TooltipContent>
                  </Tooltip>

                  <div className="mx-0.5 h-4 w-px bg-border/75" aria-hidden />

                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={undoStack.length === 0}
                          onClick={handleUndo}
                          aria-label="Undo (Ctrl+Z)"
                          className="h-8 w-8 rounded-full"
                        >
                          <Undo2 className="size-3.5" />
                        </Button>
                      }
                    />
                    <TooltipContent side="bottom">Undo (Ctrl+Z)</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={redoStack.length === 0}
                          onClick={handleRedo}
                          aria-label="Redo (Ctrl+Shift+Z)"
                          className="h-8 w-8 rounded-full"
                        >
                          <Redo2 className="size-3.5" />
                        </Button>
                      }
                    />
                    <TooltipContent side="bottom">Redo (Ctrl+Shift+Z)</TooltipContent>
                  </Tooltip>

                  <span className="hidden pl-1 font-mono text-[10px] text-muted-foreground 2xl:inline">
                    Right-click clip to razor cut
                  </span>
                </div>

                {/* Right: Import, Zoom, I/O Patchbay, Inspector Toggle */}
                <div className="flex items-center gap-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".wav,.mp3,.m4a,.ogg,.flac,.aac,.webm,.mp4,audio/*"
                    multiple
                    onChange={(e) => void handleImportInputChange(e)}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 gap-1.5 rounded-full px-3 text-[11.5px]"
                  >
                    <Upload className="size-3.5" />
                    <span className="hidden sm:inline">Import</span>
                  </Button>

                  <div className="inline-flex h-8 items-center rounded-full border border-border/80 bg-foreground/[0.03] px-1">
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
                    <span className="px-1 font-mono text-[11px] text-muted-foreground tabular-nums">
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

                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="outline"
                          onClick={() => setPatchbayOpen(true)}
                          aria-label="Open audio hardware I/O patchbay"
                          className="h-8 w-8 rounded-full"
                        >
                          <SlidersHorizontal className="size-3.5" />
                        </Button>
                      }
                    />
                    <TooltipContent side="bottom">Audio I/O Patchbay</TooltipContent>
                  </Tooltip>

                  <Button
                    type="button"
                    size="sm"
                    variant={inspectorOpen ? "secondary" : "outline"}
                    onClick={() => {
                      if (window.innerWidth < 1280) setMobileInspectorOpen((v) => !v);
                      else setInspectorOpen((v) => !v);
                    }}
                    aria-pressed={inspectorOpen}
                    className="h-8 gap-1.5 rounded-full px-3 text-[11.5px]"
                  >
                    <PanelRight className="size-3.5" />
                    <span className="hidden md:inline">Inspector</span>
                  </Button>
                </div>
                </div>
              </GlassSurface>

              {/* Main Split Stage: Multi-Track DAW Canvas + Docked Apple HIG Inspector */}
              <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
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
                  snapEnabled={snapEnabled}
                  loopEnabled={loopEnabled}
                  selectedTrackId={selectedTrackId}
                  theme="dark"
                  onSelectTrack={(id) => {
                    setSelectedTrackId(id);
                    if (id) setInspectorTab("clip");
                  }}
                  onSelectLayer={(idx) => setActiveLayerIndex(idx)}
                  onAddLayer={handleAddLayer}
                  onRemoveLayer={handleRemoveLayer}
                  onRenameLayer={(idx, nextName) =>
                    setLayerMixers((prev) => ({
                      ...prev,
                      [idx]: { ...(prev[idx] ?? DEFAULT_LAYER_MIXER), name: nextName },
                    }))
                  }
                  onMoveClip={handleMoveClip}
                  onTrimClip={handleTrimClip}
                  onSplitClipAt={splitClipAt}
                  onSeek={audio.seek}
                  onSelectMarker={(m) => {
                    setInspectorTab("markers");
                    showNotice(`${m.label} (${fmtDuration(m.atMs)})`);
                  }}
                  onToggleLayerMute={(idx) =>
                    updateLayerMixer(idx, (prev) => ({ ...prev, muted: !prev.muted }))
                  }
                  onToggleLayerSolo={(idx) =>
                    updateLayerMixer(idx, (prev) => ({ ...prev, solo: !prev.solo }))
                  }
                  onChangeLayerGain={(idx, gain) =>
                    updateLayerMixer(idx, (prev) => ({ ...prev, gain }))
                  }
                  onDropFiles={(files, layerIdx, offsetMs) => {
                    void importFilesList(files, layerIdx, offsetMs);
                  }}
                />

                {inspectorOpen ? (
                  <aside
                    aria-label="Clip and session inspector"
                    className="studio-inspector-pane hidden w-[304px] shrink-0 overflow-hidden rounded-[18px] border border-border/80 xl:flex xl:flex-col"
                  >
                    <StudioInspectorContent
                      {...inspectorProps}
                      onClose={() => setInspectorOpen(false)}
                    />
                  </aside>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Left Sessions & Folders Sheet Drawer */}
      <Sheet open={takesDrawerOpen} onOpenChange={setTakesDrawerOpen}>
        <SheetContent
          side="left"
          className="dark w-[300px] border-white/10 bg-[#08080b] p-0 text-[#f4f4f6] sm:max-w-[340px]"
        >
          <SheetHeader className="border-b border-white/10 px-4 py-3">
            <SheetTitle className="font-heading text-[15px] font-medium text-[#f4f4f6]">
              Sessions · {activeFolderName}
            </SheetTitle>
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
              <span className="text-[12px] font-medium text-muted-foreground">
                Saved sessions ({summaries.length})
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
                <span>New</span>
              </Button>
            </div>

            <ScrollArea className="min-h-0 flex-1 px-2 pb-3">
              <div className="space-y-1.5">
                {summaries.length === 0 ? (
                  <p className="px-2 py-4 text-[12px] text-muted-foreground">
                    No saved sessions yet. Record a take to keep it here.
                  </p>
                ) : (
                  summaries.map((item) => {
                    const selected = item.id === activeId;
                    return (
                      <div
                        key={item.id}
                        className={`group flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 transition-colors ${
                          selected
                            ? "border-[color:var(--studio-accent)]/55 bg-[color:var(--studio-accent)]/12"
                            : "border-white/[0.06] bg-[#0d0d12] hover:border-white/15 hover:bg-[#13131a]"
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

      {/* Mobile / Tablet Sheet Inspector Fallback (< xl) */}
      <Sheet open={mobileInspectorOpen} onOpenChange={setMobileInspectorOpen}>
        <SheetContent
          side="right"
          className="dark flex w-[320px] flex-col border-white/10 bg-[#08080b] p-0 text-[#f4f4f6] sm:max-w-[360px]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Studio Inspector</SheetTitle>
          </SheetHeader>
          <StudioInspectorContent {...inspectorProps} />
        </SheetContent>
      </Sheet>

      {/* Right-Hand Audio I/O & Multi-Mic Channel Patchbay */}
      <StudioIoPatchbay
        open={patchbayOpen}
        onOpenChange={setPatchbayOpen}
        captureMode={audio.captureMode}
        devices={audio.devices}
        audioInterfaces={audio.audioInterfaces}
        useBroadcastChannelMap={audio.useBroadcastChannelMap}
        selectedDeviceId={audio.selectedDeviceId}
        inputs={audio.inputs}
        micReady={audio.micReady}
        isRecordingLocked={isCaptureLive}
        detectedChannels={audio.detectedChannels}
        sampleRate={audio.sampleRate}
        studioRawMic={audio.studioRawMic}
        monitorInput={audio.monitorInput}
        recordSafetyMix={audio.recordSafetyMix}
        sampleTelemetry={audio.sampleTelemetry}
        onChangeMode={(mode) => audio.setCaptureMode(mode)}
        onSelectDevice={(id) => audio.setSelectedDeviceId(id)}
        onAddInput={audio.addInput}
        onRemoveInput={audio.removeInput}
        onUpdateInput={handleUpdateInput}
        onToggleRawMic={(next) => audio.setStudioRawMic(next)}
        onToggleMonitor={(next) => audio.setMonitorInput(next)}
        onToggleSafetyMix={(next) => audio.setRecordSafetyMix(next)}
        onArmInputs={() => void audio.armInputs()}
        onAutoConfigureMultiMic={(preferred) => void audio.autoConfigureMultiMic(preferred)}
        onRefreshDevices={() => void audio.refreshDevices()}
      />

      {/* Nexus Node Bus Routing Sheet */}
      <StudioRoutingSheet
        open={routingOpen}
        onOpenChange={setRoutingOpen}
        recording={savedProjectSnapshot}
        hub={hub}
        theme="dark"
        onRouteTransfer={(targetId) => onRouteTransfer?.(STUDIO_NODE_ID, targetId)}
        onRouteToCinema={onSendToCinema}
      />

      {/* Live Frame-Locked Cinema PiP Monitor */}
      <StudioCinemaMonitor
        open={monitorOpen}
        playheadMs={audio.playheadMs}
        transport={audio.transport}
        onOpenCinema={onOpenCinema}
        onClose={() => setMonitorOpen(false)}
      />
    </section>
  );
}
