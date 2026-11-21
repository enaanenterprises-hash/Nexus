"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  Loader2,
  Mic,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  Save,
  Trash2,
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
} from "@/lib/cinema/media-db";
import {
  ASPECT_RATIO_PRESETS,
  DEFAULT_FILTER,
  DEFAULT_TRANSFORM,
  ELEMENT_PRESETS,
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
  CinemaTrack,
  CinemaTrackKind,
  CinemaTransform,
  CinemaTransitionType,
  StockMediaItem,
} from "@/lib/cinema/types";
import type { ExtensionHubSnapshot, ExtensionId } from "@/lib/extensions";
import { saveAudioBlob } from "@/lib/studio/audio-db";
import type { StudioRecording, StudioRecordingContentV1 } from "@/lib/studio/types";
import { computePeaksFromBuffer } from "@/lib/studio/wav";
import { useTheme } from "@/lib/theme";
import { CinemaCaptureModal } from "./CinemaCaptureModal";
import { CinemaExportDialog } from "./CinemaExportDialog";
import { CinemaInspectorContent, type CinemaInspectorTab } from "./CinemaInspector";
import { CinemaSidebar, type CinemaSidebarTab } from "./CinemaSidebar";
import { CinemaStage } from "./CinemaStage";
import { CinemaTimeline, type CinemaTimelineTool } from "./CinemaTimeline";

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
    buildTemplateProject("podcast-audiogram", "local-cinema-projects"),
  );
  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

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
  const [toolMode, setToolMode] = useState<CinemaTimelineTool>("select");
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  // Panels & Modals
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<CinemaSidebarTab>("studio");
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
  const audioEngineRef = useRef<CinemaAudioEngine | null>(null);
  const mediaElementsRef = useRef<Map<string, HTMLVideoElement | HTMLImageElement>>(new Map());
  const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const hydratingRef = useRef<Set<string>>(new Set());
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const noticeTimerRef = useRef<number | undefined>(undefined);
  const autosaveTimerRef = useRef<number | undefined>(undefined);
  const handledSerialRef = useRef<number>(0);

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
          setProject(buildTemplateProject("podcast-audiogram", colId));
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
            await new Promise<void>((resolve) => {
              const timer = window.setTimeout(resolve, 4000);
              vid.onloadeddata = () => {
                window.clearTimeout(timer);
                resolve();
              };
              vid.onerror = () => {
                window.clearTimeout(timer);
                resolve();
              };
            });
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

  const seekAllVideosAt = useCallback((ms: number) => {
    for (const clip of projectRef.current.clips) {
      if (clip.kind !== "video" || clip.hidden) continue;
      const vid = mediaElementsRef.current.get(clip.assetId);
      if (!(vid instanceof HTMLVideoElement)) continue;
      if (ms >= clip.startMs && ms <= clip.startMs + clip.durationMs) {
        const targetSec = Math.max(0, (clip.trimStartMs + (ms - clip.startMs) * (clip.speed || 1)) / 1000);
        if (Math.abs(vid.currentTime - targetSec) > 0.04) {
          vid.currentTime = targetSec;
        }
      }
    }
  }, []);

  const handleSeek = useCallback(
    (nextMs: number) => {
      const dur = computeProjectDurationMs(projectRef.current);
      const clamped = Math.max(0, Math.min(dur, Math.round(nextMs)));
      setPlayheadMs(clamped);
      seekAllVideosAt(clamped);
      if (playing) {
        audioEngineRef.current?.play(projectRef.current, clamped, audioBuffersRef.current);
      }
    },
    [playing, seekAllVideosAt],
  );

  // Playback loop
  useEffect(() => {
    if (!playing) {
      audioEngineRef.current?.stop();
      return;
    }

    const startWall = performance.now();
    const startOriginMs = playheadRef.current;
    audioEngineRef.current?.play(projectRef.current, startOriginMs, audioBuffersRef.current);

    let rafId = 0;
    const tick = (now: number) => {
      const dur = computeProjectDurationMs(projectRef.current);
      const next = startOriginMs + (now - startWall);
      if (next >= dur) {
        if (loopEnabled) {
          setPlaying(false);
          setPlayheadMs(0);
          seekAllVideosAt(0);
          window.setTimeout(() => setPlaying(true), 20);
        } else {
          setPlaying(false);
          setPlayheadMs(dur);
          audioEngineRef.current?.stop();
        }
        return;
      }
      setPlayheadMs(next);
      seekAllVideosAt(next);
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
      audioEngineRef.current?.stop();
    };
  }, [loopEnabled, playing, seekAllVideosAt]);

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

  // Auto-handle routed Recording Studio envelopes pushed across the Nexus Bus
  useEffect(() => {
    if (!incomingStudioTake || incomingStudioTake.serial === handledSerialRef.current) return;
    handledSerialRef.current = incomingStudioTake.serial;
    const recording = studioEnvelopeToRecording(incomingStudioTake.envelope);
    void handleImportStudioRecording(recording, incomingStudioTake.mode ?? "mix");
  }, [handleImportStudioRecording, incomingStudioTake]);

  const handleExtractVideoAudio = useCallback(
    async (clipId: string) => {
      const clip = projectRef.current.clips.find((c) => c.id === clipId);
      if (!clip || clip.kind !== "video") return;
      const asset = projectRef.current.assets.find((a) => a.id === clip.assetId);
      if (!asset) return;

      showNotice(`Extracting soundtrack from “${clip.name}” for Recording Studio…`);
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
      } else if (e.key === "v" || e.key === "V") {
        e.preventDefault();
        setToolMode("select");
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        setToolMode("cut");
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
      {/* Apple Liquid Glass Header (pl-[92px] clears top-left Nexus Orb button) */}
      <header className="cinema-header flex shrink-0 items-center justify-between gap-2 py-2 pl-[92px] pr-4 sm:pr-5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open Cinema tool drawer"
            className="size-8 rounded-full lg:hidden"
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
            className="h-8 w-full max-w-[160px] min-w-0 border-0 bg-transparent px-1.5 text-[14px] font-medium tracking-[-0.01em] text-foreground shadow-none focus-visible:ring-1 sm:max-w-[210px]"
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
                  className="size-7 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
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
              className="size-7 rounded-full"
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
              className="size-7 rounded-full"
            >
              <Redo2 className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Center: Recording Studio Creative Suite Bridge Pill */}
        <div className="hidden items-center gap-2 md:flex">
          <button
            type="button"
            onClick={handleRequestVoiceoverInStudio}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[color:var(--cinema-studio-link)]/40 bg-[color:var(--cinema-studio-link)]/10 px-3 text-[11.5px] font-medium text-[color:var(--cinema-studio-link)] transition-colors hover:bg-[color:var(--cinema-studio-link)]/18"
          >
            <Waves className="size-3.5" />
            <span>
              {project.hasLinkedStudioAudio ? "Synced w/ Studio · Voiceover" : "Record Voiceover in Studio"}
            </span>
          </button>
        </div>

        {/* Right: Inspector, Export, Actions, Done */}
        <div className="flex items-center gap-1.5">
          {notice ? (
            <span className="hidden max-w-[230px] truncate rounded-full border border-border/75 bg-card/75 px-2.5 py-1 text-[11px] text-foreground xl:inline">
              {notice}
            </span>
          ) : null}

          <Button
            type="button"
            size="sm"
            variant={inspectorOpen ? "secondary" : "outline"}
            onClick={() => {
              if (window.innerWidth < 1280) setMobileInspectorOpen((v) => !v);
              else setInspectorOpen((v) => !v);
            }}
            className="h-8 gap-1.5 rounded-full px-3 text-[12px]"
          >
            <PanelRight className="size-3.5" />
            <span className="hidden sm:inline">Inspector</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => setExportOpen(true)}
            className="h-8 gap-1.5 rounded-full bg-foreground px-3.5 text-[12px] font-medium text-background hover:opacity-90"
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
                  className="size-8 rounded-full text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              }
            />
            <PopoverContent align="end" className="w-60 rounded-2xl p-2">
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => void persistProject(projectRef.current).then(() => showNotice("Saved Cinema project."))}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12.5px] text-foreground hover:bg-foreground/[0.06]"
                >
                  <Save className="size-4 text-muted-foreground" />
                  <span>Save project now</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCaptureOpen(true)}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12.5px] text-foreground hover:bg-foreground/[0.06]"
                >
                  <Video className="size-4 text-muted-foreground" />
                  <span>Record Camera / Screen</span>
                </button>
                <button
                  type="button"
                  onClick={handleRequestVoiceoverInStudio}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12.5px] text-[color:var(--cinema-studio-link)] hover:bg-foreground/[0.06]"
                >
                  <Mic className="size-4" />
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
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12.5px] text-foreground hover:bg-foreground/[0.06]"
                >
                  <ImageIcon className="size-4 text-muted-foreground" />
                  <span>Save Frame Snapshot (.png)</span>
                </button>
                <Separator className="my-1" />
                <button
                  type="button"
                  onClick={onReleaseNode}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12.5px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
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
            className="h-8 rounded-full px-3 text-[12px] text-muted-foreground hover:text-foreground"
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
            mobileOpen={mobileSidebarOpen}
            onMobileOpenChange={setMobileSidebarOpen}
            project={project}
            pexelsConfigured={pexelsConfigured}
            onApplyTemplate={(tplId) => {
              const tpl = buildTemplateProject(tplId, project.collectionId || activeCollectionId, project.aspectRatio);
              setProject(tpl);
              setPlayheadMs(0);
              setSelectedClipId(tpl.clips[0]?.id ?? null);
              showNotice(`Loaded “${tpl.title}” template.`);
            }}
            onUploadFiles={handleUploadFiles}
            onAddAssetToTimeline={(asset) => addAssetToTimeline(asset)}
            onOpenCapture={() => setCaptureOpen(true)}
            onImportStudioRecording={handleImportStudioRecording}
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
            playing={playing}
            loopEnabled={loopEnabled}
            showSafeGuides={showSafeGuides}
            selectedClipId={selectedClipId}
            canvasZoom={canvasZoom}
            stageExpanded={stageExpanded}
            mediaElementsRef={mediaElementsRef}
            audioEngineRef={audioEngineRef}
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
              toolMode={toolMode}
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
              onChangeTool={setToolMode}
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
