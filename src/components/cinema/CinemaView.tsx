"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  Link2,
  Loader2,
  Mic,
  MonitorPlay,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  Save,
  Scissors,
  Trash2,
  Type,
  Undo2,
  Video,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CINEMA_NODE_ID } from "@/extensions/cinema/node";
import { CinemaAudioEngine } from "@/lib/cinema/audio-engine";
import {
  createCinemaCollection,
  deleteCinemaProject,
  emitCinemaAudioExtracted,
  emitCinemaVoiceoverRequested,
  fetchCinemaStatus,
  getCinemaProject,
  importStudioRecordingIntoCinema,
  listCinemaCollections,
  listCinemaProjects,
  saveCinemaProject,
} from "@/lib/cinema/cinema-client";
import { computeProjectDurationMs } from "@/lib/cinema/compositor";
import { exportCurrentFramePng } from "@/lib/cinema/exporter";
import {
  extractAudioFromVideoBlob,
  ingestMediaFile,
  loadCinemaBlob,
  saveCinemaBlob,
} from "@/lib/cinema/media-db";
import {
  ASPECT_RATIO_PRESETS,
  DEFAULT_FILTER,
  DEFAULT_TRANSFORM,
  ELEMENT_PRESETS,
  TEXT_PRESETS,
  buildTemplateProject,
  type TextStylePreset,
} from "@/lib/cinema/presets";
import type {
  CinemaAspectRatio,
  CinemaAsset,
  CinemaAudioClip,
  CinemaBackground,
  CinemaClip,
  CinemaCollection,
  CinemaMarker,
  CinemaProject,
  CinemaProjectSummary,
  CinemaRhythmGrid,
  CinemaTrack,
  CinemaTrackKind,
  CinemaTransform,
  CinemaTransitionType,
  StockMediaItem,
  StudioAudioRepairedTransfer,
  StudioRhythmGridTransfer,
  StudioSmartCutsTransfer,
} from "@/lib/cinema/types";
import {
  detectBeatsAndTransients,
  detectSpeechAndSilenceRegions,
  setActiveCinemaProjectSnapshot,
  type BridgeCutRegion,
} from "@/lib/creative/nexus-bridge";
import { nexusBus, type ExtensionHubSnapshot, type ExtensionId } from "@/lib/extensions";
import { loadAudioBlob, saveAudioBlob } from "@/lib/studio/audio-db";
import { getStudioRecording, fetchStudioStatus } from "@/lib/studio/studio-client";
import type { StudioRecording, StudioRecordingContentV1 } from "@/lib/studio/types";
import { computePeaksFromBuffer, encodeWavFromBuffer, mixTracksOffline } from "@/lib/studio/wav";
import { useTheme } from "@/lib/theme";
import { CinemaCaptureModal } from "./CinemaCaptureModal";
import { CinemaExportDialog } from "./CinemaExportDialog";
import { CinemaInspectorContent, type CinemaInspectorTab } from "./CinemaInspector";
import { CinemaSidebar, type CinemaSidebarTab } from "./CinemaSidebar";
import { CinemaStage } from "./CinemaStage";
import { CinemaTimeline } from "./CinemaTimeline";

const MAX_HISTORY = 40;

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID().slice(0, 10)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function studioEnvelopeToRecording(env: StudioRecordingContentV1): StudioRecording {
  return {
    id: env.id,
    collectionId: env.collectionId ?? "",
    title: env.title,
    description: env.data.description,
    bpm: env.data.bpm,
    countInBars: env.data.countInBars,
    durationMs: env.data.durationMs,
    masterGain: env.data.masterGain,
    trackCount: env.data.tracks.length,
    markerCount: env.data.markers.length,
    peaks: env.data.tracks[0]?.peaks ?? [],
    tags: env.data.tags,
    hasTranscript: Boolean(env.data.transcript),
    hasSummary: Boolean(env.data.summary),
    createdAt: env.createdAt,
    updatedAt: env.updatedAt,
    tracks: env.data.tracks,
    markers: env.data.markers,
    transcript: env.data.transcript,
    summary: env.data.summary,
    chapters: env.data.chapters,
  };
}

export function CinemaView({
  visible,
  incomingStudioTake,
  incomingSmartCuts,
  incomingRhythmGrid,
  incomingRepairedAudio,
  onClose,
  onReleaseNode,
  onOpenStudio,
  onRouteTransfer,
}: {
  hub: ExtensionHubSnapshot;
  visible: boolean;
  incomingStudioTake?: {
    envelope: StudioRecordingContentV1;
    mode?: "mix" | "stems";
    serial: number;
  } | null;
  incomingSmartCuts?: {
    transfer: StudioSmartCutsTransfer;
    serial: number;
  } | null;
  incomingRhythmGrid?: {
    transfer: StudioRhythmGridTransfer;
    serial: number;
  } | null;
  incomingRepairedAudio?: {
    transfer: StudioAudioRepairedTransfer;
    serial: number;
  } | null;
  onClose: () => void;
  onReleaseNode: () => void;
  onOpenStudio: () => void;
  onRouteTransfer?: (fromId: ExtensionId, toId?: ExtensionId) => void;
}) {
  const { theme } = useTheme();
  const [databaseConfigured, setDatabaseConfigured] = useState(false);
  const [pexelsConfigured, setPexelsConfigured] = useState(false);
  const [collections, setCollections] = useState<CinemaCollection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState("");
  const [summaries, setSummaries] = useState<CinemaProjectSummary[]>([]);

  const [project, setProject] = useState<CinemaProject>(() =>
    buildTemplateProject("editorial-sequence", "local-cinema-projects"),
  );
  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
    setActiveCinemaProjectSnapshot(project);
  }, [project]);
  useEffect(() => () => setActiveCinemaProjectSnapshot(null), []);

  const [playheadMs, setPlayheadMs] = useState(0);
  const playheadRef = useRef(0);
  useEffect(() => {
    playheadRef.current = playheadMs;
  }, [playheadMs]);

  const [playing, setPlaying] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [showSafeGuides, setShowSafeGuides] = useState(false);
  const [canvasZoom, setCanvasZoom] = useState<"fit" | 0.5 | 0.75 | 1>("fit");
  const [stageExpanded, setStageExpanded] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [timelineHeight, setTimelineHeight] = useState(248);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [beatSnapEnabled, setBeatSnapEnabled] = useState(true);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  // Panels & Modals
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<CinemaSidebarTab>("media");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<CinemaInspectorTab>("style");
  const [projectsDrawerOpen, setProjectsDrawerOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<CinemaProject[]>([]);
  const [redoStack, setRedoStack] = useState<CinemaProject[]>([]);
  const [mediaVersion, setMediaVersion] = useState(0);

  const renderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRedrawRef = useRef<(() => void) | null>(null);
  const audioEngineRef = useRef<CinemaAudioEngine | null>(null);
  const mediaElementsRef = useRef<Map<string, HTMLVideoElement | HTMLImageElement>>(new Map());
  const pendingVideoSeekRef = useRef<Map<string, number>>(new Map());
  const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const hydratingRef = useRef<Set<string>>(new Set());
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const noticeTimerRef = useRef<number | undefined>(undefined);
  const autosaveTimerRef = useRef<number | undefined>(undefined);
  const handledSerialRef = useRef<number>(0);
  const handledSmartCutsSerialRef = useRef<number>(0);
  const handledRhythmSerialRef = useRef<number>(0);
  const handledRepairedSerialRef = useRef<number>(0);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 4600);
  }, []);

  useEffect(() => {
    const engine = new CinemaAudioEngine();
    audioEngineRef.current = engine;
    const urls = blobUrlsRef.current;
    return () => {
      window.clearTimeout(noticeTimerRef.current);
      window.clearTimeout(autosaveTimerRef.current);
      engine.dispose();
      if (audioEngineRef.current === engine) {
        audioEngineRef.current = null;
      }
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, []);

  const persistProject = useCallback(
    async (target: CinemaProject): Promise<CinemaProject | null> => {
      const colId = target.collectionId || activeCollectionId;
      if (!colId) return null;
      setSaving(true);
      try {
        const dur = computeProjectDurationMs(target);
        const saved = await saveCinemaProject(databaseConfigured, {
          id: target.id,
          collectionId: colId,
          title: target.title,
          description: target.description,
          aspectRatio: target.aspectRatio,
          fps: target.fps,
          width: target.width,
          height: target.height,
          durationMs: dur,
          thumbnailUrl: target.thumbnailUrl,
          background: target.background,
          tracks: target.tracks,
          clips: target.clips,
          transitions: target.transitions,
          assets: target.assets,
          markers: target.markers,
          tags: target.tags,
        });
        setSummaries(await listCinemaProjects(databaseConfigured, colId));
        return saved;
      } catch {
        showNotice("Could not save Cinema project metadata.");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [activeCollectionId, databaseConfigured, showNotice],
  );

  const commitProjectChange = useCallback(
    (updater: (prev: CinemaProject) => CinemaProject, recordHistory = true) => {
      setProject((prev) => {
        if (recordHistory) {
          setUndoStack((u) => [...u.slice(-(MAX_HISTORY - 1)), prev]);
          setRedoStack([]);
        }
        const nextRaw = updater(prev);
        const durationMs = computeProjectDurationMs(nextRaw);
        const next: CinemaProject = {
          ...nextRaw,
          durationMs,
          clipCount: nextRaw.clips.length,
          trackCount: nextRaw.tracks.length,
          markerCount: nextRaw.markers.length,
          hasLinkedStudioAudio:
            nextRaw.assets.some((a) => Boolean(a.studioRef)) ||
            nextRaw.clips.some((c) => c.kind === "audio" && Boolean(c.studioRef)),
          updatedAt: new Date().toISOString(),
        };
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = window.setTimeout(() => {
          void persistProject(next);
        }, 1200);
        return next;
      });
    },
    [persistProject],
  );

  // Initial load from DB or local snapshot
  useEffect(() => {
    let alive = true;
    void (async () => {
      const st = await fetchCinemaStatus();
      if (!alive) return;
      setDatabaseConfigured(st.databaseConfigured);
      setPexelsConfigured(st.pexelsConfigured);
      const cols = await listCinemaCollections(st.databaseConfigured);
      if (!alive) return;
      setCollections(cols);
      const colId = cols[0]?.id ?? "";
      setActiveCollectionId(colId);
      if (colId) {
        const list = await listCinemaProjects(st.databaseConfigured, colId);
        if (!alive) return;
        setSummaries(list);
        if (list[0]) {
          const full = await getCinemaProject(st.databaseConfigured, list[0].id);
          if (full && alive) setProject(full);
        } else {
          setProject(buildTemplateProject("editorial-sequence", colId));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Hydrate HTMLVideoElement / HTMLImageElement & decoded AudioBuffers for all project assets
  useEffect(() => {
    for (const asset of project.assets) {
      const hasMedia = mediaElementsRef.current.has(asset.id);
      const hasAudio = audioBuffersRef.current.has(asset.id);
      if (
        ((asset.kind === "image" && hasMedia) ||
          (asset.kind === "audio" && hasAudio) ||
          (asset.kind === "video" && hasMedia)) ||
        hydratingRef.current.has(asset.id)
      ) {
        continue;
      }
      hydratingRef.current.add(asset.id);

      void (async () => {
        try {
          let blob: Blob | null = asset.idbKey ? await loadCinemaBlob(asset.idbKey) : null;
          if (!blob && asset.url) {
            const res = await fetch(asset.url);
            if (res.ok) blob = await res.blob();
          }
          if (!blob) return;

          if (asset.kind === "image") {
            const url = URL.createObjectURL(blob);
            blobUrlsRef.current.add(url);
            const img = new Image();
            img.crossOrigin = "anonymous";
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => reject(new Error("Image load failed"));
              img.src = url;
            });
            mediaElementsRef.current.set(asset.id, img);
            // Trigger fresh stage draw
            setMediaVersion((v) => v + 1);
          } else if (asset.kind === "video") {
            const url = URL.createObjectURL(blob);
            blobUrlsRef.current.add(url);
            const vid = document.createElement("video");
            vid.crossOrigin = "anonymous";
            vid.muted = true;
            vid.playsInline = true;
            vid.preload = "auto";
            vid.src = url;
            vid.addEventListener("seeked", () => {
              const queued = pendingVideoSeekRef.current.get(asset.id);
              if (queued !== undefined) {
                pendingVideoSeekRef.current.delete(asset.id);
                if (Math.abs(vid.currentTime - queued) > 0.03) {
                  vid.currentTime = queued;
                  return;
                }
              }
              stageRedrawRef.current?.();
            });
            vid.addEventListener("loadeddata", () => {
              stageRedrawRef.current?.();
            });
            await new Promise<void>((resolve) => {
              const timer = window.setTimeout(resolve, 4500);
              vid.onloadeddata = () => {
                window.clearTimeout(timer);
                resolve();
              };
              vid.onerror = () => {
                window.clearTimeout(timer);
                resolve();
              };
            });
            // Seek slightly past t=0 if still at blank frame so first frame decodes cleanly
            if (vid.readyState >= 2 && vid.currentTime === 0) {
              try {
                vid.currentTime = 0.01;
              } catch {
                // Ignore initial seek constraint
              }
            }
            mediaElementsRef.current.set(asset.id, vid);

            // Attempt audio decode so Video soundtracks work seamlessly in Web Audio + Visualizers + MP4 export
            try {
              const Ctx =
                window.AudioContext ||
                (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
              if (Ctx) {
                const actx = new Ctx();
                try {
                  const arr = await blob.arrayBuffer();
                  const decoded = await actx.decodeAudioData(arr);
                  audioBuffersRef.current.set(asset.id, decoded);
                } finally {
                  void actx.close();
                }
              }
            } catch {
              // Video may intentionally lack an audio track
            }
            setMediaVersion((v) => v + 1);
          } else if (asset.kind === "audio") {
            const Ctx =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            if (Ctx) {
              const actx = new Ctx();
              try {
                const arr = await blob.arrayBuffer();
                const decoded = await actx.decodeAudioData(arr);
                audioBuffersRef.current.set(asset.id, decoded);
              } finally {
                void actx.close();
              }
            }
          }
        } finally {
          hydratingRef.current.delete(asset.id);
        }
      })();
    }
  }, [project.assets]);

  // Pause audio if hidden by switching to another Nexus node
  useEffect(() => {
    if (!visible && playing) {
      audioEngineRef.current?.stop();
      queueMicrotask(() => setPlaying(false));
    }
  }, [playing, visible]);

  const syncVideoElements = useCallback((ms: number, isPlayingMode: boolean) => {
    const activeByAsset = new Map<string, number>();
    for (const clip of projectRef.current.clips) {
      if (clip.kind !== "video" || clip.hidden) continue;
      if (ms >= clip.startMs && ms <= clip.startMs + clip.durationMs) {
        const targetSec = Math.max(0, (clip.trimStartMs + (ms - clip.startMs) * (clip.speed || 1)) / 1000);
        activeByAsset.set(clip.assetId, targetSec);
        const vid = mediaElementsRef.current.get(clip.assetId);
        if (!(vid instanceof HTMLVideoElement)) continue;
        const rate = Math.max(0.25, Math.min(4, clip.speed || 1));
        if (Math.abs(vid.playbackRate - rate) > 0.02) {
          vid.playbackRate = rate;
        }
        if (isPlayingMode) {
          if (vid.paused) {
            if (Math.abs(vid.currentTime - targetSec) > 0.08) {
              vid.currentTime = targetSec;
            }
            void vid.play().catch(() => {});
          } else if (Math.abs(vid.currentTime - targetSec) > 0.28) {
            vid.currentTime = targetSec;
          }
        } else {
          if (!vid.paused) vid.pause();
          if (Math.abs(vid.currentTime - targetSec) > 0.03) {
            if (vid.seeking) {
              pendingVideoSeekRef.current.set(clip.assetId, targetSec);
            } else {
              vid.currentTime = targetSec;
            }
          }
        }
      }
    }

    for (const [assetId, el] of mediaElementsRef.current) {
      if (el instanceof HTMLVideoElement && !activeByAsset.has(assetId) && !el.paused) {
        el.pause();
      }
    }
  }, []);

  const handleSeek = useCallback(
    (nextMs: number) => {
      const dur = computeProjectDurationMs(projectRef.current);
      const clamped = Math.max(0, Math.min(dur, Math.round(nextMs)));
      playheadRef.current = clamped;
      setPlayheadMs(clamped);
      syncVideoElements(clamped, playing);
      if (playing) {
        audioEngineRef.current?.play(projectRef.current, clamped, audioBuffersRef.current);
      }
    },
    [playing, syncVideoElements],
  );

  // Playback loop (plays native <video> smoothly while syncing audio + RAF clock)
  useEffect(() => {
    if (!playing) {
      audioEngineRef.current?.stop();
      syncVideoElements(playheadRef.current, false);
      return;
    }

    const startWall = performance.now();
    const startOriginMs = playheadRef.current;
    audioEngineRef.current?.play(projectRef.current, startOriginMs, audioBuffersRef.current);
    syncVideoElements(startOriginMs, true);

    let rafId = 0;
    const tick = (now: number) => {
      const dur = computeProjectDurationMs(projectRef.current);
      const next = startOriginMs + (now - startWall);
      if (next >= dur) {
        if (loopEnabled) {
          setPlaying(false);
          playheadRef.current = 0;
          setPlayheadMs(0);
          syncVideoElements(0, false);
          window.setTimeout(() => setPlaying(true), 20);
        } else {
          setPlaying(false);
          playheadRef.current = dur;
          setPlayheadMs(dur);
          audioEngineRef.current?.stop();
          syncVideoElements(dur, false);
        }
        return;
      }
      playheadRef.current = next;
      setPlayheadMs(next);
      syncVideoElements(next, true);
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
      audioEngineRef.current?.stop();
    };
  }, [loopEnabled, playing, syncVideoElements]);

  const handleTogglePlay = useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    const dur = computeProjectDurationMs(projectRef.current);
    if (playheadRef.current >= dur - 40) {
      setPlayheadMs(0);
    }
    setPlaying(true);
  }, [playing]);

  const handleStepFrame = useCallback(
    (deltaFrames: number) => {
      if (playing) setPlaying(false);
      const frameMs = 1000 / projectRef.current.fps;
      handleSeek(playheadRef.current + deltaFrames * frameMs);
    },
    [handleSeek, playing],
  );

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1]!;
      setRedoStack((r) => [...r.slice(-(MAX_HISTORY - 1)), projectRef.current]);
      setProject(last);
      void persistProject(last);
      showNotice("Undid last edit.");
      return prev.slice(0, -1);
    });
  }, [persistProject, showNotice]);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1]!;
      setUndoStack((u) => [...u.slice(-(MAX_HISTORY - 1)), projectRef.current]);
      setProject(next);
      void persistProject(next);
      showNotice("Redid edit.");
      return prev.slice(0, -1);
    });
  }, [persistProject, showNotice]);

  const ensureTrackForKind = (tracks: CinemaTrack[], kind: CinemaTrackKind): [CinemaTrack[], string] => {
    const found = tracks.find((t) => t.kind === kind);
    if (found) return [tracks, found.id];
    const created: CinemaTrack = {
      id: makeId("trk"),
      name:
        kind === "audio"
          ? "Audio Track"
          : kind === "text"
            ? "Text Track"
            : kind === "overlay"
              ? "Overlay Track"
              : "Video Track",
      kind,
      muted: false,
      hidden: false,
      locked: false,
      volume: 1,
    };
    const nextTracks = kind === "audio" ? [...tracks, created] : [created, ...tracks];
    return [nextTracks, created.id];
  };

  const addAssetToTimeline = useCallback(
    (asset: CinemaAsset, preferredTrackId?: string, preferredStartMs?: number) => {
      const startAt = preferredStartMs ?? Math.round(playheadRef.current);
      const clipId = makeId(asset.kind === "audio" ? "aud" : asset.kind === "image" ? "img" : "vid");
      commitProjectChange((prev) => {
        const targetKind: CinemaTrackKind = asset.kind === "audio" ? "audio" : "video";
        let tracks = prev.tracks;
        let trackId = preferredTrackId;
        if (!trackId || !tracks.some((t) => t.id === trackId)) {
          [tracks, trackId] = ensureTrackForKind(tracks, targetKind);
        }

        const newClip: CinemaClip =
          asset.kind === "video"
            ? {
                id: clipId,
                trackId,
                name: asset.name,
                kind: "video",
                assetId: asset.id,
                startMs: startAt,
                durationMs: Math.max(500, asset.durationMs),
                trimStartMs: 0,
                sourceDurationMs: Math.max(500, asset.durationMs),
                speed: 1,
                locked: false,
                hidden: false,
                transform: { ...DEFAULT_TRANSFORM },
                filter: { ...DEFAULT_FILTER },
                animation: { inType: "none", inDurationMs: 0, outType: "none", outDurationMs: 0 },
                fit: "cover",
                volume: 1,
                muted: false,
                fadeInMs: 0,
                fadeOutMs: 0,
              }
            : asset.kind === "image"
              ? {
                  id: clipId,
                  trackId,
                  name: asset.name,
                  kind: "image",
                  assetId: asset.id,
                  startMs: startAt,
                  durationMs: 5000,
                  trimStartMs: 0,
                  sourceDurationMs: 5000,
                  speed: 1,
                  locked: false,
                  hidden: false,
                  transform: { ...DEFAULT_TRANSFORM },
                  filter: { ...DEFAULT_FILTER },
                  animation: { inType: "fade", inDurationMs: 300, outType: "fade", outDurationMs: 300 },
                  fit: "cover",
                  kenBurns: "none",
                }
              : {
                  id: clipId,
                  trackId,
                  name: asset.name,
                  kind: "audio",
                  assetId: asset.id,
                  startMs: startAt,
                  durationMs: Math.max(500, asset.durationMs),
                  trimStartMs: 0,
                  sourceDurationMs: Math.max(500, asset.durationMs),
                  speed: 1,
                  locked: false,
                  hidden: false,
                  volume: 1,
                  muted: false,
                  fadeInMs: 0,
                  fadeOutMs: 0,
                  peaks: asset.peaks,
                  ...(asset.studioRef ? { studioRef: asset.studioRef } : {}),
                };

        const hasAsset = prev.assets.some((a) => a.id === asset.id);
        return {
          ...prev,
          tracks,
          assets: hasAsset ? prev.assets : [asset, ...prev.assets],
          clips: [...prev.clips, newClip],
        };
      });
      setSelectedClipId(clipId);
      setInspectorTab("style");
      showNotice(`Added “${asset.name}” to timeline.`);
    },
    [commitProjectChange, showNotice],
  );

  const handleUploadFiles = useCallback(
    async (files: FileList | File[], targetTrackId?: string, startMs?: number) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      for (let i = 0; i < list.length; i++) {
        const asset = await ingestMediaFile(list[i]!);
        addAssetToTimeline(asset, targetTrackId, (startMs ?? Math.round(playheadRef.current)) + i * 250);
      }
    },
    [addAssetToTimeline],
  );

  const handleImportStudioRecording = useCallback(
    async (recording: StudioRecording, mode: "mix" | "stems" | "captions" | "markers") => {
      const insertAtMs =
        projectRef.current.clips.filter((c) => c.kind === "audio").length === 0
          ? 0
          : Math.round(playheadRef.current);

      let audioTrackId = projectRef.current.tracks.find((t) => t.kind === "audio")?.id;
      if (!audioTrackId) {
        const [, created] = ensureTrackForKind(projectRef.current.tracks, "audio");
        audioTrackId = created;
      }
      const textTrackId = projectRef.current.tracks.find((t) => t.kind === "text")?.id;

      const imported = await importStudioRecordingIntoCinema(
        recording,
        mode === "stems" ? "stems" : "mix",
        insertAtMs,
        audioTrackId,
        mode === "captions" ? textTrackId : undefined,
      );

      commitProjectChange((prev) => {
        let tracks = prev.tracks;
        let resolvedAudioId = tracks.find((t) => t.kind === "audio")?.id;
        if (!resolvedAudioId) [tracks, resolvedAudioId] = ensureTrackForKind(tracks, "audio");
        let resolvedTextId = tracks.find((t) => t.kind === "text")?.id;
        if (mode === "captions" && !resolvedTextId) {
          [tracks, resolvedTextId] = ensureTrackForKind(tracks, "text");
        }

        const existingMarkerIds = new Set(prev.markers.map((m) => m.studioMarkerId).filter(Boolean));
        const newMarkers = imported.markers.filter(
          (m) => !m.studioMarkerId || !existingMarkerIds.has(m.studioMarkerId),
        );

        const nextAssets =
          mode === "captions" || mode === "markers"
            ? prev.assets
            : [...imported.assets, ...prev.assets.filter((a) => !imported.assets.some((n) => n.id === a.id))];
        const nextClips =
          mode === "markers"
            ? prev.clips
            : mode === "captions"
              ? [
                  ...prev.clips,
                  ...imported.captionClips.map((c) => ({ ...c, trackId: resolvedTextId! })),
                ]
              : [
                  ...prev.clips,
                  ...imported.clips.map((c) => ({ ...c, trackId: resolvedAudioId! })),
                ];

        return {
          ...prev,
          tracks,
          assets: nextAssets,
          clips: nextClips,
          markers: [...prev.markers, ...newMarkers].sort((a, b) => a.atMs - b.atMs),
        };
      });

      if (mode === "markers") {
        showNotice(`Synced ${imported.markers.length} chapter cues from Studio “${recording.title}”.`);
      } else if (mode === "captions") {
        showNotice(`Imported ${imported.captionClips.length} timed captions from Studio transcript.`);
      } else {
        showNotice(`Synced Studio “${recording.title}” (${mode}) + markers to Cinema.`);
      }
    },
    [commitProjectChange, showNotice],
  );

  const applySmartKeepRegions = useCallback(
    (keepRegions: BridgeCutRegion[], sourceLabel: string) => {
      if (keepRegions.length === 0) return;
      commitProjectChange((prev) => {
        const mappedRanges: Array<{ origStart: number; origEnd: number; outStart: number }> = [];
        let cursor = 0;
        for (const r of keepRegions) {
          const s = Math.max(0, Math.round(r.startMs));
          const e = Math.max(s + 180, Math.round(r.endMs));
          mappedRanges.push({ origStart: s, origEnd: e, outStart: cursor });
          cursor += e - s;
        }

        const nextClips: CinemaClip[] = [];
        for (const clip of prev.clips) {
          if (clip.kind !== "video" && clip.kind !== "audio") {
            nextClips.push(clip);
            continue;
          }
          const clipEnd = clip.startMs + clip.durationMs;
          let addedPiece = false;
          for (let i = 0; i < mappedRanges.length; i++) {
            const mr = mappedRanges[i]!;
            const ovStart = Math.max(clip.startMs, mr.origStart);
            const ovEnd = Math.min(clipEnd, mr.origEnd);
            if (ovEnd - ovStart < 140) continue;
            addedPiece = true;
            const trimAdvance = Math.round((ovStart - clip.startMs) * (clip.speed || 1));
            const nextStart = mr.outStart + (ovStart - mr.origStart);
            const nextDur = ovEnd - ovStart;
            if (clip.kind === "audio") {
              const fracStart = (ovStart - clip.startMs) / Math.max(1, clip.durationMs);
              const fracEnd = (ovEnd - clip.startMs) / Math.max(1, clip.durationMs);
              const i0 = Math.floor(fracStart * clip.peaks.length);
              const i1 = Math.max(i0 + 4, Math.ceil(fracEnd * clip.peaks.length));
              nextClips.push({
                ...clip,
                id: i === 0 ? clip.id : makeId("sc"),
                startMs: nextStart,
                durationMs: nextDur,
                trimStartMs: clip.trimStartMs + trimAdvance,
                peaks: clip.peaks.slice(i0, i1),
              });
            } else {
              nextClips.push({
                ...clip,
                id: i === 0 ? clip.id : makeId("sc"),
                startMs: nextStart,
                durationMs: nextDur,
                trimStartMs: clip.trimStartMs + trimAdvance,
              });
            }
          }
          if (!addedPiece) {
            nextClips.push(clip);
          }
        }

        const nextMarkers = prev.markers.map((m) => {
          const hit = mappedRanges.find((r) => m.atMs >= r.origStart && m.atMs <= r.origEnd);
          return hit ? { ...m, atMs: hit.outStart + (m.atMs - hit.origStart) } : m;
        });

        return { ...prev, clips: nextClips, markers: nextMarkers };
      });
      showNotice(`Applied Smart Jump-Cuts (${keepRegions.length} active segments) from “${sourceLabel}”.`);
    },
    [commitProjectChange, showNotice],
  );

  const applyRhythmGrid = useCallback(
    (grid: CinemaRhythmGrid, label: string) => {
      commitProjectChange((prev) => ({
        ...prev,
        rhythmGrid: grid,
      }));
      setBeatSnapEnabled(true);
      showNotice(`Synced ${grid.bpm} BPM beat grid (${grid.beatMs.length} cues) from “${label}”.`);
    },
    [commitProjectChange, showNotice],
  );

  const refreshLinkedStudioAudioInPlace = useCallback(
    async (recordingId: string) => {
      const hasMatch = projectRef.current.clips.some(
        (c) => c.kind === "audio" && c.studioRef?.recordingId === recordingId,
      );
      if (!hasMatch) return;

      const st = await fetchStudioStatus();
      const recording = await getStudioRecording(st.databaseConfigured, recordingId);
      if (!recording || recording.tracks.length === 0) return;

      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;

      const actx = new Ctx();
      const decodedTracks: Array<{ track: (typeof recording.tracks)[number]; blob: Blob; buffer: AudioBuffer }> = [];
      try {
        for (const tr of recording.tracks) {
          let blob = tr.audioRef.idbKey ? await loadAudioBlob(tr.audioRef.idbKey) : null;
          if (!blob && tr.audioRef.url) {
            const res = await fetch(tr.audioRef.url);
            if (res.ok) blob = await res.blob();
          }
          if (!blob) continue;
          const buf = await actx.decodeAudioData(await blob.arrayBuffer());
          decodedTracks.push({ track: tr, blob, buffer: buf });
        }
      } finally {
        void actx.close();
      }
      if (decodedTracks.length === 0) return;

      const rendered = await mixTracksOffline(
        decodedTracks.map((d) => ({ track: d.track, buffer: d.buffer })),
        recording.masterGain ?? 1,
        48_000,
      );
      const wavBlob = encodeWavFromBuffer(rendered);
      const peaks = computePeaksFromBuffer(rendered, 180);
      const mixAssetId = makeId("ast");
      const idbKey = `cin-studio-live-${mixAssetId}`;
      await saveCinemaBlob(idbKey, wavBlob);
      audioBuffersRef.current.set(mixAssetId, rendered);

      for (const c of projectRef.current.clips) {
        if (c.kind === "audio" && c.studioRef?.recordingId === recordingId && !c.studioRef.trackId) {
          audioBuffersRef.current.set(c.assetId, rendered);
        }
      }

      commitProjectChange(
        (prev) => ({
          ...prev,
          assets: [
            {
              id: mixAssetId,
              kind: "audio",
              name: `${recording.title} (Live Mix)`,
              idbKey,
              url: null,
              mimeType: "audio/wav",
              byteLength: wavBlob.size,
              durationMs: Math.max(500, Math.round(rendered.duration * 1000)),
              width: 0,
              height: 0,
              thumbnails: [],
              peaks,
              source: "studio",
              studioRef: {
                recordingId: recording.id,
                updatedAt: recording.updatedAt,
                title: recording.title,
              },
            },
            ...prev.assets,
          ],
          clips: prev.clips.map((c) =>
            c.kind === "audio" && c.studioRef?.recordingId === recordingId && !c.studioRef.trackId
              ? {
                  ...c,
                  assetId: mixAssetId,
                  peaks,
                  sourceDurationMs: Math.max(500, Math.round(rendered.duration * 1000)),
                }
              : c,
          ),
        }),
        false,
      );
      setMediaVersion((v) => v + 1);
      showNotice(`Live-refreshed “${recording.title}” mix from Recording Studio.`);
    },
    [commitProjectChange, showNotice],
  );

  useEffect(
    () =>
      nexusBus.subscribe("studio:recording-saved", (ev) => {
        void refreshLinkedStudioAudioInPlace(ev.payload.recordingId);
      }),
    [refreshLinkedStudioAudioInPlace],
  );

  // Auto-handle routed Recording Studio envelopes pushed across the Nexus Bus
  useEffect(() => {
    if (!incomingStudioTake) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || incomingStudioTake.serial === handledSerialRef.current) return;
      handledSerialRef.current = incomingStudioTake.serial;
      const recording = studioEnvelopeToRecording(incomingStudioTake.envelope);
      void handleImportStudioRecording(recording, incomingStudioTake.mode ?? "mix");
    });
    return () => {
      cancelled = true;
    };
  }, [handleImportStudioRecording, incomingStudioTake]);

  // Handle incoming Studio Smart Jump-Cuts
  useEffect(() => {
    if (!incomingSmartCuts) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || incomingSmartCuts.serial === handledSmartCutsSerialRef.current) return;
      handledSmartCutsSerialRef.current = incomingSmartCuts.serial;
      applySmartKeepRegions(incomingSmartCuts.transfer.keepRegions, incomingSmartCuts.transfer.title);
    });
    return () => {
      cancelled = true;
    };
  }, [applySmartKeepRegions, incomingSmartCuts]);

  // Handle incoming Studio Beat & Transient Grid
  useEffect(() => {
    if (!incomingRhythmGrid) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || incomingRhythmGrid.serial === handledRhythmSerialRef.current) return;
      handledRhythmSerialRef.current = incomingRhythmGrid.serial;
      const tr = incomingRhythmGrid.transfer;
      applyRhythmGrid(
        {
          bpm: tr.bpm,
          beatMs: tr.beatMs,
          transientMs: tr.transientMs,
          sourceRecordingId: tr.recordingId,
          sourceTitle: tr.title,
        },
        tr.title,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [applyRhythmGrid, incomingRhythmGrid]);

  // Handle repaired Video Audio returned sample-locked from Recording Studio
  useEffect(() => {
    if (!incomingRepairedAudio) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled || incomingRepairedAudio.serial === handledRepairedSerialRef.current) return;
      handledRepairedSerialRef.current = incomingRepairedAudio.serial;
      const tr = incomingRepairedAudio.transfer;
      const blob = await loadAudioBlob(tr.audioKey);
      if (!blob || cancelled) return;

      const assetId = makeId("ast");
      const cinKey = `cin-repaired-${assetId}`;
      await saveCinemaBlob(cinKey, blob);

      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const actx = new Ctx();
        try {
          const decoded = await actx.decodeAudioData(await blob.arrayBuffer());
          audioBuffersRef.current.set(assetId, decoded);
        } finally {
          void actx.close();
        }
      }

      commitProjectChange((prev) => {
        const [tracks, audioTrackId] = ensureTrackForKind(prev.tracks, "audio");
        const nextClips = prev.clips.map((c) =>
          c.id === tr.targetVideoClipId && c.kind === "video" ? { ...c, audioDetached: true } : c,
        );
        const repairedClip: CinemaAudioClip = {
          id: makeId("aud"),
          trackId: audioTrackId,
          name: `${tr.title} (Repaired)`,
          kind: "audio",
          assetId,
          startMs: Math.max(0, tr.sourceStartMs),
          durationMs: tr.durationMs,
          trimStartMs: 0,
          sourceDurationMs: tr.durationMs,
          speed: 1,
          locked: false,
          hidden: false,
          volume: 1,
          muted: false,
          fadeInMs: 0,
          fadeOutMs: 0,
          peaks: tr.peaks,
          duckOthers: false,
          studioRef: {
            recordingId: tr.recordingId,
            updatedAt: tr.repairedAt,
            title: tr.title,
          },
        };
        return {
          ...prev,
          tracks,
          assets: [
            {
              id: assetId,
              kind: "audio",
              name: `${tr.title} (Repaired Audio)`,
              idbKey: cinKey,
              url: null,
              mimeType: tr.mimeType,
              byteLength: tr.byteLength,
              durationMs: tr.durationMs,
              width: 0,
              height: 0,
              thumbnails: [],
              peaks: tr.peaks,
              source: "studio",
              studioRef: {
                recordingId: tr.recordingId,
                updatedAt: tr.repairedAt,
                title: tr.title,
              },
            },
            ...prev.assets,
          ],
          clips: [...nextClips, repairedClip],
        };
      });
      setMediaVersion((v) => v + 1);
      showNotice(`Synced repaired audio back onto timeline at ${(tr.sourceStartMs / 1000).toFixed(1)}s.`);
    })();
    return () => {
      cancelled = true;
    };
  }, [commitProjectChange, incomingRepairedAudio, showNotice]);

  const handleExtractVideoAudio = useCallback(
    async (clipId: string) => {
      const clip = projectRef.current.clips.find((c) => c.id === clipId);
      if (!clip || clip.kind !== "video") return;
      const asset = projectRef.current.assets.find((a) => a.id === clip.assetId);
      if (!asset) return;

      showNotice(`Sending “${clip.name}” audio to Recording Studio…`);
      try {
        let blob: Blob | null = asset.idbKey ? await loadCinemaBlob(asset.idbKey) : null;
        if (!blob && asset.url) {
          const res = await fetch(asset.url);
          if (res.ok) blob = await res.blob();
        }
        if (!blob) {
          showNotice("Source video binary could not be loaded.");
          return;
        }
        const extracted = await extractAudioFromVideoBlob(blob, clip.name);
        emitCinemaAudioExtracted({
          projectId: projectRef.current.id,
          projectTitle: projectRef.current.title,
          clipName: clip.name,
          sourceVideoClipId: clip.id,
          sourceStartMs: clip.startMs,
          sourceTrimStartMs: clip.trimStartMs,
          audioKey: extracted.audioKey,
          durationMs: extracted.durationMs,
          sampleRate: extracted.sampleRate,
          byteLength: extracted.byteLength,
          mimeType: extracted.mimeType,
          peaks: extracted.peaks,
          extractedAt: new Date().toISOString(),
        });
        onRouteTransfer?.(CINEMA_NODE_ID);
      } catch (err) {
        showNotice(err instanceof Error ? err.message : "Audio extraction failed.");
      }
    },
    [onRouteTransfer, showNotice],
  );

  const handleRequestVoiceoverInStudio = useCallback(() => {
    emitCinemaVoiceoverRequested({
      projectId: projectRef.current.id,
      projectTitle: projectRef.current.title,
      playheadMs: Math.round(playheadRef.current),
      durationMs: computeProjectDurationMs(projectRef.current),
      markers: projectRef.current.markers,
      requestedAt: new Date().toISOString(),
    });
    onOpenStudio();
  }, [onOpenStudio]);

  const handleAddStockItem = useCallback(
    async (item: StockMediaItem) => {
      showNotice(`Caching “${item.title}” for frame-exact export…`);
      const res = await fetch(item.mediaUrl);
      if (!res.ok) {
        showNotice("Could not download stock item from Pexels proxy.");
        return;
      }
      const blob = await res.blob();
      const asset = await ingestMediaFile(blob, {
        name: item.title,
        source: "stock",
        url: item.mediaUrl,
        attribution: { author: item.author, url: item.authorUrl },
      });
      addAssetToTimeline(asset);
    },
    [addAssetToTimeline, showNotice],
  );

  const handleAddTextPreset = useCallback(
    (preset: TextStylePreset) => {
      const clipId = makeId("txt");
      const startMs = Math.round(playheadRef.current);
      commitProjectChange((prev) => {
        const [tracks, trackId] = ensureTrackForKind(prev.tracks, "text");
        return {
          ...prev,
          tracks,
          clips: [
            ...prev.clips,
            {
              id: clipId,
              trackId,
              name: preset.name,
              kind: "text",
              startMs,
              durationMs: 4500,
              trimStartMs: 0,
              sourceDurationMs: 4500,
              speed: 1,
              locked: false,
              hidden: false,
              text: preset.previewText,
              fontFamily: preset.fontFamily,
              fontSize: preset.fontSize,
              fontWeight: preset.fontWeight,
              letterSpacing: preset.letterSpacing,
              lineHeight: preset.lineHeight,
              align: preset.align,
              color: preset.color,
              backgroundColor: preset.backgroundColor,
              backgroundPadding: preset.backgroundPadding,
              backgroundRadius: preset.backgroundRadius,
              strokeColor: "transparent",
              strokeWidth: 0,
              textPreset: preset.id,
              transform: {
                ...DEFAULT_TRANSFORM,
                x: 50,
                y: preset.y,
                width: preset.width,
                height: preset.height,
              },
              animation: { inType: "rise", inDurationMs: 360, outType: "fade", outDurationMs: 280 },
            },
          ],
        };
      });
      setSelectedClipId(clipId);
      setInspectorTab("style");
    },
    [commitProjectChange],
  );

  const handleAddElementPreset = useCallback(
    (preset: (typeof ELEMENT_PRESETS)[number]) => {
      const clipId = makeId("elm");
      const startMs = Math.round(playheadRef.current);
      commitProjectChange((prev) => {
        const [tracks, trackId] = ensureTrackForKind(prev.tracks, "overlay");
        const nextClip: CinemaClip =
          preset.category === "visualizer"
            ? {
                id: clipId,
                trackId,
                name: preset.name,
                kind: "visualizer",
                startMs,
                durationMs: 6000,
                trimStartMs: 0,
                sourceDurationMs: 6000,
                speed: 1,
                locked: false,
                hidden: false,
                style: preset.visualizerStyle ?? "bars",
                barCount: 40,
                color: preset.fill,
                secondaryColor: preset.stroke,
                sensitivity: 1.25,
                transform: { ...DEFAULT_TRANSFORM, x: 50, y: 65, width: preset.width, height: preset.height },
                animation: { inType: "fade", inDurationMs: 300, outType: "fade", outDurationMs: 300 },
              }
            : {
                id: clipId,
                trackId,
                name: preset.name,
                kind: "shape",
                startMs,
                durationMs: 5000,
                trimStartMs: 0,
                sourceDurationMs: 5000,
                speed: 1,
                locked: false,
                hidden: false,
                shapeKind: preset.shapeKind ?? "rect",
                fill: preset.fill,
                stroke: preset.stroke,
                strokeWidth: 2,
                transform: { ...DEFAULT_TRANSFORM, x: 50, y: 50, width: preset.width, height: preset.height },
                animation: { inType: "fade", inDurationMs: 260, outType: "fade", outDurationMs: 260 },
              };
        return { ...prev, tracks, clips: [...prev.clips, nextClip] };
      });
      setSelectedClipId(clipId);
      setInspectorTab("style");
    },
    [commitProjectChange],
  );

  const handleCapturedMedia = useCallback(
    async (blob: Blob, name: string, alsoSendAudioToStudio: boolean) => {
      const asset = await ingestMediaFile(blob, { name, source: "capture" });
      addAssetToTimeline(asset);
      if (alsoSendAudioToStudio) {
        try {
          const extracted = await extractAudioFromVideoBlob(blob, name);
          emitCinemaAudioExtracted({
            projectId: projectRef.current.id,
            projectTitle: projectRef.current.title,
            clipName: name,
            sourceVideoClipId: "",
            sourceStartMs: Math.round(playheadRef.current),
            sourceTrimStartMs: 0,
            audioKey: extracted.audioKey,
            durationMs: extracted.durationMs,
            sampleRate: extracted.sampleRate,
            byteLength: extracted.byteLength,
            mimeType: extracted.mimeType,
            peaks: extracted.peaks,
            extractedAt: new Date().toISOString(),
          });
        } catch {
          // Recorded screen may have no audio track
        }
      }
    },
    [addAssetToTimeline],
  );

  const handleUpdateClip = useCallback(
    (clipId: string, updater: (c: CinemaClip) => CinemaClip, recordHistory = true) => {
      commitProjectChange(
        (prev) => ({
          ...prev,
          clips: prev.clips.map((c) => (c.id === clipId ? updater(c) : c)),
        }),
        recordHistory,
      );
    },
    [commitProjectChange],
  );

  const handlePreviewTransform = useCallback((clipId: string, transform: CinemaTransform) => {
    setProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => (c.id === clipId && c.kind !== "audio" ? { ...c, transform } : c)),
    }));
  }, []);

  const handleCommitTransform = useCallback(
    (clipId: string, transform: CinemaTransform) => {
      handleUpdateClip(clipId, (c) => (c.kind !== "audio" ? { ...c, transform } : c), true);
    },
    [handleUpdateClip],
  );

  const handleSplitClipAt = useCallback(
    (clipId: string, atMs: number) => {
      const target = projectRef.current.clips.find((c) => c.id === clipId);
      if (!target) return;
      const offsetInClip = Math.round(atMs - target.startMs);
      if (offsetInClip < 180 || offsetInClip > target.durationMs - 180) {
        showNotice("Place playhead inside the clip to split it.");
        return;
      }

      const rightId = makeId("cut");
      const leftDur = offsetInClip;
      const rightDur = target.durationMs - offsetInClip;
      const rightTrim = target.trimStartMs + Math.round(offsetInClip * (target.speed || 1));

      const left: CinemaClip = { ...target, durationMs: leftDur };
      const right: CinemaClip =
        target.kind === "audio"
          ? {
              ...target,
              id: rightId,
              name: `${target.name} (cut)`,
              startMs: target.startMs + offsetInClip,
              durationMs: rightDur,
              trimStartMs: rightTrim,
              peaks: target.peaks.slice(Math.floor((offsetInClip / target.durationMs) * target.peaks.length)),
            }
          : {
              ...target,
              id: rightId,
              name: `${target.name} (cut)`,
              startMs: target.startMs + offsetInClip,
              durationMs: rightDur,
              trimStartMs: rightTrim,
            };

      commitProjectChange((prev) => ({
        ...prev,
        clips: prev.clips.flatMap((c) => (c.id === clipId ? [left, right] : [c])),
      }));
      setSelectedClipId(rightId);
      showNotice(`Split “${target.name}” at ${(atMs / 1000).toFixed(1)}s.`);
    },
    [commitProjectChange, showNotice],
  );

  const handleDuplicateClip = useCallback(
    (clipId: string) => {
      const target = projectRef.current.clips.find((c) => c.id === clipId);
      if (!target) return;
      const copyId = makeId("dup");
      const copy: CinemaClip = {
        ...target,
        id: copyId,
        name: `${target.name} copy`.slice(0, 64),
        startMs: target.startMs + target.durationMs + 150,
      };
      commitProjectChange((prev) => ({ ...prev, clips: [...prev.clips, copy] }));
      setSelectedClipId(copyId);
    },
    [commitProjectChange],
  );

  const handleDeleteClip = useCallback(
    (clipId: string) => {
      commitProjectChange((prev) => ({
        ...prev,
        clips: prev.clips.filter((c) => c.id !== clipId),
        transitions: prev.transitions.filter((t) => t.afterClipId !== clipId),
      }));
      if (selectedClipId === clipId) setSelectedClipId(null);
    },
    [commitProjectChange, selectedClipId],
  );

  const handleReorderLayer = useCallback(
    (clipId: string, dir: "up" | "down") => {
      commitProjectChange((prev) => {
        const idx = prev.clips.findIndex((c) => c.id === clipId);
        if (idx < 0) return prev;
        const target = dir === "up" ? idx + 1 : idx - 1;
        if (target < 0 || target >= prev.clips.length) return prev;
        const next = [...prev.clips];
        [next[idx], next[target]] = [next[target]!, next[idx]!];
        return { ...prev, clips: next };
      });
    },
    [commitProjectChange],
  );

  const handleAddMarker = useCallback(() => {
    const atMs = Math.round(playheadRef.current);
    const created: CinemaMarker = {
      id: makeId("mrk"),
      atMs,
      label: `Scene ${projectRef.current.markers.length + 1}`,
      kind: "cue",
      note: null,
    };
    commitProjectChange((prev) => ({
      ...prev,
      markers: [...prev.markers, created].sort((a, b) => a.atMs - b.atMs),
    }));
    showNotice(`Added marker at ${(atMs / 1000).toFixed(1)}s.`);
  }, [commitProjectChange, showNotice]);

  const handleResyncStudioAudio = useCallback(
    async (clipId: string) => {
      const clip = projectRef.current.clips.find((c): c is CinemaAudioClip => c.id === clipId && c.kind === "audio");
      if (!clip?.studioRef) return;
      const res = await fetch(`/api/studio/recordings/${encodeURIComponent(clip.studioRef.recordingId)}`);
      if (res.ok) {
        const body = (await res.json()) as { recording: StudioRecording };
        await handleImportStudioRecording(body.recording, clip.studioRef.trackId ? "stems" : "mix");
        return;
      }
      showNotice("Loaded latest Studio metadata snapshot.");
    },
    [handleImportStudioRecording, showNotice],
  );

  const handleSendMasterWavToStudio = useCallback(
    async (wavBlob: Blob) => {
      const key = `st-master-cinema-${makeId("wav")}`;
      await saveAudioBlob(key, wavBlob);
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      let peaks: number[] = [];
      let sampleRate = 48_000;
      let durationMs = computeProjectDurationMs(projectRef.current);
      if (AudioCtx) {
        const actx = new AudioCtx();
        try {
          const decoded = await actx.decodeAudioData(await wavBlob.arrayBuffer());
          peaks = computePeaksFromBuffer(decoded, 180);
          sampleRate = decoded.sampleRate;
          durationMs = Math.round(decoded.duration * 1000);
        } finally {
          void actx.close();
        }
      }
      emitCinemaAudioExtracted({
        projectId: projectRef.current.id,
        projectTitle: projectRef.current.title,
        clipName: `${projectRef.current.title} Master`,
        sourceVideoClipId: "",
        sourceStartMs: 0,
        sourceTrimStartMs: 0,
        audioKey: key,
        durationMs,
        sampleRate,
        byteLength: wavBlob.size,
        mimeType: "audio/wav",
        peaks,
        extractedAt: new Date().toISOString(),
      });
    },
    [],
  );

  const handleCreateLowerThirdAtMarker = useCallback(
    (marker: CinemaMarker) => {
      const preset = TEXT_PRESETS.find((t) => t.id === "lower-third") ?? TEXT_PRESETS[0]!;
      const clipId = makeId("l3d");
      commitProjectChange((prev) => {
        const [tracks, textTrackId] = ensureTrackForKind(prev.tracks, "text");
        return {
          ...prev,
          tracks,
          clips: [
            ...prev.clips,
            {
              id: clipId,
              trackId: textTrackId,
              name: `Lower-Third · ${marker.label}`,
              kind: "text",
              startMs: marker.atMs,
              durationMs: 3600,
              trimStartMs: 0,
              sourceDurationMs: 3600,
              speed: 1,
              locked: false,
              hidden: false,
              text: marker.label,
              fontFamily: preset.fontFamily,
              fontSize: preset.fontSize,
              fontWeight: preset.fontWeight,
              letterSpacing: preset.letterSpacing,
              lineHeight: preset.lineHeight,
              align: "left",
              color: preset.color,
              backgroundColor: preset.backgroundColor,
              backgroundPadding: preset.backgroundPadding,
              backgroundRadius: preset.backgroundRadius,
              strokeColor: "transparent",
              strokeWidth: 0,
              textPreset: preset.id,
              transform: {
                ...DEFAULT_TRANSFORM,
                x: 29,
                y: 84,
                width: 46,
                height: 11,
              },
              animation: { inType: "slide-left", inDurationMs: 300, outType: "fade", outDurationMs: 260 },
            },
          ],
        };
      });
      setSelectedClipId(clipId);
      setInspectorTab("style");
      showNotice(`Added lower-third "${marker.label}" at ${(marker.atMs / 1000).toFixed(1)}s.`);
    },
    [commitProjectChange, showNotice],
  );

  const handleMarkersToLowerThirds = useCallback(() => {
    const markers = projectRef.current.markers;
    if (markers.length === 0) {
      showNotice("Add at least one marker to generate lower-thirds.");
      return;
    }
    const preset = TEXT_PRESETS.find((t) => t.id === "lower-third") ?? TEXT_PRESETS[0]!;
    commitProjectChange((prev) => {
      const [tracks, textTrackId] = ensureTrackForKind(prev.tracks, "text");
      const generated: CinemaClip[] = markers.map((marker) => ({
        id: makeId("l3d"),
        trackId: textTrackId,
        name: `Lower-Third · ${marker.label}`,
        kind: "text",
        startMs: marker.atMs,
        durationMs: 3500,
        trimStartMs: 0,
        sourceDurationMs: 3500,
        speed: 1,
        locked: false,
        hidden: false,
        text: marker.label,
        fontFamily: preset.fontFamily,
        fontSize: preset.fontSize,
        fontWeight: preset.fontWeight,
        letterSpacing: preset.letterSpacing,
        lineHeight: preset.lineHeight,
        align: "left",
        color: preset.color,
        backgroundColor: preset.backgroundColor,
        backgroundPadding: preset.backgroundPadding,
        backgroundRadius: preset.backgroundRadius,
        strokeColor: "transparent",
        strokeWidth: 0,
        textPreset: preset.id,
        transform: {
          ...DEFAULT_TRANSFORM,
          x: 29,
          y: 84,
          width: 46,
          height: 11,
        },
        animation: { inType: "slide-left", inDurationMs: 280, outType: "fade", outDurationMs: 240 },
      }));
      return { ...prev, tracks, clips: [...prev.clips, ...generated] };
    });
    showNotice(`Generated ${markers.length} lower-third title cards from markers.`);
  }, [commitProjectChange, showNotice]);

  const decodeStudioMixBuffer = useCallback(async (recording: StudioRecording): Promise<AudioBuffer | null> => {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx || recording.tracks.length === 0) return null;
    const actx = new Ctx();
    const items: Array<{ track: (typeof recording.tracks)[number]; buffer: AudioBuffer }> = [];
    try {
      for (const tr of recording.tracks) {
        let blob = tr.audioRef.idbKey ? await loadAudioBlob(tr.audioRef.idbKey) : null;
        if (!blob && tr.audioRef.url) {
          const res = await fetch(tr.audioRef.url);
          if (res.ok) blob = await res.blob();
        }
        if (!blob) continue;
        const decoded = await actx.decodeAudioData(await blob.arrayBuffer());
        items.push({ track: tr, buffer: decoded });
      }
    } finally {
      void actx.close();
    }
    if (items.length === 0) return null;
    return mixTracksOffline(items, recording.masterGain ?? 1, 48_000);
  }, []);

  const handleSmartCutFromStudio = useCallback(
    async (recording: StudioRecording) => {
      const mixed = await decodeStudioMixBuffer(recording);
      if (!mixed) {
        showNotice("No offline audio tracks available for silence detection.");
        return;
      }
      const { keepRegions } = detectSpeechAndSilenceRegions(mixed);
      applySmartKeepRegions(keepRegions, recording.title);
    },
    [applySmartKeepRegions, decodeStudioMixBuffer, showNotice],
  );

  const handleImportBeatGridFromStudio = useCallback(
    async (recording: StudioRecording) => {
      const mixed = await decodeStudioMixBuffer(recording);
      if (!mixed) {
        showNotice("No offline audio tracks available for beat detection.");
        return;
      }
      const rhythm = detectBeatsAndTransients(mixed, recording.bpm);
      applyRhythmGrid(
        {
          bpm: rhythm.bpm,
          beatMs: rhythm.beatMs,
          transientMs: rhythm.transientMs,
          sourceRecordingId: recording.id,
          sourceTitle: recording.title,
        },
        recording.title,
      );
    },
    [applyRhythmGrid, decodeStudioMixBuffer, showNotice],
  );

  const handleAutoCutToBeat = useCallback(() => {
    const grid = projectRef.current.rhythmGrid;
    if (!grid || grid.beatMs.length < 2) {
      showNotice("Import a Beat Grid from Nexus Links (Recording Studio) first.");
      return;
    }
    const targetClip =
      (selectedClipId
        ? projectRef.current.clips.find((c) => c.id === selectedClipId && c.kind === "video")
        : null) ?? projectRef.current.clips.find((c) => c.kind === "video");
    if (!targetClip) {
      showNotice("Place a video clip on the timeline to auto-cut on the beat.");
      return;
    }

    // Slice every 2 beats across the clip's span cleanly
    const beatPoints = grid.beatMs.filter(
      (b, idx) =>
        idx % 2 === 0 &&
        b > targetClip.startMs + 350 &&
        b < targetClip.startMs + targetClip.durationMs - 350,
    );
    if (beatPoints.length === 0) {
      showNotice("Clip does not span multiple beat intervals.");
      return;
    }

    const boundaries = [targetClip.startMs, ...beatPoints, targetClip.startMs + targetClip.durationMs];
    const sliced: CinemaClip[] = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      const s = boundaries[i]!;
      const e = boundaries[i + 1]!;
      const dur = e - s;
      if (dur < 220) continue;
      const trimAdvance = Math.round((s - targetClip.startMs) * (targetClip.speed || 1));
      sliced.push({
        ...targetClip,
        id: i === 0 ? targetClip.id : makeId("bt"),
        name: `${targetClip.name} · B${i + 1}`,
        startMs: s,
        durationMs: dur,
        trimStartMs: targetClip.trimStartMs + trimAdvance,
      });
    }

    commitProjectChange((prev) => ({
      ...prev,
      clips: prev.clips.flatMap((c) => (c.id === targetClip.id ? sliced : [c])),
    }));
    showNotice(`Sliced “${targetClip.name}” across ${sliced.length} beat cuts (${grid.bpm} BPM).`);
  }, [commitProjectChange, selectedClipId, showNotice]);

  // Full Pro Keyboard Shortcuts (guarded from inputs/textareas & only active when Cinema is visible)
  useEffect(() => {
    if (!visible) return;
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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d" && selectedClipId) {
        e.preventDefault();
        handleDuplicateClip(selectedClipId);
        return;
      }

      if (e.code === "Space" || e.key === "k" || e.key === "K") {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        handleSeek(playheadRef.current - 1000);
      } else if (e.key === ",") {
        e.preventDefault();
        handleStepFrame(-1);
      } else if (e.key === ".") {
        e.preventDefault();
        handleStepFrame(1);
      } else if (e.key === "s" || e.key === "S" || e.key === "x" || e.key === "X") {
        e.preventDefault();
        const targetClip =
          (selectedClipId ? projectRef.current.clips.find((c) => c.id === selectedClipId) : null) ??
          projectRef.current.clips.find(
            (c) => playheadRef.current > c.startMs + 140 && playheadRef.current < c.startMs + c.durationMs - 140,
          );
        if (targetClip) handleSplitClipAt(targetClip.id, playheadRef.current);
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        handleAddMarker();
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        setLoopEnabled((v) => !v);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedClipId) {
        e.preventDefault();
        handleDeleteClip(selectedClipId);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    handleAddMarker,
    handleDeleteClip,
    handleDuplicateClip,
    handleRedo,
    handleSeek,
    handleSplitClipAt,
    handleStepFrame,
    handleTogglePlay,
    handleUndo,
    selectedClipId,
    visible,
  ]);

  const selectedClip = useMemo(
    () => (selectedClipId ? project.clips.find((c) => c.id === selectedClipId) ?? null : null),
    [project.clips, selectedClipId],
  );
  const activeFolderName =
    collections.find((c) => c.id === activeCollectionId)?.name ?? "Cinema projects";

  return (
    <section
      aria-label="Nexus Cinema Video Studio"
      data-cinema-ready="true"
      className="cinema-screen flex h-full w-full flex-col overflow-hidden"
    >
      {/* Apple Liquid Glass Header (h-12 & pl-[68px] align seamlessly beside top-left Nexus Orb & w-[68px] rail) */}
      <header className="cinema-header flex h-12 shrink-0 items-center justify-between gap-2 pl-[68px] pr-3 sm:pr-4">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            type="button"
            variant={sidebarOpen ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={() => {
              if (typeof window !== "undefined" && window.innerWidth < 1024) {
                setMobileSidebarOpen((v) => !v);
              } else {
                setSidebarOpen((v) => !v);
              }
            }}
            aria-label={sidebarOpen ? "Collapse Cinema browser" : "Open Cinema browser"}
            aria-pressed={sidebarOpen}
            className="size-7 rounded-lg"
          >
            <PanelLeft className="size-4" />
          </Button>

          <Input
            value={project.title}
            onChange={(e) =>
              commitProjectChange((p) => ({ ...p, title: e.target.value }), false)
            }
            onBlur={() => void persistProject(projectRef.current)}
            aria-label="Cinema project title"
            className="h-7 w-full max-w-[160px] min-w-0 border-0 bg-transparent px-1.5 text-[13.5px] font-medium tracking-[-0.01em] text-foreground shadow-none focus-visible:ring-1 sm:max-w-[210px]"
          />

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setProjectsDrawerOpen(true)}
                  aria-label="Browse Cinema projects"
                  className="size-7 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className="size-4" />
                </Button>
              }
            />
            <TooltipContent side="bottom">Projects &amp; folders ({summaries.length})</TooltipContent>
          </Tooltip>

          <div className="hidden items-center gap-0.5 pl-1 sm:flex">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={undoStack.length === 0}
              onClick={handleUndo}
              aria-label="Undo"
              className="size-7 rounded-lg"
            >
              <Undo2 className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={redoStack.length === 0}
              onClick={handleRedo}
              aria-label="Redo"
              className="size-7 rounded-lg"
            >
              <Redo2 className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Center: Clean Format Spec Trigger */}
        <div className="hidden items-center gap-2 md:flex">
          <button
            type="button"
            onClick={() => {
              setSidebarTab("canvas");
              setSidebarOpen(true);
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border/75 bg-foreground/[0.03] px-2.5 font-mono text-[11px] text-muted-foreground tabular-nums transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <span>{project.aspectRatio}</span>
            <span className="opacity-40">·</span>
            <span>{project.fps}fps</span>
            {project.rhythmGrid ? (
              <>
                <span className="opacity-40">·</span>
                <span className="text-[color:var(--nexus-link)]">{project.rhythmGrid.bpm} BPM</span>
              </>
            ) : null}
          </button>
        </div>

        {/* Right: Subtle Gold Links Menu, Inspector, Export, Actions, Done */}
        <div className="flex items-center gap-1.5">
          {notice ? (
            <span className="hidden max-w-[220px] truncate rounded-lg border border-border/75 bg-card/75 px-2.5 py-1 text-[11px] text-foreground xl:inline">
              {notice}
            </span>
          ) : null}

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
                onClick={handleRequestVoiceoverInStudio}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-foreground hover:bg-foreground/[0.06]"
              >
                <MonitorPlay className="size-3.5 text-[color:var(--nexus-link)]" />
                <span>Score in Studio (Live Monitor)</span>
              </button>
              <button
                type="button"
                onClick={handleAutoCutToBeat}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-foreground hover:bg-foreground/[0.06]"
              >
                <Scissors className="size-3.5 text-[color:var(--nexus-link)]" />
                <span>Auto-Cut Clip to Studio Beat Grid</span>
              </button>
              <button
                type="button"
                onClick={handleMarkersToLowerThirds}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-foreground hover:bg-foreground/[0.06]"
              >
                <Type className="size-3.5 text-[color:var(--nexus-link)]" />
                <span>Generate Lower-Thirds from Cues</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSidebarTab("nodes");
                  setSidebarOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-foreground hover:bg-foreground/[0.06]"
              >
                <Waves className="size-3.5 text-[color:var(--nexus-link)]" />
                <span>Browse Recording Studio Sessions</span>
              </button>
              <Separator className="my-1" />
              <button
                type="button"
                onClick={onOpenStudio}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11.5px] text-[color:var(--nexus-link)] hover:bg-[color:var(--nexus-link-soft)]"
              >
                <span>Open Recording Studio</span>
                <span className="font-mono text-[10px]">St</span>
              </button>
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            size="sm"
            variant={inspectorOpen ? "secondary" : "outline"}
            onClick={() => {
              if (window.innerWidth < 1280) setMobileInspectorOpen((v) => !v);
              else setInspectorOpen((v) => !v);
            }}
            className="h-7 gap-1.5 rounded-lg px-2.5 text-[11.5px]"
          >
            <PanelRight className="size-3.5" />
            <span className="hidden sm:inline">Inspector</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => setExportOpen(true)}
            className="h-7 gap-1.5 rounded-lg bg-foreground px-3 text-[11.5px] font-medium text-background hover:opacity-90"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            <span>Export</span>
          </Button>

          <Popover>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Cinema actions"
                  className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              }
            />
            <PopoverContent align="end" className="w-56 rounded-xl p-1.5">
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => void persistProject(projectRef.current).then(() => showNotice("Saved Cinema project."))}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-foreground hover:bg-foreground/[0.06]"
                >
                  <Save className="size-3.5 text-muted-foreground" />
                  <span>Save project now</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCaptureOpen(true)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-foreground hover:bg-foreground/[0.06]"
                >
                  <Video className="size-3.5 text-muted-foreground" />
                  <span>Record Camera / Screen</span>
                </button>
                <button
                  type="button"
                  onClick={handleRequestVoiceoverInStudio}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-[color:var(--nexus-link)] hover:bg-[color:var(--nexus-link-soft)]"
                >
                  <Mic className="size-3.5" />
                  <span>Record Voiceover in Studio</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const snap = await exportCurrentFramePng(projectRef.current, playheadRef.current, {
                      mediaElements: mediaElementsRef.current,
                    });
                    downloadBlob(snap.blob, snap.filename);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-foreground hover:bg-foreground/[0.06]"
                >
                  <ImageIcon className="size-3.5 text-muted-foreground" />
                  <span>Save Frame Snapshot (.png)</span>
                </button>
                <Separator className="my-1" />
                <button
                  type="button"
                  onClick={onReleaseNode}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                  <span>Disconnect Cinema node</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="h-7 rounded-lg px-2.5 text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            Done
          </Button>
        </div>
      </header>

      {/* Main 3-Column Cinema Workspace (Sidebar | Theater Stage + Timeline | Inspector) */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {!stageExpanded ? (
          <CinemaSidebar
            open={sidebarOpen}
            activeTab={sidebarTab}
            onSelectTab={(tab) => {
              if (sidebarOpen && sidebarTab === tab) {
                setSidebarOpen(false);
              } else {
                setSidebarTab(tab);
                setSidebarOpen(true);
              }
            }}
            onToggleCollapse={() => setSidebarOpen(false)}
            mobileOpen={mobileSidebarOpen}
            onMobileOpenChange={setMobileSidebarOpen}
            project={project}
            pexelsConfigured={pexelsConfigured}
            onApplyTemplate={(tplId) => {
              const tpl = buildTemplateProject(tplId, project.collectionId || activeCollectionId, project.aspectRatio);
              setProject(tpl);
              playheadRef.current = 0;
              setPlayheadMs(0);
              setSelectedClipId(tpl.clips[0]?.id ?? null);
              showNotice(`Loaded “${tpl.title}” template.`);
            }}
            onUploadFiles={handleUploadFiles}
            onAddAssetToTimeline={(asset) => addAssetToTimeline(asset)}
            onOpenCapture={() => setCaptureOpen(true)}
            onImportStudioRecording={handleImportStudioRecording}
            onSmartCutFromStudio={handleSmartCutFromStudio}
            onImportBeatGridFromStudio={handleImportBeatGridFromStudio}
            onMarkersToLowerThirds={handleMarkersToLowerThirds}
            onRequestVoiceoverInStudio={handleRequestVoiceoverInStudio}
            onAddStockItem={handleAddStockItem}
            onAddTextPreset={handleAddTextPreset}
            onAddElementPreset={handleAddElementPreset}
            onChangeAspectRatio={(ratio: CinemaAspectRatio) => {
              const dims = ASPECT_RATIO_PRESETS[ratio];
              commitProjectChange((prev) => ({
                ...prev,
                aspectRatio: ratio,
                width: dims.width,
                height: dims.height,
              }));
            }}
            onChangeFps={(fps) => commitProjectChange((prev) => ({ ...prev, fps }))}
            onChangeBackground={(background: CinemaBackground) =>
              commitProjectChange((prev) => ({ ...prev, background }))
            }
            onOpenStudioView={onOpenStudio}
          />
        ) : null}

        {/* Center Column: Interactive Theater Stage + Multi-Track Timeline */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <CinemaStage
            project={project}
            playheadMs={playheadMs}
            playheadRef={playheadRef}
            playing={playing}
            loopEnabled={loopEnabled}
            showSafeGuides={showSafeGuides}
            selectedClipId={selectedClipId}
            canvasZoom={canvasZoom}
            stageExpanded={stageExpanded}
            mediaElementsRef={mediaElementsRef}
            audioEngineRef={audioEngineRef}
            redrawRef={stageRedrawRef}
            mediaVersion={mediaVersion}
            onSelectClip={setSelectedClipId}
            onPreviewTransform={handlePreviewTransform}
            onCommitTransform={handleCommitTransform}
            onUpdateClip={handleUpdateClip}
            onDuplicateClip={handleDuplicateClip}
            onReorderLayer={handleReorderLayer}
            onDeleteClip={handleDeleteClip}
            onExtractVideoAudio={handleExtractVideoAudio}
            onTogglePlay={handleTogglePlay}
            onSeek={handleSeek}
            onStepFrame={handleStepFrame}
            onToggleLoop={() => setLoopEnabled((v) => !v)}
            onToggleSafeGuides={() => setShowSafeGuides((v) => !v)}
            onChangeCanvasZoom={setCanvasZoom}
            onToggleStageExpanded={() => setStageExpanded((v) => !v)}
            renderCanvasRef={renderCanvasRef}
          />

          {!stageExpanded ? (
            <CinemaTimeline
              project={project}
              playheadMs={playheadMs}
              zoom={timelineZoom}
              snapEnabled={snapEnabled}
              beatSnapEnabled={beatSnapEnabled}
              selectedClipId={selectedClipId}
              timelineHeight={timelineHeight}
              onResizeHeight={setTimelineHeight}
              onSelectClip={(id) => {
                setSelectedClipId(id);
                if (id) setInspectorTab("style");
              }}
              onSeek={handleSeek}
              onChangeZoom={setTimelineZoom}
              onToggleSnap={() => setSnapEnabled((v) => !v)}
              onToggleBeatSnap={() => setBeatSnapEnabled((v) => !v)}
              onAutoCutToBeat={handleAutoCutToBeat}
              onMoveClip={(clipId, startMs, trackId) =>
                commitProjectChange((prev) => ({
                  ...prev,
                  clips: prev.clips.map((c) => (c.id === clipId ? { ...c, startMs, trackId } : c)),
                }))
              }
              onTrimClip={(clipId, patch) =>
                commitProjectChange((prev) => ({
                  ...prev,
                  clips: prev.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
                }))
              }
              onSplitClipAt={handleSplitClipAt}
              onDuplicateClip={handleDuplicateClip}
              onDeleteClip={handleDeleteClip}
              onAddMarker={handleAddMarker}
              onSelectMarker={() => setInspectorTab("layers")}
              onUpdateMarker={(markerId, label) =>
                commitProjectChange(
                  (prev) => ({
                    ...prev,
                    markers: prev.markers.map((m) => (m.id === markerId ? { ...m, label } : m)),
                  }),
                  false,
                )
              }
              onDeleteMarker={(markerId) =>
                commitProjectChange((prev) => ({
                  ...prev,
                  markers: prev.markers.filter((m) => m.id !== markerId),
                }))
              }
              onCreateLowerThirdAtMarker={handleCreateLowerThirdAtMarker}
              onPushMarkersToStudio={handleRequestVoiceoverInStudio}
              onToggleTrackMute={(trackId) =>
                commitProjectChange((prev) => ({
                  ...prev,
                  tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)),
                }))
              }
              onToggleTrackHidden={(trackId) =>
                commitProjectChange((prev) => ({
                  ...prev,
                  tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, hidden: !t.hidden } : t)),
                }))
              }
              onToggleTrackLocked={(trackId) =>
                commitProjectChange((prev) => ({
                  ...prev,
                  tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, locked: !t.locked } : t)),
                }))
              }
              onAddTrack={(kind) =>
                commitProjectChange((prev) => {
                  const newTr: CinemaTrack = {
                    id: makeId("trk"),
                    name: `${kind.charAt(0).toUpperCase() + kind.slice(1)} ${prev.tracks.length + 1}`,
                    kind,
                    muted: false,
                    hidden: false,
                    locked: false,
                    volume: 1,
                  };
                  return {
                    ...prev,
                    tracks: kind === "audio" ? [...prev.tracks, newTr] : [newTr, ...prev.tracks],
                  };
                })
              }
              onSetTransition={(afterClipId, type: CinemaTransitionType, durationMs) =>
                commitProjectChange((prev) => {
                  const filtered = prev.transitions.filter((t) => t.afterClipId !== afterClipId);
                  if (type === "cut") return { ...prev, transitions: filtered };
                  return {
                    ...prev,
                    transitions: [
                      ...filtered,
                      { id: makeId("trn"), afterClipId, type, durationMs },
                    ],
                  };
                })
              }
              onExtractVideoAudio={handleExtractVideoAudio}
              onDropFiles={(files, trackId, atMs) => {
                void handleUploadFiles(files, trackId, atMs);
              }}
              onFitZoom={() => setTimelineZoom(1)}
            />
          ) : null}
        </div>

        {/* Right Docked Apple HIG Inspector (Desktop >= xl) */}
        {!stageExpanded && inspectorOpen ? (
          <aside
            aria-label="Cinema inspector"
            className="cinema-panel-surface hidden w-[292px] shrink-0 border-l border-border/75 xl:flex xl:flex-col"
          >
            <CinemaInspectorContent
              tab={inspectorTab}
              onChangeTab={setInspectorTab}
              project={project}
              selectedClip={selectedClip}
              onSelectClip={setSelectedClipId}
              onUpdateClip={handleUpdateClip}
              onReorderClip={handleReorderLayer}
              onDeleteClip={handleDeleteClip}
              onSeek={handleSeek}
              onUpdateMarker={(markerId, label) =>
                commitProjectChange(
                  (prev) => ({
                    ...prev,
                    markers: prev.markers.map((m) => (m.id === markerId ? { ...m, label } : m)),
                  }),
                  false,
                )
              }
              onDeleteMarker={(markerId) =>
                commitProjectChange((prev) => ({
                  ...prev,
                  markers: prev.markers.filter((m) => m.id !== markerId),
                }))
              }
              onCreateLowerThirdAtMarker={handleCreateLowerThirdAtMarker}
              onPushMarkersToStudio={handleRequestVoiceoverInStudio}
              onResyncStudioAudio={handleResyncStudioAudio}
              onExtractVideoAudio={handleExtractVideoAudio}
              onClose={() => setInspectorOpen(false)}
            />
          </aside>
        ) : null}
      </div>

      {/* Tablet / Mobile Inspector Fallback (< xl) */}
      <Sheet open={mobileInspectorOpen} onOpenChange={setMobileInspectorOpen}>
        <SheetContent side="right" className="flex w-[320px] flex-col p-0 sm:max-w-[360px]">
          <SheetHeader className="sr-only">
            <SheetTitle>Cinema Inspector</SheetTitle>
          </SheetHeader>
          <CinemaInspectorContent
            tab={inspectorTab}
            onChangeTab={setInspectorTab}
            project={project}
            selectedClip={selectedClip}
            onSelectClip={setSelectedClipId}
            onUpdateClip={handleUpdateClip}
            onReorderClip={handleReorderLayer}
            onDeleteClip={handleDeleteClip}
            onSeek={handleSeek}
            onUpdateMarker={(markerId, label) =>
              commitProjectChange(
                (prev) => ({
                  ...prev,
                  markers: prev.markers.map((m) => (m.id === markerId ? { ...m, label } : m)),
                }),
                false,
              )
            }
            onDeleteMarker={(markerId) =>
              commitProjectChange((prev) => ({
                ...prev,
                markers: prev.markers.filter((m) => m.id !== markerId),
              }))
            }
            onCreateLowerThirdAtMarker={handleCreateLowerThirdAtMarker}
            onPushMarkersToStudio={handleRequestVoiceoverInStudio}
            onResyncStudioAudio={handleResyncStudioAudio}
            onExtractVideoAudio={handleExtractVideoAudio}
          />
        </SheetContent>
      </Sheet>

      {/* Saved Cinema Projects & Folders Drawer */}
      <Sheet open={projectsDrawerOpen} onOpenChange={setProjectsDrawerOpen}>
        <SheetContent side="left" className="w-[304px] p-0 sm:max-w-[340px]">
          <SheetHeader className="border-b border-border/60 px-4 py-3">
            <SheetTitle className="flex items-center gap-2 text-[14px] font-medium">
              <Layers className="size-4 text-[color:var(--cinema-select)]" />
              <span>Projects · {activeFolderName}</span>
            </SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-border/60 p-3">
              <Select
                value={activeCollectionId}
                onValueChange={(val) => {
                  if (!val) return;
                  setActiveCollectionId(val);
                  void listCinemaProjects(databaseConfigured, val).then(setSummaries);
                }}
              >
                <SelectTrigger className="h-8 text-[12px]">
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
                aria-label="New Cinema folder"
                className="size-8 shrink-0"
              >
                <FolderPlus className="size-3.5" />
              </Button>
            </div>

            {newFolderOpen ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const clean = newFolderName.trim();
                  if (!clean) return;
                  void createCinemaCollection(databaseConfigured, clean).then((created) => {
                    setCollections((p) => [created, ...p]);
                    setActiveCollectionId(created.id);
                    setSummaries([]);
                    setNewFolderName("");
                    setNewFolderOpen(false);
                  });
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
                Saved cuts ({summaries.length})
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  const fresh = buildTemplateProject("blank", activeCollectionId || "local-cinema-projects");
                  setProject(fresh);
                  setPlayheadMs(0);
                  setSelectedClipId(null);
                  setProjectsDrawerOpen(false);
                }}
                className="h-7 gap-1 px-2 text-[11.5px]"
              >
                <Plus className="size-3" />
                <span>New cut</span>
              </Button>
            </div>

            <ScrollArea className="min-h-0 flex-1 px-2 pb-3">
              <div className="space-y-1.5">
                {summaries.map((item) => {
                  const selected = item.id === project.id;
                  return (
                    <div
                      key={item.id}
                      className={`group flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 transition-colors ${
                        selected
                          ? "border-[color:var(--cinema-select)]/60 bg-[color:var(--cinema-select-soft)]"
                          : "border-transparent hover:border-border/70 hover:bg-muted/35"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={async () => {
                          const loaded = await getCinemaProject(databaseConfigured, item.id);
                          if (loaded) {
                            setProject(loaded);
                            setPlayheadMs(0);
                            setSelectedClipId(null);
                            setProjectsDrawerOpen(false);
                          }
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="truncate text-[12.5px] font-medium text-foreground">
                          {item.title}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 font-mono text-[10.5px] text-muted-foreground tabular-nums">
                          <span>{item.aspectRatio}</span>
                          <span>·</span>
                          <span>{(item.durationMs / 1000).toFixed(1)}s</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void deleteCinemaProject(databaseConfigured, item.id).then(async () => {
                            setSummaries(await listCinemaProjects(databaseConfigured, activeCollectionId));
                          })
                        }
                        aria-label={`Delete ${item.title}`}
                        className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>

      <CinemaExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        project={project}
        playheadMs={playheadMs}
        theme={theme}
        mediaElementsRef={mediaElementsRef}
        audioBuffersRef={audioBuffersRef}
        onSendMasterWavToStudio={handleSendMasterWavToStudio}
      />

      <CinemaCaptureModal
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        theme={theme}
        onCaptured={handleCapturedMedia}
      />
    </section>
  );
}
