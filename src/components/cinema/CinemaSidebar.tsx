"use client";

import { useEffect, useState, type ChangeEvent, type DragEvent } from "react";
import {
  AudioLines,
  Captions,
  Check,
  Film,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  Loader2,
  Mic,
  Plus,
  Search,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Type,
  Upload,
  Video,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  | "templates"
  | "media"
  | "studio"
  | "stock"
  | "text"
  | "elements"
  | "canvas";

const SIDEBAR_ITEMS: Array<{
  id: CinemaSidebarTab;
  label: string;
  icon: typeof LayoutTemplate;
}> = [
  { id: "templates", label: "Templates", icon: LayoutTemplate },
  { id: "media", label: "Media", icon: Layers },
  { id: "studio", label: "Studio", icon: Waves },
  { id: "stock", label: "Stock", icon: Film },
  { id: "text", label: "Text", icon: Type },
  { id: "elements", label: "Elements", icon: Shapes },
  { id: "canvas", label: "Canvas", icon: SlidersHorizontal },
];

const TOPIC_CHIPS = ["Architecture", "Minimal", "Nature", "Studio", "City", "Light"] as const;

export function CinemaSidebar({
  open,
  activeTab,
  onSelectTab,
  mobileOpen,
  onMobileOpenChange,
  project,
  pexelsConfigured,
  onApplyTemplate,
  onUploadFiles,
  onAddAssetToTimeline,
  onOpenCapture,
  onImportStudioRecording,
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
  onRequestVoiceoverInStudio: () => void;
  onAddStockItem: (item: StockMediaItem) => Promise<void>;
  onAddTextPreset: (preset: TextStylePreset) => void;
  onAddElementPreset: (preset: (typeof ELEMENT_PRESETS)[number]) => void;
  onChangeAspectRatio: (ratio: CinemaAspectRatio) => void;
  onChangeFps: (fps: 24 | 30 | 60) => void;
  onChangeBackground: (bg: CinemaBackground) => void;
  onOpenStudioView: () => void;
}) {
  // Recording Studio Bridge State
  const [studioDb, setStudioDb] = useState(false);
  const [studioCols, setStudioCols] = useState<StudioCollection[]>([]);
  const [studioColId, setStudioColId] = useState("");
  const [studioRecs, setStudioRecs] = useState<StudioRecordingSummary[]>([]);
  const [loadingStudio, setLoadingStudio] = useState(false);
  const [importingRecId, setImportingRecId] = useState<string | null>(null);

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
    if (activeTab !== "studio") return;
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

  async function triggerStudioImport(
    summary: StudioRecordingSummary,
    mode: "mix" | "stems" | "captions" | "markers",
  ) {
    setImportingRecId(`${summary.id}-${mode}`);
    try {
      const full = await getStudioRecording(studioDb, summary.id);
      if (full) {
        await onImportStudioRecording(full, mode);
      }
    } finally {
      setImportingRecId(null);
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

  const drawerBody = (
    <div className="cinema-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 py-3">
      {activeTab === "templates" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-medium text-foreground">Starter Templates</h3>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {CINEMA_TEMPLATES.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {CINEMA_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onApplyTemplate(tpl.id)}
                className="group flex items-start gap-3 rounded-2xl border border-border/80 bg-card/65 p-3 text-left transition-colors hover:border-[color:var(--cinema-select)]/60 hover:bg-card"
              >
                <span
                  className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border border-white/10 text-[11px] font-medium text-white shadow-inner"
                  style={{ background: tpl.accentSwatch }}
                >
                  {tpl.defaultAspect}
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium text-foreground">{tpl.name}</div>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    {tpl.subtitle}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === "media" ? (
        <div className="space-y-3.5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverMedia(true);
            }}
            onDragLeave={() => setDragOverMedia(false)}
            onDrop={handleDrop}
            className={`rounded-2xl border border-dashed p-3.5 text-center transition-colors ${
              dragOverMedia
                ? "border-[color:var(--cinema-select)] bg-[color:var(--cinema-select-soft)]"
                : "border-border/85 bg-card/45"
            }`}
          >
            <Upload className="mx-auto size-4 text-muted-foreground" strokeWidth={1.6} />
            <p className="mt-1.5 text-[12px] font-medium text-foreground">Drop video, photos, or audio</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">MP4, WebM, MOV, PNG, JPG, WAV</p>
            <div className="mt-2.5 flex items-center justify-center gap-1.5">
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-foreground px-3 text-[11.5px] font-medium text-background transition-opacity hover:opacity-90">
                <Plus className="size-3.5" />
                <span>Upload</span>
                <input
                  type="file"
                  accept="video/*,image/*,audio/*"
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
                className="h-8 gap-1.5 rounded-full px-3 text-[11.5px]"
              >
                <Video className="size-3.5" />
                <span>Record</span>
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-[12.5px] font-medium text-foreground">Project Bin</h3>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {project.assets.length}
            </span>
          </div>

          {project.assets.length === 0 ? (
            <p className="rounded-2xl border border-border/60 bg-card/30 px-3 py-5 text-center text-[11.5px] text-muted-foreground">
              Upload footage, capture your screen, or pull a take from Recording Studio.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {project.assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => onAddAssetToTimeline(asset)}
                  className="group overflow-hidden rounded-xl border border-border/80 bg-card/70 text-left transition-colors hover:border-[color:var(--cinema-select)]/70"
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-black/40">
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
                          <AudioLines className="size-4 text-[color:var(--cinema-studio-link)]" />
                        ) : (
                          <ImageIcon className="size-4 text-muted-foreground" />
                        )}
                      </div>
                    )}
                    <span className="absolute right-1.5 bottom-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[9.5px] text-white tabular-nums">
                      {(asset.durationMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                  <div className="p-2">
                    <div className="truncate text-[11.5px] font-medium text-foreground">
                      {asset.name}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="capitalize">{asset.kind}</span>
                      <span className="text-[color:var(--cinema-select)] opacity-0 transition-opacity group-hover:opacity-100">
                        + Add
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "studio" ? (
        <div className="space-y-3.5">
          <div className="rounded-2xl border border-[color:var(--cinema-studio-link)]/35 bg-[color:var(--cinema-studio-link)]/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
                <Waves className="size-4 text-[color:var(--cinema-studio-link)]" />
                <span>Recording Studio Sync</span>
              </div>
              <button
                type="button"
                onClick={onOpenStudioView}
                className="text-[11px] font-medium text-[color:var(--cinema-studio-link)] hover:underline"
              >
                Open Studio
              </button>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Pull multi-track takes, markers, and captions straight onto Cinema without rendering intermediates.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={onRequestVoiceoverInStudio}
              className="mt-2.5 h-8 w-full gap-1.5 rounded-full bg-foreground text-[11.5px] font-medium text-background hover:opacity-90"
            >
              <Mic className="size-3.5" />
              <span>Record Voiceover in Studio</span>
            </Button>
          </div>

          {studioCols.length > 0 ? (
            <Select
              value={studioColId}
              onValueChange={(val) => {
                if (!val) return;
                setStudioColId(val);
                void listStudioRecordings(studioDb, val).then(setStudioRecs);
              }}
            >
              <SelectTrigger className="h-8 w-full text-[12px]">
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
            <div className="flex items-center justify-center py-6 text-[12px] text-muted-foreground">
              <Loader2 className="mr-2 size-3.5 animate-spin" />
              Loading Studio sessions…
            </div>
          ) : studioRecs.length === 0 ? (
            <div className="rounded-2xl border border-border/70 bg-card/40 p-4 text-center">
              <p className="text-[12px] font-medium text-foreground">No recordings yet</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Record a voiceover or podcast take in Recording Studio to import here.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {studioRecs.map((rec) => (
                <div
                  key={rec.id}
                  className="rounded-2xl border border-border/80 bg-card/70 p-3 transition-colors hover:border-[color:var(--cinema-studio-link)]/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-medium text-foreground">
                        {rec.title}
                      </div>
                      <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground tabular-nums">
                        {(rec.durationMs / 1000).toFixed(1)}s · {rec.trackCount}{" "}
                        {rec.trackCount === 1 ? "track" : "tracks"}
                        {rec.markerCount > 0 ? ` · ${rec.markerCount} cues` : ""}
                      </div>
                    </div>
                  </div>

                  {/* Mini Waveform Preview */}
                  {rec.peaks.length > 0 ? (
                    <div className="mt-2 flex h-6 items-end gap-[2px] overflow-hidden rounded-lg bg-foreground/[0.04] px-1.5 py-1">
                      {rec.peaks.slice(0, 36).map((pk, idx) => (
                        <span
                          key={idx}
                          className="flex-1 rounded-full bg-[color:var(--cinema-studio-link)]/75"
                          style={{ height: `${Math.max(15, Math.round(pk * 100))}%` }}
                        />
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={importingRecId !== null}
                      onClick={() => void triggerStudioImport(rec, "mix")}
                      className="h-7 flex-1 gap-1 rounded-full px-2.5 text-[11px]"
                    >
                      {importingRecId === `${rec.id}-mix` ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Plus className="size-3" />
                      )}
                      <span>Add Mix</span>
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={importingRecId !== null}
                      onClick={() => void triggerStudioImport(rec, "stems")}
                      className="h-7 flex-1 gap-1 rounded-full px-2.5 text-[11px]"
                    >
                      <Layers className="size-3 text-[color:var(--cinema-studio-link)]" />
                      <span>Stems</span>
                    </Button>

                    {rec.markerCount > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={importingRecId !== null}
                        onClick={() => void triggerStudioImport(rec, "markers")}
                        className="h-7 rounded-full px-2 text-[10.5px]"
                      >
                        Sync Cues
                      </Button>
                    ) : null}

                    {rec.hasTranscript ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={importingRecId !== null}
                        onClick={() => void triggerStudioImport(rec, "captions")}
                        className="h-7 gap-1 rounded-full px-2 text-[10.5px]"
                      >
                        <Captions className="size-3" />
                        <span>Captions</span>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "stock" ? (
        <div className="space-y-3">
          {!stockServerConfigured ? (
            <div className="rounded-2xl border border-border/80 bg-card/75 p-4 text-left">
              <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                <Film className="size-4 text-[color:var(--cinema-select)]" />
                <span>Connect Pexels Stock Library</span>
              </div>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                Search free HD stock video &amp; photography inside Cinema by adding a free API key from{" "}
                <span className="text-foreground">pexels.com/api</span> to your{" "}
                <code className="dash-code">.env.local</code>:
              </p>
              <pre className="dash-code mt-2.5 rounded-xl border border-border/75 bg-background/70 p-2.5 text-[11px]">
                PEXELS_API_KEY=your_api_key
              </pre>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void runStockSearch(stockQuery, stockType)}
                className="mt-3 h-7 rounded-full text-[11px]"
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
                  placeholder="Search Pexels B-roll…"
                  className="h-8 text-[12px]"
                />
                <Button type="submit" size="icon-sm" variant="outline" className="size-8 shrink-0">
                  <Search className="size-3.5" />
                </Button>
              </form>

              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex rounded-full border border-border/80 bg-card/60 p-0.5">
                  {(["videos", "photos"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setStockType(t);
                        void runStockSearch(stockQuery, t);
                      }}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] capitalize transition-colors ${
                        stockType === t
                          ? "bg-foreground font-medium text-background"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
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
                    className="rounded-full border border-border/75 px-2 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                  >
                    {topic}
                  </button>
                ))}
              </div>

              {stockLoading ? (
                <div className="flex items-center justify-center py-8 text-[12px] text-muted-foreground">
                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                  Searching Pexels…
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
                        className="group relative overflow-hidden rounded-xl border border-border/80 bg-card/60 text-left transition-colors hover:border-[color:var(--cinema-select)]/75"
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
                          <span className="absolute right-1.5 bottom-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[9.5px] text-white tabular-nums">
                            {item.kind === "video" ? `${(item.durationMs / 1000).toFixed(0)}s` : "IMG"}
                          </span>
                        </div>
                        <div className="truncate px-2 py-1.5 text-[10.5px] text-muted-foreground">
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

      {activeTab === "text" ? (
        <div className="space-y-2.5">
          <h3 className="text-[12.5px] font-medium text-foreground">Editorial Typography</h3>
          {TEXT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onAddTextPreset(preset)}
              className="flex w-full flex-col items-start gap-1 rounded-2xl border border-border/80 bg-card/60 px-3.5 py-3 text-left transition-colors hover:border-[color:var(--cinema-select)]/70 hover:bg-card"
            >
              <span
                style={{ fontFamily: preset.fontFamily, fontWeight: preset.fontWeight }}
                className="line-clamp-1 text-[16px] text-foreground"
              >
                {preset.previewText}
              </span>
              <span className="text-[10.5px] text-muted-foreground">{preset.name}</span>
            </button>
          ))}
        </div>
      ) : null}

      {activeTab === "elements" ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-[12.5px] font-medium text-foreground">Live Audio Visualizers</h3>
            <div className="grid grid-cols-2 gap-2">
              {ELEMENT_PRESETS.filter((e) => e.category === "visualizer").map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onAddElementPreset(preset)}
                  className="flex flex-col items-start gap-1.5 rounded-2xl border border-border/80 bg-card/60 p-3 text-left transition-colors hover:border-[color:var(--cinema-studio-link)]/70 hover:bg-card"
                >
                  <AudioLines className="size-4 text-[color:var(--cinema-studio-link)]" strokeWidth={1.6} />
                  <span className="text-[11.5px] font-medium text-foreground">{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-[12.5px] font-medium text-foreground">Frames &amp; HUD</h3>
            <div className="grid grid-cols-2 gap-2">
              {ELEMENT_PRESETS.filter((e) => e.category === "frame").map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onAddElementPreset(preset)}
                  className="flex flex-col items-start gap-1.5 rounded-2xl border border-border/80 bg-card/60 p-3 text-left transition-colors hover:border-[color:var(--cinema-select)]/70 hover:bg-card"
                >
                  <Sparkles className="size-4 text-[color:var(--cinema-select)]" strokeWidth={1.6} />
                  <span className="text-[11.5px] font-medium text-foreground">{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-[12.5px] font-medium text-foreground">Vector Shapes</h3>
            <div className="grid grid-cols-2 gap-2">
              {ELEMENT_PRESETS.filter((e) => e.category === "shape").map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onAddElementPreset(preset)}
                  className="flex flex-col items-start gap-1.5 rounded-2xl border border-border/80 bg-card/60 p-3 text-left transition-colors hover:border-[color:var(--cinema-select)]/70 hover:bg-card"
                >
                  <Shapes className="size-4 text-muted-foreground" strokeWidth={1.6} />
                  <span className="text-[11.5px] font-medium text-foreground">{preset.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "canvas" ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-[12.5px] font-medium text-foreground">Aspect Ratio</h3>
            <div className="space-y-1.5">
              {(Object.values(ASPECT_RATIO_PRESETS) as Array<(typeof ASPECT_RATIO_PRESETS)["16:9"]>).map(
                (preset) => {
                  const active = project.aspectRatio === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onChangeAspectRatio(preset.id)}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors ${
                        active
                          ? "border-[color:var(--cinema-select)] bg-[color:var(--cinema-select-soft)] text-foreground"
                          : "border-border/75 bg-card/50 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div>
                        <div className="text-[12px] font-medium text-foreground">{preset.label}</div>
                        <div className="text-[10.5px] text-muted-foreground">{preset.hint}</div>
                      </div>
                      {active ? <Check className="size-3.5 text-[color:var(--cinema-select)]" /> : null}
                    </button>
                  );
                },
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-[12.5px] font-medium text-foreground">Frame Rate</h3>
            <div className="grid grid-cols-3 gap-1.5">
              {([24, 30, 60] as const).map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => onChangeFps(rate)}
                  className={`h-8 rounded-xl border font-mono text-[11.5px] tabular-nums transition-colors ${
                    project.fps === rate
                      ? "border-foreground bg-foreground font-medium text-background"
                      : "border-border/75 bg-card/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {rate} fps
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-[12.5px] font-medium text-foreground">Stage Backdrop</h3>
            <div className="grid grid-cols-2 gap-2">
              {BACKDROP_PRESETS.map((bp) => (
                <button
                  key={bp.id}
                  type="button"
                  onClick={() => onChangeBackground(bp.background)}
                  className="flex items-center gap-2 rounded-xl border border-border/80 bg-card/60 p-2 text-left transition-colors hover:border-[color:var(--cinema-select)]/70"
                >
                  <span
                    className="size-6 shrink-0 rounded-lg border border-white/15"
                    style={{
                      background:
                        bp.background.type === "linear"
                          ? `linear-gradient(${bp.background.angleDeg}deg, ${bp.background.colorA}, ${bp.background.colorB})`
                          : bp.background.type === "radial"
                            ? `radial-gradient(circle, ${bp.background.colorA}, ${bp.background.colorB})`
                            : bp.background.colorA,
                    }}
                  />
                  <span className="truncate text-[11px] font-medium text-foreground">{bp.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-muted-foreground">Optical Film Grain</span>
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
    </div>
  );

  return (
    <>
      {/* Desktop Rail + Collapsible Canva Drawer (>= lg) */}
      <div className="hidden min-h-0 shrink-0 lg:flex">
        <aside
          aria-label="Cinema tool rail"
          className="cinema-chrome-surface flex w-[64px] shrink-0 flex-col items-center gap-1 border-r border-border/75 py-2.5"
        >
          {SIDEBAR_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = open && activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex w-13 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[10.5px] font-medium transition-colors ${
                  active
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
                }`}
              >
                <Icon
                  className={`size-4 ${
                    item.id === "studio" ? "text-[color:var(--cinema-studio-link)]" : ""
                  }`}
                  strokeWidth={1.6}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </aside>

        {open ? (
          <aside
            aria-label="Cinema drawer"
            className="cinema-panel-surface flex w-[288px] shrink-0 flex-col border-r border-border/75"
          >
            {drawerBody}
          </aside>
        ) : null}
      </div>

      {/* Tablet / Mobile Drawer Fallback (< lg) */}
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="flex w-[308px] flex-col p-0 sm:max-w-[340px]">
          <SheetHeader className="border-b border-border/60 px-4 py-3">
            <SheetTitle className="text-[14px] font-medium capitalize">{activeTab}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-wrap gap-1 border-b border-border/60 px-3 py-2">
            {SIDEBAR_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  activeTab === item.id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {drawerBody}
        </SheetContent>
      </Sheet>
    </>
  );
}
