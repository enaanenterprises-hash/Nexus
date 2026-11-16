"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowLeft,
  Bookmark,
  Download,
  FolderOpen,
  FolderPlus,
  Headphones,
  Loader2,
  Metronome,
  Plus,
  Radio,
  Save,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { STUDIO_NODE_ID } from "@/extensions/studio/node";
import type { ExtensionHubSnapshot, ExtensionId } from "@/lib/extensions";
import {
  createStudioCollection,
  deleteStudioRecording,
  fetchStudioStatus,
  getStudioRecording,
  listStudioCollections,
  listStudioRecordings,
  saveStudioRecording,
} from "@/lib/studio/studio-client";
import { loadAudioBlob } from "@/lib/studio/audio-db";
import type {
  StudioCollection,
  StudioMarkerKind,
  StudioMarkerV1,
  StudioRecording,
  StudioRecordingSummary,
  StudioTrackRole,
  StudioTrackV1,
} from "@/lib/studio/types";
import { useTheme } from "@/lib/theme";
import { ReactiveRecordBar } from "./ReactiveRecordBar";
import { StudioRoutingSheet } from "./StudioRoutingSheet";
import { TimelineWaveform } from "./TimelineWaveform";
import { useStudioAudio } from "./use-studio-audio";

const TRACK_ROLE_LABELS: Record<StudioTrackRole, string> = {
  voice: "Role: Voice",
  overdub: "Role: Overdub",
  instrumental: "Role: Layer",
  scratch: "Role: Scratch",
};

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

function fmtDuration(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const mins = Math.floor(safe / 60_000);
  const secs = Math.floor((safe % 60_000) / 1000);
  return `${mins}:${String(secs).padStart(2, "0")}`;
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
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [captureRole, setCaptureRole] = useState<StudioTrackRole>("voice");
  const [markerKind, setMarkerKind] = useState<StudioMarkerKind>("chapter");

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [mobileTakesOpen, setMobileTakesOpen] = useState(false);
  const [routingOpen, setRoutingOpen] = useState(false);
  const [savedProjectSnapshot, setSavedProjectSnapshot] = useState<StudioRecording | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerTimerRef = useRef<number | undefined>(undefined);

  const showNotice = useCallback((msg: string) => {
    setStatusBanner(msg);
    window.clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = window.setTimeout(() => setStatusBanner(null), 5000);
  }, []);

  useEffect(() => () => window.clearTimeout(bannerTimerRef.current), []);

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

  const handleTrackCaptured = useCallback(
    (track: StudioTrackV1) => {
      const nextTracks = [...tracks, track];
      setTracks(nextTracks);
      setSelectedTrackId(track.id);
      void persistDraft(nextTracks, markers);
      showNotice(`Captured ${track.name} (${fmtDuration(track.durationMs)}).`);
    },
    [markers, persistDraft, showNotice, tracks],
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

  // Load collections & sessions asynchronously on mount
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
          if (full && alive) {
            setActiveId(full.id);
            setTitle(full.title);
            setDescription(full.description ?? "");
            setBpm(full.bpm);
            setCountInBars(full.countInBars);
            setMasterGain(full.masterGain);
            setTracks(full.tracks);
            setMarkers(full.markers);
            setTags(full.tags);
            setSelectedTrackId(full.tracks[0]?.id ?? null);
            setSavedProjectSnapshot(full);
          }
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
    setActiveId(full.id);
    setTitle(full.title);
    setDescription(full.description ?? "");
    setBpm(full.bpm);
    setCountInBars(full.countInBars);
    setMasterGain(full.masterGain);
    setTracks(full.tracks);
    setMarkers(full.markers);
    setTags(full.tags);
    setSelectedTrackId(full.tracks[0]?.id ?? null);
    setSavedProjectSnapshot(full);
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
    setSelectedTrackId(null);
    setSavedProjectSnapshot(null);
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

  async function handleRemoveTrack(track: StudioTrackV1) {
    const nextTracks = tracks.filter((t) => t.id !== track.id);
    setTracks(nextTracks);
    if (selectedTrackId === track.id) setSelectedTrackId(nextTracks[0]?.id ?? null);
    await audio.removeCachedTrackAudio(track);
    if (activeId) void persistDraft(nextTracks, markers);
  }

  async function handleImportStem(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const tr = await audio.importAudioFile(file);
    if (!tr) return;
    const nextTracks = [...tracks, tr];
    setTracks(nextTracks);
    setSelectedTrackId(tr.id);
    await persistDraft(nextTracks, markers);
    showNotice(`Imported ${tr.name}.`);
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
  }, [activeId, audio.playheadMs, audio.telemetryRef, audio.transport, markerKind, markers, persistDraft, showNotice, tracks]);

  async function handleExportMix() {
    setExporting(true);
    try {
      const res = await audio.exportMixWav();
      if (res) {
        triggerDownload(res.blob, res.filename);
        showNotice("Rendered mixed multi-track WAV.");
      }
    } finally {
      setExporting(false);
    }
  }

  async function handleDownloadRawTrack(track: StudioTrackV1) {
    const blob = await loadAudioBlob(track.audioRef.idbKey);
    if (!blob) {
      showNotice("Audio blob is not in local storage.");
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

  // Keyboard transport shortcuts: Space (Play/Pause), R (Record/Stop), M (Marker)
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
      } else if ((e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (audio.transport === "recording" || audio.transport === "paused" || audio.transport === "counting-in") {
          audio.stopRecording();
        } else {
          void audio.startRecording(captureRole);
        }
      } else if ((e.key === "m" || e.key === "M") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        dropMarkerAtPlayhead();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [audio, captureRole, dropMarkerAtPlayhead]);

  function renderLibraryContents(closeSheet?: () => void) {
    return (
      <>
        <div className="flex items-center justify-between gap-2 border-b border-border/60 p-3">
          <Select
            value={activeCollectionId}
            onValueChange={(val) => {
              if (val) void selectCollection(val);
            }}
          >
            <SelectTrigger aria-label="Studio folder" className="h-8 text-[12px]">
              <SelectValue>
                {collections.find((c) => c.id === activeCollectionId)?.name ?? "Folder"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {collections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tooltip>
            <TooltipTrigger
              render={
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
              }
            />
            <TooltipContent side="bottom">New studio folder</TooltipContent>
          </Tooltip>
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
              closeSheet?.();
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
                        closeSheet?.();
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-[12.5px] font-medium text-foreground">
                        {item.title}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 font-mono text-[10.5px] text-muted-foreground tabular-nums">
                        <span>{fmtDuration(item.durationMs)}</span>
                        <span>·</span>
                        <span>
                          {item.trackCount} {item.trackCount === 1 ? "layer" : "layers"}
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
      </>
    );
  }

  return (
    <section
      aria-label="Nexus Recording Studio"
      className="studio-screen flex h-full w-full flex-col overflow-hidden"
    >
      {/* Studio Top Chrome Bar */}
      <header className="studio-header flex flex-wrap items-center justify-between gap-3 border-b border-border/80 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={onClose}
                  aria-label="Back to Network"
                  className="rounded-full"
                >
                  <ArrowLeft className="size-4" />
                </Button>
              }
            />
            <TooltipContent side="bottom">Back to Nexus network</TooltipContent>
          </Tooltip>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#fc3a34]/40 bg-[#fc3a34]/12 text-[10px] font-semibold text-[#fc3a34]">
                St
              </span>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  if (tracks.length > 0 || activeId) void persistDraft(tracks, markers);
                }}
                aria-label="Recording project title"
                className="h-7 w-[190px] border-0 bg-transparent px-1 font-[family-name:var(--font-display)] text-[1.3rem] font-normal shadow-none focus-visible:ring-1 sm:w-[270px]"
              />
              <Badge variant="outline" className="hidden text-[10.5px] font-normal sm:inline-flex">
                {databaseConfigured ? "Synced + IDB Audio" : "Local Studio IDB"}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setMobileTakesOpen(true)}
            className="h-8 gap-1.5 rounded-full text-[12px] md:hidden"
          >
            <FolderOpen className="size-3.5" />
            <span>Takes ({summaries.length})</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void persistDraft(tracks, markers)}
            disabled={saving || tracks.length === 0}
            className="h-8 gap-1.5 rounded-full text-[12px]"
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
            className="h-8 gap-1.5 rounded-full text-[12px]"
          >
            {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            <span>Export WAV</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => void openRouting()}
            className="h-8 gap-1.5 rounded-full bg-[color:var(--land-gold)] text-[#09090b] hover:opacity-90"
          >
            <Zap className="size-3.5" />
            <span>Send → Node</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onReleaseNode}
            className="h-8 rounded-full text-[12px] text-muted-foreground hover:text-foreground"
          >
            Disconnect
          </Button>
        </div>
      </header>

      {/* Main Split Workspace */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Session Library */}
        <aside className="hidden w-[252px] shrink-0 flex-col border-r border-border/80 bg-card/30 md:flex">
          {renderLibraryContents()}
        </aside>

        {/* Center Acoustic Console & Multi-Track Canvas */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto flex max-w-[1160px] flex-col gap-5 p-4 sm:p-6">
              {/* Mic, Metronome & Routing Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card/45 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="w-[185px]">
                    <Select
                      value={audio.selectedDeviceId}
                      onValueChange={(v) => {
                        if (v) audio.setSelectedDeviceId(v);
                      }}
                    >
                      <SelectTrigger aria-label="Microphone input" className="h-8 text-[12px]">
                        <SelectValue>
                          {audio.selectedDeviceId === "default"
                            ? "Default microphone"
                            : (audio.devices.find((d) => d.deviceId === audio.selectedDeviceId)?.label ??
                              "Default microphone")}
                        </SelectValue>
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

                  <Select
                    value={captureRole}
                    onValueChange={(v) => {
                      if (v) setCaptureRole(v as StudioTrackRole);
                    }}
                  >
                    <SelectTrigger aria-label="Next track role" className="h-8 w-[136px] text-[12px]">
                      <SelectValue>{TRACK_ROLE_LABELS[captureRole]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(TRACK_ROLE_LABELS) as [StudioTrackRole, string][]).map(([val, label]) => (
                        <SelectItem key={val} value={val}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    size="sm"
                    variant={audio.monitorInput ? "secondary" : "outline"}
                    onClick={() => audio.setMonitorInput(!audio.monitorInput)}
                    className="h-8 gap-1.5 rounded-full text-[12px]"
                  >
                    <Headphones className="size-3.5" />
                    <span>Monitor</span>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant={audio.studioRawMic ? "secondary" : "outline"}
                    onClick={() => audio.setStudioRawMic(!audio.studioRawMic)}
                    className="h-8 gap-1.5 rounded-full text-[12px]"
                  >
                    <Radio className="size-3.5" />
                    <span>{audio.studioRawMic ? "Raw Mic" : "Voice Clean"}</span>
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-1.5 rounded-full border border-border/80 bg-background/60 px-2.5 py-1 text-[11.5px]">
                    <span className="text-muted-foreground">BPM</span>
                    <input
                      type="number"
                      min={40}
                      max={240}
                      value={bpm}
                      onChange={(e) => setBpm(Math.max(40, Math.min(240, Number(e.target.value) || 120)))}
                      aria-label="Tempo BPM"
                      className="w-11 bg-transparent text-right font-mono font-semibold text-foreground focus:outline-none"
                    />
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant={metronomeEnabled ? "secondary" : "outline"}
                    onClick={() => setMetronomeEnabled((v) => !v)}
                    className="h-8 gap-1.5 rounded-full text-[12px]"
                  >
                    <Metronome className="size-3.5" />
                    <span>Click</span>
                  </Button>

                  <Select
                    value={String(countInBars)}
                    onValueChange={(v) => {
                      if (v !== null) setCountInBars(Number(v));
                    }}
                  >
                    <SelectTrigger aria-label="Count-in bars" className="h-8 min-w-[132px] text-[12px]">
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
                    className="h-8 rounded-full text-[12px]"
                  >
                    Overdub {audio.overdubEnabled ? "On" : "Off"}
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
                    className="h-8 gap-1.5 rounded-full text-[12px]"
                  >
                    <Upload className="size-3.5" />
                    <span>Import audio</span>
                  </Button>
                </div>
              </div>

              {audio.micError ? (
                <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-[13px] text-destructive">
                  {audio.micError}
                </div>
              ) : null}

              {statusBanner ? (
                <div role="status" className="rounded-xl border border-border/80 bg-muted/40 px-4 py-2 text-[12.5px] text-foreground">
                  {statusBanner}
                </div>
              ) : null}

              {/* SIGNATURE CRIMSON REACTIVE VOICE RECORDING BAR */}
              <ReactiveRecordBar
                transport={audio.transport}
                micReady={audio.micReady}
                playheadMs={audio.playheadMs}
                countInBeat={audio.countInBeat}
                theme={theme}
                sampleTelemetry={audio.sampleTelemetry}
                onArmMic={() => void audio.armMicrophone()}
                onStartRecord={() => void audio.startRecording(captureRole)}
                onPauseRecord={audio.pauseRecording}
                onResumeRecord={audio.resumeRecording}
                onStopRecord={audio.stopRecording}
                onPlay={() => void audio.play()}
                onPausePlay={audio.pausePlayback}
                onDropMarker={dropMarkerAtPlayhead}
              />

              {/* Multi-Track Timeline Canvas */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Multi-track timeline · {tracks.length} {tracks.length === 1 ? "layer" : "layers"}
                    </h3>
                    <span className="font-mono text-[11.5px] text-muted-foreground tabular-nums">
                      Total {fmtDuration(totalTimelineMs)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                      <span>Mic Gain</span>
                      <input
                        type="range"
                        min={0.5}
                        max={2}
                        step={0.05}
                        value={audio.inputGain}
                        onChange={(e) => audio.setInputGain(Number(e.target.value))}
                        className="studio-range w-20"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                      <span>Master</span>
                      <input
                        type="range"
                        min={0}
                        max={1.5}
                        step={0.05}
                        value={masterGain}
                        onChange={(e) => setMasterGain(Number(e.target.value))}
                        className="studio-range w-24"
                      />
                      <span className="w-9 text-right font-mono text-[11px] tabular-nums">
                        {Math.round(masterGain * 100)}%
                      </span>
                    </label>
                  </div>
                </div>

                <TimelineWaveform
                  tracks={tracks}
                  markers={markers}
                  playheadMs={audio.playheadMs}
                  totalTimelineMs={totalTimelineMs}
                  bpm={bpm}
                  selectedTrackId={selectedTrackId}
                  theme={theme}
                  onSelectTrack={(id) => setSelectedTrackId(id)}
                  onSeek={audio.seek}
                  onSelectMarker={(m) => showNotice(`${m.label} (${fmtDuration(m.atMs)})`)}
                />
              </div>

              {/* Per-Track Mixer Strips */}
              {tracks.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Layer Mixer &amp; Timing
                  </p>
                  <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                    {tracks.map((tr) => {
                      const selected = tr.id === selectedTrackId;
                      return (
                        <div
                          key={tr.id}
                          onClick={() => setSelectedTrackId(tr.id)}
                          className={`flex flex-col gap-2.5 rounded-2xl border p-3.5 transition-colors ${
                            selected
                              ? "border-[color:var(--land-gold)]/55 bg-card/85"
                              : "border-border/80 bg-card/45"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <Input
                                value={tr.name}
                                onChange={(e) =>
                                  updateTrack(tr.id, (prev) => ({ ...prev, name: e.target.value }))
                                }
                                aria-label={`Track name for ${tr.name}`}
                                className="h-7 w-[150px] border-0 bg-transparent px-1 text-[13px] font-medium shadow-none focus-visible:ring-1"
                              />
                              <Badge variant="outline" className="text-[10px] font-normal capitalize">
                                {tr.role}
                              </Badge>
                              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                                {fmtDuration(tr.durationMs)}
                              </span>
                            </div>

                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant={tr.muted ? "destructive" : "outline"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateTrack(tr.id, (prev) => ({ ...prev, muted: !prev.muted }));
                                }}
                                aria-label={tr.muted ? "Unmute track" : "Mute track"}
                                className="h-7 w-7 p-0 text-[11px]"
                              >
                                {tr.muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={tr.solo ? "secondary" : "outline"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateTrack(tr.id, (prev) => ({ ...prev, solo: !prev.solo }));
                                }}
                                aria-label={tr.solo ? "Unsolo track" : "Solo track"}
                                className="h-7 px-2 font-mono text-[11px] font-semibold"
                              >
                                S
                              </Button>
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDownloadRawTrack(tr);
                                }}
                                aria-label={`Download ${tr.name}`}
                                className="h-7 w-7"
                              >
                                <Download className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleRemoveTrack(tr);
                                }}
                                aria-label={`Delete ${tr.name}`}
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-[11.5px] text-muted-foreground">
                            <label className="flex items-center gap-2">
                              <span>Gain</span>
                              <input
                                type="range"
                                min={0}
                                max={1.8}
                                step={0.05}
                                value={tr.gain}
                                onChange={(e) =>
                                  updateTrack(tr.id, (prev) => ({ ...prev, gain: Number(e.target.value) }))
                                }
                                className="studio-range w-24"
                              />
                            </label>
                            <label className="flex items-center gap-2">
                              <span>Pan</span>
                              <input
                                type="range"
                                min={-1}
                                max={1}
                                step={0.1}
                                value={tr.pan}
                                onChange={(e) =>
                                  updateTrack(tr.id, (prev) => ({ ...prev, pan: Number(e.target.value) }))
                                }
                                className="studio-range w-20"
                              />
                            </label>
                            <div className="flex items-center gap-1 font-mono text-[11px] tabular-nums">
                              <span>Start {(tr.offsetMs / 1000).toFixed(1)}s</span>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateTrack(tr.id, (prev) => ({
                                    ...prev,
                                    offsetMs: Math.max(0, prev.offsetMs - 100),
                                  }));
                                }}
                                className="h-6 px-1.5 text-[10.5px]"
                              >
                                -100ms
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateTrack(tr.id, (prev) => ({
                                    ...prev,
                                    offsetMs: prev.offsetMs + 100,
                                  }));
                                }}
                                className="h-6 px-1.5 text-[10.5px]"
                              >
                                +100ms
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <Separator />

              {/* Timeline Markers & Session Notes (AI & Downstream Study / Video Ready) */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
                <div className="space-y-2.5 rounded-2xl border border-border/80 bg-card/45 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Bookmark className="size-3.5 text-[color:var(--land-gold)]" />
                      <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Timeline markers ({markers.length})
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Select
                        value={markerKind}
                        onValueChange={(v) => {
                          if (v) setMarkerKind(v as StudioMarkerKind);
                        }}
                      >
                        <SelectTrigger aria-label="Marker type" className="h-7 w-[114px] text-[11.5px]">
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
                      Press <kbd className="rounded border border-border px-1 font-mono text-[10.5px]">M</kbd> while
                      recording or playing to drop chapters for Study Space or cut cues for Video Studio.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {markers.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-1.5 rounded-full border border-border/80 bg-background/70 px-2.5 py-1 text-[12px]"
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
                              setMarkers((prev) =>
                                prev.map((x) => (x.id === m.id ? { ...x, label: e.target.value } : x)),
                              )
                            }
                            aria-label="Marker label"
                            className="w-28 bg-transparent text-[12px] text-foreground focus:outline-none"
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

                <div className="space-y-2 rounded-2xl border border-border/80 bg-card/45 p-4">
                  <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Session context &amp; notes
                  </h3>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Capture studio notes, lyrics, lecture topic, or visual cues before pushing to Video Studio or Study Space…"
                    rows={3}
                    className="w-full resize-none rounded-xl border border-border/80 bg-background/60 px-3 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-[color:var(--land-gold)]"
                  />
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>

      <Sheet open={mobileTakesOpen} onOpenChange={setMobileTakesOpen}>
        <SheetContent side="left" className="w-[290px] p-0 sm:max-w-[320px]">
          <SheetHeader className="border-b border-border/60 px-4 py-3">
            <SheetTitle className="text-[14px]">Studio Takes</SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col">
            {renderLibraryContents(() => setMobileTakesOpen(false))}
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
