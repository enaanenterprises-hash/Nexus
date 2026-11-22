"use client";

import { useEffect, useState, type ChangeEvent, type DragEvent } from "react";
import {
  AudioLines,
  Captions,
  Check,
  Film,
  Image as ImageIcon,
  Layers,
  Loader2,
  Mic,
  MonitorPlay,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Scissors,
  Search,
  Shapes,
  Sparkles,
  Upload,
  Video,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { searchStockMedia } from "@/lib/cinema/cinema-client";
import {
  ASPECT_RATIO_PRESETS,
  BACKDROP_PRESETS,
  CINEMA_TEMPLATES,
  ELEMENT_PRESETS,
  TEXT_PRESETS,
  type TextStylePreset,
} from "@/lib/cinema/presets";
import type {
  CinemaAspectRatio,
  CinemaAsset,
  CinemaBackground,
  CinemaProject,
  StockMediaItem,
} from "@/lib/cinema/types";
import {
  fetchStudioStatus,
  getStudioRecording,
  listStudioCollections,
  listStudioRecordings,
} from "@/lib/studio/studio-client";
import type { StudioCollection, StudioRecording, StudioRecordingSummary } from "@/lib/studio/types";

export type CinemaSidebarTab =
  | "media"
  | "templates"
  | "text"
  | "elements"
  | "stock"
  | "canvas"
  | "nodes";

const PRIMARY_TABS: Array<{ id: "media" | "text" | "elements" | "canvas"; label: string }> = [
  { id: "media", label: "Media" },
  { id: "text", label: "Text" },
  { id: "elements", label: "Visuals" },
  { id: "canvas", label: "Canvas" },
];

const TOPIC_CHIPS = ["Architecture", "Minimal", "Nature", "Studio", "City", "Light"] as const;

const ACCEPTED_MEDIA_TYPES =
  ".mp4,.mov,.webm,.m4v,.mkv,.png,.jpg,.jpeg,.webp,.gif,.wav,.mp3,.m4a,.ogg,.aac,video/mp4,video/webm,video/quicktime,video/*,image/*,audio/*";

export function CinemaSidebar({
  open,
  activeTab,
  onSelectTab,
  onToggleCollapse,
  mobileOpen,
  onMobileOpenChange,
  project,
  pexelsConfigured,
  onApplyTemplate,
  onUploadFiles,
  onAddAssetToTimeline,
  onOpenCapture,
  onImportStudioRecording,
  onSmartCutFromStudio,
  onImportBeatGridFromStudio,
  onMarkersToLowerThirds,
  onRequestVoiceoverInStudio,
  onAddStockItem,
  onAddTextPreset,
  onAddElementPreset,
  onChangeAspectRatio,
  onChangeFps,
  onChangeBackground,
  onOpenStudioView,
}: {
  open: boolean;
  activeTab: CinemaSidebarTab;
  onSelectTab: (tab: CinemaSidebarTab) => void;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  project: CinemaProject;
  pexelsConfigured: boolean;
  onApplyTemplate: (templateId: string) => void;
  onUploadFiles: (files: FileList | File[]) => Promise<void>;
  onAddAssetToTimeline: (asset: CinemaAsset) => void;
  onOpenCapture: () => void;
  onImportStudioRecording: (
    rec: StudioRecording,
    mode: "mix" | "stems" | "captions" | "markers",
  ) => Promise<void>;
  onSmartCutFromStudio: (rec: StudioRecording) => Promise<void>;
  onImportBeatGridFromStudio: (rec: StudioRecording) => Promise<void>;
  onMarkersToLowerThirds: () => void;
  onRequestVoiceoverInStudio: () => void;
  onAddStockItem: (item: StockMediaItem) => Promise<void>;
  onAddTextPreset: (preset: TextStylePreset) => void;
  onAddElementPreset: (preset: (typeof ELEMENT_PRESETS)[number]) => void;
  onChangeAspectRatio: (ratio: CinemaAspectRatio) => void;
  onChangeFps: (fps: 24 | 30 | 60) => void;
  onChangeBackground: (bg: CinemaBackground) => void;
  onOpenStudioView: () => void;
}) {
  // Recording Studio Bridge State (inside the dedicated Nexus Links panel)
  const [studioDb, setStudioDb] = useState(false);
  const [studioCols, setStudioCols] = useState<StudioCollection[]>([]);
  const [studioColId, setStudioColId] = useState("");
  const [studioRecs, setStudioRecs] = useState<StudioRecordingSummary[]>([]);
  const [loadingStudio, setLoadingStudio] = useState(false);
  const [importingRecKey, setImportingRecKey] = useState<string | null>(null);

  // Stock Pexels State
  const [stockType, setStockType] = useState<"videos" | "photos">("videos");
  const [stockQuery, setStockQuery] = useState("");
  const [stockItems, setStockItems] = useState<StockMediaItem[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockConfigOverride, setStockConfigOverride] = useState<boolean | null>(null);
  const stockServerConfigured = stockConfigOverride ?? pexelsConfigured;
  const [addingStockId, setAddingStockId] = useState<string | null>(null);
  const [dragOverMedia, setDragOverMedia] = useState(false);

  useEffect(() => {
    if (activeTab !== "nodes") return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoadingStudio(true);
      try {
        const st = await fetchStudioStatus();
        if (cancelled) return;
        setStudioDb(st.databaseConfigured);
        const cols = await listStudioCollections(st.databaseConfigured);
        if (cancelled) return;
        setStudioCols(cols);
        const cid = studioColId && cols.some((c) => c.id === studioColId) ? studioColId : cols[0]?.id ?? "";
        setStudioColId(cid);
        if (cid) {
          const list = await listStudioRecordings(st.databaseConfigured, cid);
          if (!cancelled) setStudioRecs(list);
        }
      } finally {
        if (!cancelled) setLoadingStudio(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  async function runStockSearch(q = stockQuery, t = stockType) {
    setStockLoading(true);
    try {
      const res = await searchStockMedia(q, t, 1);
      setStockConfigOverride(res.configured);
      setStockItems(res.items);
    } catch {
      setStockItems([]);
    } finally {
      setStockLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "stock" || !stockServerConfigured || stockItems.length > 0) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setStockLoading(true);
      try {
        const res = await searchStockMedia("", stockType, 1);
        if (cancelled) return;
        setStockConfigOverride(res.configured);
        setStockItems(res.items);
      } catch {
        if (!cancelled) setStockItems([]);
      } finally {
        if (!cancelled) setStockLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, stockServerConfigured]);

  async function triggerStudioAction(
    summary: StudioRecordingSummary,
    action: "mix" | "stems" | "captions" | "markers" | "smart-cut" | "beat-grid",
  ) {
    setImportingRecKey(`${summary.id}-${action}`);
    try {
      const full = await getStudioRecording(studioDb, summary.id);
      if (!full) return;
      if (action === "smart-cut") {
        await onSmartCutFromStudio(full);
      } else if (action === "beat-grid") {
        await onImportBeatGridFromStudio(full);
      } else {
        await onImportStudioRecording(full, action);
      }
    } finally {
      setImportingRecKey(null);
    }
  }

  async function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const copy = Array.from(files);
    e.target.value = "";
    await onUploadFiles(copy);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOverMedia(false);
    if (e.dataTransfer.files?.length) {
      void onUploadFiles(e.dataTransfer.files);
    }
  }

  const isMediaGroup = activeTab === "media" || activeTab === "nodes" || activeTab === "stock";
  const isElementsGroup = activeTab === "elements" || activeTab === "templates";
  const primaryActive = isMediaGroup
    ? "media"
    : isElementsGroup
      ? "elements"
      : activeTab === "text"
        ? "text"
        : "canvas";

  const drawerBody = (
    <div
      onDragOver={(e) => {
        if (activeTab === "media" && e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragOverMedia(true);
        }
      }}
      onDragLeave={() => {
        if (dragOverMedia) setDragOverMedia(false);
      }}
      onDrop={(e) => {
        if (activeTab === "media") handleDrop(e);
      }}
      className="cinema-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 py-3"
    >
      {isMediaGroup ? (
        <div className="mb-3 flex items-center justify-between border-b border-white/[0.07] pb-2">
          <div className="flex items-center gap-3" role="tablist" aria-label="Media source">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "media"}
              onClick={() => onSelectTab("media")}
              className={`text-[12px] font-medium transition-colors ${
                activeTab === "media"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Project
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "nodes"}
              onClick={() => onSelectTab("nodes")}
              className={`inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors ${
                activeTab === "nodes"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="size-1.5 shrink-0 rounded-full bg-[color:var(--nexus-link)]" aria-hidden />
              <span>Studio</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "stock"}
              onClick={() => onSelectTab("stock")}
              className={`text-[12px] font-medium transition-colors ${
                activeTab === "stock"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Stock
            </button>
          </div>
          {activeTab === "media" && project.assets.length > 0 ? (
            <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
              {project.assets.length}
            </span>
          ) : null}
        </div>
      ) : null}

      {activeTab === "media" ? (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <label className="inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 text-[12px] font-medium text-background transition-opacity hover:opacity-90">
              <Plus className="size-3.5" strokeWidth={1.75} />
              <span>Import</span>
              <input
                type="file"
                accept={ACCEPTED_MEDIA_TYPES}
                multiple
                onChange={(e) => void handleFileInput(e)}
                className="hidden"
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenCapture}
              className="h-8 gap-1.5 rounded-lg px-2.5 text-[12px]"
            >
              <Video className="size-3.5" strokeWidth={1.6} />
              <span>Record</span>
            </Button>
          </div>

          {dragOverMedia || project.assets.length === 0 ? (
            <div
              className={`rounded-xl border border-dashed px-3 py-6 text-center transition-colors ${
                dragOverMedia
                  ? "border-[color:var(--cinema-playhead)] bg-[color:var(--studio-accent-soft)]"
                  : "border-white/10 bg-[#0b0b10]"
              }`}
            >
              <Upload className="mx-auto size-4 text-muted-foreground" strokeWidth={1.6} />
              <p className="mt-2 text-[12px] font-medium text-foreground">
                Drop MP4, MOV, WebM, images, or WAV
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Or click Import above to add media
              </p>
            </div>
          ) : null}

          {project.assets.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {project.assets.map((asset) => {
                const isStudioAsset = asset.source === "studio" || Boolean(asset.studioRef);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => onAddAssetToTimeline(asset)}
                    className="group overflow-hidden rounded-lg border border-white/[0.08] bg-[#0c0c12] text-left transition-colors hover:border-white/30"
                  >
                    <div className="relative aspect-video w-full overflow-hidden bg-[#050508]">
                      {asset.thumbnails[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={asset.thumbnails[0]}
                          alt={asset.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          {asset.kind === "audio" ? (
                            <AudioLines
                              className={`size-4 ${
                                isStudioAsset
                                  ? "text-[color:var(--nexus-link)]"
                                  : "text-muted-foreground"
                              }`}
                            />
                          ) : (
                            <ImageIcon className="size-4 text-muted-foreground" />
                          )}
                        </div>
                      )}
                      {isStudioAsset ? (
                        <span
                          title="Synced via Nexus Link"
                          className="absolute top-1.5 left-1.5 size-1.5 rounded-full bg-[color:var(--nexus-link)]"
                        />
                      ) : null}
                      <span className="absolute right-1 bottom-1 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[9.5px] text-white tabular-nums">
                        {(asset.durationMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <div className="truncate px-2 py-1.5 text-[11.5px] font-medium text-foreground">
                      {asset.name}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === "text" ? (
        <div className="space-y-1.5">
          {TEXT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onAddTextPreset(preset)}
              className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-white/[0.08] bg-[#0c0c12] px-3 py-2.5 text-left transition-colors hover:border-white/30"
            >
              <span
                style={{ fontFamily: preset.fontFamily, fontWeight: preset.fontWeight }}
                className="line-clamp-1 text-[15px] text-foreground"
              >
                {preset.previewText}
              </span>
              <span className="text-[10.5px] text-muted-foreground">{preset.name}</span>
            </button>
          ))}
        </div>
      ) : null}

      {isElementsGroup ? (
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="text-[11.5px] font-medium text-muted-foreground">Audio Reactive</div>
            <div className="grid grid-cols-2 gap-1.5">
              {ELEMENT_PRESETS.filter((e) => e.category === "visualizer").map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onAddElementPreset(preset)}
                  className="flex flex-col items-start gap-1.5 rounded-lg border border-white/[0.08] bg-[#0c0c12] p-2.5 text-left transition-colors hover:border-white/30"
                >
                  <AudioLines className="size-4 text-[color:var(--cinema-playhead)]" strokeWidth={1.6} />
                  <span className="text-[11.5px] font-medium text-foreground">{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[11.5px] font-medium text-muted-foreground">Frames &amp; Shapes</div>
            <div className="grid grid-cols-2 gap-1.5">
              {ELEMENT_PRESETS.filter((e) => e.category === "frame" || e.category === "shape").map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onAddElementPreset(preset)}
                  className="flex flex-col items-start gap-1.5 rounded-lg border border-white/[0.08] bg-[#0c0c12] p-2.5 text-left transition-colors hover:border-white/30"
                >
                  {preset.category === "frame" ? (
                    <Sparkles className="size-4 text-foreground/85" strokeWidth={1.6} />
                  ) : (
                    <Shapes className="size-4 text-muted-foreground" strokeWidth={1.6} />
                  )}
                  <span className="text-[11.5px] font-medium text-foreground">{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[11.5px] font-medium text-muted-foreground">Starter Sequences</div>
            <div className="space-y-1.5">
              {CINEMA_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => onApplyTemplate(tpl.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-[#0c0c12] px-3 py-2 text-left transition-colors hover:border-white/30"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-medium text-foreground">{tpl.name}</div>
                    <div className="truncate text-[10.5px] text-muted-foreground">{tpl.subtitle}</div>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {tpl.defaultAspect}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "stock" ? (
        <div className="space-y-3">
          {!stockServerConfigured ? (
            <div className="rounded-xl border border-border/80 bg-card/65 p-3.5 text-left">
              <div className="flex items-center gap-2 text-[12.5px] font-medium text-foreground">
                <Film className="size-4 text-[color:var(--cinema-playhead)]" />
                <span>Pexels Stock Library</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                Add a free key from <span className="text-foreground">pexels.com/api</span> to{" "}
                <code className="dash-code">.env.local</code>:
              </p>
              <pre className="dash-code mt-2 rounded-lg border border-border/75 bg-background/70 p-2 text-[10.5px]">
                PEXELS_API_KEY=your_key
              </pre>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void runStockSearch(stockQuery, stockType)}
                className="mt-2.5 h-7 rounded-lg text-[11px]"
              >
                Re-check environment
              </Button>
            </div>
          ) : (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void runStockSearch(stockQuery, stockType);
                }}
                className="flex gap-1.5"
              >
                <Input
                  value={stockQuery}
                  onChange={(e) => setStockQuery(e.target.value)}
                  placeholder="Search Pexels…"
                  className="h-8 rounded-lg text-[12px]"
                />
                <Button type="submit" size="icon-sm" variant="outline" className="size-8 shrink-0 rounded-lg">
                  <Search className="size-3.5" />
                </Button>
              </form>

              <div className="grid grid-cols-2 gap-1 rounded-lg border border-border/80 bg-card/50 p-0.5">
                {(["videos", "photos"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setStockType(t);
                      void runStockSearch(stockQuery, t);
                    }}
                    className={`h-6 rounded-md text-[11px] capitalize transition-colors ${
                      stockType === t
                        ? "bg-foreground font-medium text-background"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-1">
                {TOPIC_CHIPS.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => {
                      setStockQuery(topic);
                      void runStockSearch(topic, stockType);
                    }}
                    className="rounded-md border border-border/75 px-2 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:border-foreground/35 hover:text-foreground"
                  >
                    {topic}
                  </button>
                ))}
              </div>

              {stockLoading ? (
                <div className="flex items-center justify-center py-8 text-[12px] text-muted-foreground">
                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                  Loading…
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {stockItems.map((item) => {
                    const busy = addingStockId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={addingStockId !== null}
                        onClick={async () => {
                          setAddingStockId(item.id);
                          try {
                            await onAddStockItem(item);
                          } finally {
                            setAddingStockId(null);
                          }
                        }}
                        className="group relative overflow-hidden rounded-lg border border-border/80 bg-card/60 text-left transition-colors hover:border-foreground/45"
                      >
                        <div className="relative aspect-video w-full overflow-hidden bg-black/40">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.thumbnailUrl}
                            alt={item.title}
                            className="h-full w-full object-cover"
                          />
                          {busy ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                              <Loader2 className="size-4 animate-spin text-white" />
                            </div>
                          ) : null}
                          <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[9.5px] text-white tabular-nums">
                            {item.kind === "video" ? `${(item.durationMs / 1000).toFixed(0)}s` : "IMG"}
                          </span>
                        </div>
                        <div className="truncate px-2 py-1 text-[10.5px] text-muted-foreground">
                          {item.author}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      ) : null}

      {activeTab === "canvas" ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground">Aspect Ratio</div>
            <div className="space-y-1">
              {(Object.values(ASPECT_RATIO_PRESETS) as Array<(typeof ASPECT_RATIO_PRESETS)["16:9"]>).map(
                (preset) => {
                  const active = project.aspectRatio === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onChangeAspectRatio(preset.id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left transition-colors ${
                        active
                          ? "border-foreground/45 bg-foreground/[0.06] text-foreground"
                          : "border-border/70 bg-card/45 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div>
                        <div className="text-[11.5px] font-medium text-foreground">{preset.label}</div>
                        <div className="text-[10px] text-muted-foreground">{preset.hint}</div>
                      </div>
                      {active ? <Check className="size-3.5 text-[color:var(--cinema-playhead)]" /> : null}
                    </button>
                  );
                },
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground">Frame Rate</div>
            <div className="grid grid-cols-3 gap-1">
              {([24, 30, 60] as const).map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => onChangeFps(rate)}
                  className={`h-7 rounded-md border font-mono text-[11px] tabular-nums transition-colors ${
                    project.fps === rate
                      ? "border-foreground bg-foreground font-medium text-background"
                      : "border-border/75 bg-card/45 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {rate} fps
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground">Stage Backdrop</div>
            <div className="grid grid-cols-2 gap-1.5">
              {BACKDROP_PRESETS.map((bp) => (
                <button
                  key={bp.id}
                  type="button"
                  onClick={() => onChangeBackground(bp.background)}
                  className="flex items-center gap-2 rounded-lg border border-border/75 bg-card/50 p-1.5 text-left transition-colors hover:border-foreground/40"
                >
                  <span
                    className="size-5 shrink-0 rounded-md border border-white/15"
                    style={{
                      background:
                        bp.background.type === "linear"
                          ? `linear-gradient(${bp.background.angleDeg}deg, ${bp.background.colorA}, ${bp.background.colorB})`
                          : bp.background.type === "radial"
                            ? `radial-gradient(circle, ${bp.background.colorA}, ${bp.background.colorB})`
                            : bp.background.colorA,
                    }}
                  />
                  <span className="truncate text-[10.5px] font-medium text-foreground">{bp.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Film Grain</span>
              <span className="font-mono text-foreground tabular-nums">
                {Math.round(project.background.grain * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={0.12}
              step={0.005}
              value={project.background.grain}
              onChange={(e) =>
                onChangeBackground({ ...project.background, grain: Number(e.target.value) })
              }
              className="cinema-range w-full"
            />
          </div>
        </div>
      ) : null}

      {activeTab === "nodes" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] font-medium text-muted-foreground">
              Studio sessions
            </span>
            <button
              type="button"
              onClick={onOpenStudioView}
              className="text-[11.5px] font-medium text-[color:var(--nexus-link)] hover:underline"
            >
              Open Studio
            </button>
          </div>

          {studioCols.length > 1 ? (
            <Select
              value={studioColId}
              onValueChange={(val) => {
                if (!val) return;
                setStudioColId(val);
                void listStudioRecordings(studioDb, val).then(setStudioRecs);
              }}
            >
              <SelectTrigger className="h-8 w-full rounded-lg text-[11.5px]">
                <SelectValue>
                  {studioCols.find((c) => c.id === studioColId)?.name ?? "Studio sessions"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {studioCols.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.recordingCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          {loadingStudio ? (
            <div className="flex items-center justify-center py-6 text-[11.5px] text-muted-foreground">
              <Loader2 className="mr-2 size-3.5 animate-spin" />
              Loading sessions…
            </div>
          ) : studioRecs.length === 0 ? (
            <div className="rounded-lg border border-white/[0.07] bg-[#0b0b10] p-4 text-center">
              <p className="text-[11.5px] text-muted-foreground">
                No Recording Studio sessions found yet
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {studioRecs.map((rec) => (
                <div
                  key={rec.id}
                  className="rounded-xl border border-white/[0.08] bg-[#0c0c12] p-2.5 transition-colors hover:border-[color:var(--nexus-link-border)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium text-foreground">
                        {rec.title}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground tabular-nums">
                        {(rec.durationMs / 1000).toFixed(1)}s · {rec.trackCount}{" "}
                        {rec.trackCount === 1 ? "track" : "tracks"}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={importingRecKey !== null}
                        onClick={() => void triggerStudioAction(rec, "mix")}
                        className="h-7 gap-1 rounded-lg px-2 text-[11px]"
                      >
                        {importingRecKey === `${rec.id}-mix` ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Plus className="size-3" />
                        )}
                        <span>Add</span>
                      </Button>

                      <Popover>
                        <PopoverTrigger
                          render={
                            <button
                              type="button"
                              aria-label={`Studio link options for ${rec.title}`}
                              className="flex size-7 items-center justify-center rounded-lg border border-white/[0.08] text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground"
                            >
                              <MoreHorizontal className="size-3.5" />
                            </button>
                          }
                        />
                        <PopoverContent
                          align="end"
                          className="dark w-52 space-y-0.5 rounded-xl border-white/10 bg-[#0d0d13] p-1.5 text-[#f4f4f6]"
                        >
                          <button
                            type="button"
                            disabled={importingRecKey !== null}
                            onClick={() => void triggerStudioAction(rec, "stems")}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] text-foreground hover:bg-white/[0.06]"
                          >
                            <Layers className="size-3.5 text-[color:var(--nexus-link)]" />
                            <span>Import isolated stems</span>
                          </button>
                          <button
                            type="button"
                            disabled={importingRecKey !== null}
                            onClick={() => void triggerStudioAction(rec, "smart-cut")}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] text-foreground hover:bg-white/[0.06]"
                          >
                            <Scissors className="size-3.5 text-[color:var(--nexus-link)]" />
                            <span>Smart-cut silences</span>
                          </button>
                          <button
                            type="button"
                            disabled={importingRecKey !== null}
                            onClick={() => void triggerStudioAction(rec, "beat-grid")}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] text-foreground hover:bg-white/[0.06]"
                          >
                            <Waves className="size-3.5 text-[color:var(--nexus-link)]" />
                            <span>Import beat grid</span>
                          </button>
                          {rec.markerCount > 0 ? (
                            <button
                              type="button"
                              disabled={importingRecKey !== null}
                              onClick={() => void triggerStudioAction(rec, "markers")}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] text-foreground hover:bg-white/[0.06]"
                            >
                              <Mic className="size-3.5 text-[color:var(--nexus-link)]" />
                              <span>Sync chapter cues</span>
                            </button>
                          ) : null}
                          {rec.hasTranscript ? (
                            <button
                              type="button"
                              disabled={importingRecKey !== null}
                              onClick={() => void triggerStudioAction(rec, "captions")}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] text-foreground hover:bg-white/[0.06]"
                            >
                              <Captions className="size-3.5 text-[color:var(--nexus-link)]" />
                              <span>Import captions</span>
                            </button>
                          ) : null}
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {rec.peaks.length > 0 ? (
                    <div className="mt-2 flex h-3.5 items-end gap-[2px] overflow-hidden rounded bg-white/[0.03] px-1">
                      {rec.peaks.slice(0, 36).map((pk, idx) => (
                        <span
                          key={idx}
                          className="flex-1 rounded-full bg-[color:var(--nexus-link)]/70"
                          style={{ height: `${Math.max(18, Math.round(pk * 100))}%` }}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1 border-t border-white/[0.07] pt-2.5">
            <button
              type="button"
              onClick={onRequestVoiceoverInStudio}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
            >
              <MonitorPlay className="size-3.5 text-[color:var(--nexus-link)]" />
              <span>Score with live video monitor</span>
            </button>
            {project.markers.length > 0 ? (
              <button
                type="button"
                onClick={onMarkersToLowerThirds}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
              >
                <Mic className="size-3.5 text-[color:var(--nexus-link)]" />
                <span>Markers to lower-thirds ({project.markers.length})</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );

  const segmentedHeader = (
    <div
      className="grid flex-1 grid-cols-4 gap-0.5 rounded-lg bg-foreground/[0.06] p-0.5"
      role="tablist"
      aria-label="Cinema browser sections"
    >
      {PRIMARY_TABS.map((tab) => {
        const active = primaryActive === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (tab.id === "media") {
                onSelectTab(isMediaGroup ? activeTab : "media");
              } else if (tab.id === "elements") {
                onSelectTab(isElementsGroup ? activeTab : "elements");
              } else {
                onSelectTab(tab.id);
              }
            }}
            className={`h-7 rounded-md px-1 text-[11.5px] font-medium transition-colors ${
              active
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Unified Apple Pro Left Browser Panel (>= lg) */}
      {open ? (
        <aside
          aria-label="Cinema browser"
          className="cinema-panel-surface hidden w-[296px] min-h-0 shrink-0 flex-col overflow-hidden border-r border-border/75 lg:flex"
        >
          <div className="flex shrink-0 items-center gap-1.5 border-b border-border/70 px-2.5 py-2">
            {segmentedHeader}
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Collapse Cinema browser"
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
            >
              <PanelLeftClose className="size-3.5" strokeWidth={1.6} />
            </button>
          </div>
          {drawerBody}
        </aside>
      ) : null}

      {/* Tablet / Mobile Drawer Fallback (< lg) */}
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent
          side="left"
          className="dark flex w-[304px] flex-col border-white/10 bg-[#08080c] p-0 text-[#f4f4f6] sm:max-w-[336px]"
        >
          <SheetHeader className="border-b border-white/10 px-3 py-2.5">
            <SheetTitle className="sr-only">Cinema Browser</SheetTitle>
            <div className="flex items-center gap-2 pr-6">{segmentedHeader}</div>
          </SheetHeader>
          {drawerBody}
        </SheetContent>
      </Sheet>
    </>
  );
}
