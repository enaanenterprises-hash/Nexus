"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Bookmark,
  CalendarClock,
  Check,
  CheckCircle2,
  ExternalLink,
  Heart,
  Link2,
  Loader2,
  Maximize2,
  MessageCircle,
  Minimize2,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Repeat2,
  RotateCcw,
  Send,
  Share2,
  SlidersHorizontal,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { connectGoogleService } from "@/lib/command/google-connect";
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_IDS,
  createDefaultFraming,
  createDefaultSocialDraft,
  getSocialPlatform,
  resolvedPlatformCopy,
  validateSocialDraft,
  type PlatformFramingConfig,
  type SocialAspectMode,
  type SocialPlatformId,
  type SocialPlatformSpec,
  type SocialPublishDraft,
  type SocialPublishRecord,
  type SocialVisibility,
} from "@/lib/social/platforms";
import { formatVaultDuration, type VaultItem } from "@/lib/storage/types";
import { resolveVaultItemBlob, useVault } from "@/lib/storage/vault-client";

const ASPECT_RATIO_CLASS: Record<SocialAspectMode, string> = {
  "9:16": "aspect-[9/16]",
  "4:5": "aspect-[4/5]",
  "16:9": "aspect-video",
  "1:1": "aspect-square",
};

function aspectNumericRatio(mode: SocialAspectMode): string {
  switch (mode) {
    case "9:16":
      return "9 / 16";
    case "4:5":
      return "4 / 5";
    case "16:9":
      return "16 / 9";
    case "1:1":
      return "1 / 1";
  }
}

export function SocialPublishStudio({
  open,
  onOpenChange,
  item,
  connectedConnectorIds = [],
  connectedAccounts = {},
  connectorAvailability,
  onOpenConnections,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: VaultItem | null;
  connectedConnectorIds?: readonly string[];
  connectedAccounts?: Record<string, string>;
  connectorAvailability?: Record<string, { connectable: boolean; missing: string[] }>;
  onOpenConnections?: (connectorId: string) => void;
  onPublished?: (record: SocialPublishRecord) => void;
}) {
  if (!item) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SocialPublishContent
        key={`${item.id}-${open ? "open" : "closed"}`}
        open={open}
        item={item}
        connectedConnectorIds={connectedConnectorIds}
        connectedAccounts={connectedAccounts}
        connectorAvailability={connectorAvailability}
        onOpenConnections={onOpenConnections}
        onPublished={onPublished}
      />
    </Dialog>
  );
}

function SocialPublishContent({
  open,
  item,
  connectedConnectorIds = [],
  connectedAccounts = {},
  connectorAvailability,
  onOpenConnections,
  onPublished,
}: {
  open: boolean;
  item: VaultItem;
  connectedConnectorIds?: readonly string[];
  connectedAccounts?: Record<string, string>;
  connectorAvailability?: Record<string, { connectable: boolean; missing: string[] }>;
  onOpenConnections?: (connectorId: string) => void;
  onPublished?: (record: SocialPublishRecord) => void;
}) {
  const vault = useVault();
  const connectedSet = useMemo(() => new Set(connectedConnectorIds), [connectedConnectorIds]);

  const initialDraft = useMemo<SocialPublishDraft>(() => {
    const existing = item.metadata.socialDraft;
    if (existing) return existing;
    const baseName = item.name.replace(/\.[^.]+$/, "");
    return createDefaultSocialDraft(baseName);
  }, [item]);

  const [draft, setDraft] = useState<SocialPublishDraft>(initialDraft);
  const [focusedPlatform, setFocusedPlatform] = useState<SocialPlatformId>(() => {
    return SOCIAL_PLATFORM_IDS.find((id) => initialDraft.platforms[id]?.enabled) ?? "tiktok";
  });
  const [viewMode, setViewMode] = useState<"focused" | "all">("focused");
  const [customizePerApp, setCustomizePerApp] = useState(false);

  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [blobRefState, setBlobRefState] = useState<Blob | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);

  const [publishing, setPublishing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [lastRecord, setLastRecord] = useState<SocialPublishRecord | null>(
    () => item.metadata.publishHistory?.[0] ?? null,
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dragPanRef = useRef<{
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
    platformId: SocialPlatformId;
  } | null>(null);

  // Resolve real binary Blob -> Object URL cleanly
  useEffect(() => {
    if (!open) return;
    let alive = true;
    let createdUrl: string | null = null;
    void resolveVaultItemBlob(item).then((blob) => {
      if (!alive || !blob) return;
      setBlobRefState(blob);
      createdUrl = URL.createObjectURL(blob);
      setMediaUrl(createdUrl);
    });
    return () => {
      alive = false;
      setPlaying(false);
      setMediaUrl(null);
      setBlobRefState(null);
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [open, item]);

  const activeSpec = getSocialPlatform(focusedPlatform);
  const activeConfig = draft.platforms[focusedPlatform];
  const activeFraming = activeConfig.framing;
  const activeCopy = resolvedPlatformCopy(draft, focusedPlatform);
  const validation = useMemo(() => validateSocialDraft(draft), [draft]);
  const enabledPlatforms = useMemo(
    () => SOCIAL_PLATFORM_IDS.filter((id) => draft.platforms[id]?.enabled),
    [draft.platforms],
  );

  function updateFraming(platformId: SocialPlatformId, patch: Partial<PlatformFramingConfig>) {
    setDraft((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      platforms: {
        ...prev.platforms,
        [platformId]: {
          ...prev.platforms[platformId],
          framing: {
            ...prev.platforms[platformId].framing,
            ...patch,
          },
        },
      },
    }));
  }

  function togglePlatform(platformId: SocialPlatformId) {
    setDraft((prev) => {
      const nextEnabled = !prev.platforms[platformId].enabled;
      const next = {
        ...prev,
        updatedAt: new Date().toISOString(),
        platforms: {
          ...prev.platforms,
          [platformId]: {
            ...prev.platforms[platformId],
            enabled: nextEnabled,
          },
        },
      };
      if (nextEnabled) setFocusedPlatform(platformId);
      return next;
    });
  }

  function togglePlayback() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }

  function handlePreviewPointerDown(
    platformId: SocialPlatformId,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    const f = draft.platforms[platformId].framing;
    dragPanRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origPanX: f.panX,
      origPanY: f.panY,
      platformId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePreviewPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragPanRef.current;
    if (!drag) return;
    const dx = ((event.clientX - drag.startX) / 220) * 50;
    const dy = ((event.clientY - drag.startY) / 320) * 50;
    updateFraming(drag.platformId, {
      panX: Math.max(-50, Math.min(50, Math.round(drag.origPanX + dx))),
      panY: Math.max(-50, Math.min(50, Math.round(drag.origPanY + dy))),
    });
  }

  function handlePreviewPointerUp() {
    dragPanRef.current = null;
  }

  const [signingInId, setSigningInId] = useState<string | null>(null);

  async function handleSignInPlatform(spec: SocialPlatformSpec) {
    setSigningInId(spec.connectorId);
    try {
      await vault.saveSocialDraft(item.id, draft);
      const avail = connectorAvailability?.[spec.connectorId];
      if (avail && !avail.connectable) {
        setSigningInId(null);
        onOpenConnections?.(spec.connectorId);
        return;
      }
      if (spec.id === "youtube") {
        await connectGoogleService("youtube-publish", {
          widget: "storage",
          itemId: item.id,
        });
        return;
      }
      // Full browser navigation required for 302 redirect to external OAuth consent screen
      /* eslint-disable-next-line @next/next/no-location-assign-relative-destination */
      window.location.assign(
        `/api/command/oauth/${encodeURIComponent(spec.connectorId)}/start?widget=storage&itemId=${encodeURIComponent(item.id)}`,
      );
    } catch {
      setSigningInId(null);
      setStatusNotice(`Could not start ${spec.name} sign-in. Try again in a moment.`);
    }
  }

  async function handleSaveDraft() {
    if (!item) return;
    setSavingDraft(true);
    try {
      await vault.saveSocialDraft(item.id, draft);
      setStatusNotice("Feed layouts, framing, and post metadata saved to Command Storage.");
    } finally {
      setSavingDraft(false);
    }
  }

  async function handlePublishEverywhere() {
    if (!item) return;
    setValidationAttempted(true);
    setStatusNotice(null);
    if (!validation.ok) {
      setStatusNotice(validation.errors[0] ?? "Complete mandatory Title and Description.");
      return;
    }

    setPublishing(true);
    try {
      await vault.saveSocialDraft(item.id, draft);

      let res: Response;
      if (blobRefState && blobRefState.size > 0 && blobRefState.size <= 90 * 1024 * 1024) {
        const form = new FormData();
        form.append(
          "payload",
          JSON.stringify({
            itemId: item.id,
            remoteUrl: item.remoteUrl,
            mimeType: item.mimeType,
            draft,
          }),
        );
        form.append("file", blobRefState, item.name);
        res = await fetch("/api/social/publish", { method: "POST", body: form });
      } else {
        res = await fetch("/api/social/publish", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            itemId: item.id,
            remoteUrl: item.remoteUrl,
            mimeType: item.mimeType,
            draft,
          }),
        });
      }

      const data = (await res.json()) as SocialPublishRecord & { error?: string };
      if (!res.ok) {
        setStatusNotice(data.error ?? "Publish request failed.");
        return;
      }

      setLastRecord(data);
      await vault.recordPublishResults(item.id, data);
      onPublished?.(data);

      const liveCount = data.platforms.filter((r) => r.status === "published").length;
      const credCount = data.platforms.filter((r) => r.status === "needs_credentials").length;
      if (liveCount === data.platforms.length) {
        setStatusNotice(`Published cleanly across all ${liveCount} selected platforms.`);
      } else if (credCount > 0 && liveCount === 0) {
        setStatusNotice(
          `Saved framing & copy for ${credCount} platform${credCount === 1 ? "" : "s"}. Sign in to each account below to publish directly.`,
        );
      } else {
        setStatusNotice(
          `Completed dispatch: ${liveCount} published, ${credCount} awaiting account sign-in.`,
        );
      }
    } catch (err) {
      setStatusNotice(err instanceof Error ? err.message : "Could not send publish request.");
    } finally {
      setPublishing(false);
    }
  }

  const isVideo = item.kind === "video";
  const hasPerAppOverride =
    activeConfig.customTitle !== undefined ||
    activeConfig.customDescription !== undefined ||
    activeConfig.customHashtags !== undefined;

  return (
      <DialogContent className="flex h-[92svh] max-h-[900px] w-[96vw] max-w-[1220px] flex-col gap-0 overflow-hidden rounded-[22px] border border-border bg-card p-0 text-card-foreground shadow-2xl ring-0 sm:max-w-[1220px]">
        {/* Top Studio Bar */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-card/95 px-5 py-3.5 pr-12">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[10px] border border-border/80 bg-muted">
              {item.thumbnailDataUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={item.thumbnailDataUrl}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] font-mono text-muted-foreground">
                  {item.kind.toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <DialogTitle className="font-editorial truncate text-[1.1rem] font-medium tracking-[-0.02em] text-foreground">
                  Publish to Social
                </DialogTitle>
                <Badge
                  variant="outline"
                  className="hidden h-5 border-[color:var(--land-gold)]/45 bg-[color:var(--land-gold)]/10 px-2 text-[10px] font-medium text-[color:var(--land-gold)] sm:inline-flex"
                >
                  Linked to Command Storage
                </Badge>
              </div>
              <DialogDescription className="truncate font-mono text-[11px] text-muted-foreground tabular-nums">
                {item.name}
                {item.metadata.width && item.metadata.height
                  ? ` · ${item.metadata.width}×${item.metadata.height}`
                  : ""}
                {item.metadata.durationMs ? ` · ${formatVaultDuration(item.metadata.durationMs)}` : ""}
              </DialogDescription>
            </div>
          </div>

          {/* Multi-platform destination toggles */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Target platforms">
            {SOCIAL_PLATFORMS.map((spec) => {
              const enabled = draft.platforms[spec.id]?.enabled;
              const isConnected = connectedSet.has(spec.connectorId);
              return (
                <button
                  key={spec.id}
                  type="button"
                  aria-pressed={enabled}
                  onClick={() => togglePlatform(spec.id)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors ${
                    enabled
                      ? "border-[color:var(--land-gold)]/70 bg-[color:var(--land-gold)]/15 text-foreground"
                      : "border-border/80 bg-transparent text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      isConnected
                        ? "bg-emerald-500"
                        : enabled
                          ? "bg-[color:var(--land-gold)]"
                          : "bg-muted-foreground/40"
                    }`}
                    aria-hidden
                  />
                  <span>{spec.name}</span>
                  {enabled ? <Check className="size-3 text-[color:var(--land-gold)]" /> : null}
                </button>
              );
            })}
          </div>
        </header>

        {/* Split Stage: Live Feed Previews + Framing & Mandatory Metadata */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_395px]">
          {/* Left: Authentic Per-Platform Feed Preview Stage */}
          <div className="flex min-h-0 flex-col bg-background/65">
            {/* Stage Controls Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <div className="inline-flex rounded-full border border-border/80 bg-muted/40 p-0.5 text-[11.5px]">
                  <button
                    type="button"
                    onClick={() => setViewMode("focused")}
                    className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                      viewMode === "focused"
                        ? "bg-foreground text-background shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Focused Feed
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("all")}
                    className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                      viewMode === "all"
                        ? "bg-foreground text-background shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Compare All ({enabledPlatforms.length})
                  </button>
                </div>

                {viewMode === "focused" ? (
                  <div className="hidden items-center gap-1 pl-1 sm:flex">
                    {SOCIAL_PLATFORMS.map((spec) => {
                      const active = focusedPlatform === spec.id;
                      const enabled = draft.platforms[spec.id]?.enabled;
                      return (
                        <button
                          key={spec.id}
                          type="button"
                          onClick={() => setFocusedPlatform(spec.id)}
                          className={`rounded-lg px-2 py-1 text-[11.5px] font-medium transition-colors ${
                            active
                              ? "bg-muted text-foreground ring-1 ring-border"
                              : enabled
                                ? "text-muted-foreground hover:text-foreground"
                                : "text-muted-foreground/45 hover:text-muted-foreground"
                          }`}
                        >
                          {spec.name}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {/* Aspect Switcher for Active Platform */}
              <div className="flex flex-wrap items-center gap-1.5">
                {activeSpec.supportedAspects.length > 1 ? (
                  <div className="inline-flex items-center rounded-lg border border-border/80 bg-muted/35 p-0.5 text-[11px]">
                    {activeSpec.supportedAspects.map((aspect) => (
                      <button
                        key={aspect}
                        type="button"
                        onClick={() => updateFraming(focusedPlatform, { aspectMode: aspect })}
                        className={`rounded-md px-2 py-0.5 font-medium transition-colors ${
                          activeFraming.aspectMode === aspect
                            ? "bg-card text-foreground shadow-2xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {activeSpec.aspectLabels[aspect] ?? aspect}
                      </button>
                    ))}
                  </div>
                ) : null}

                <Button
                  type="button"
                  size="xs"
                  variant={activeFraming.fit === "cover" ? "secondary" : "outline"}
                  onClick={() =>
                    updateFraming(focusedPlatform, {
                      fit: activeFraming.fit === "cover" ? "contain" : "cover",
                    })
                  }
                  className="h-7 gap-1 rounded-lg px-2 text-[11px]"
                >
                  {activeFraming.fit === "cover" ? (
                    <Maximize2 className="size-3" />
                  ) : (
                    <Minimize2 className="size-3" />
                  )}
                  <span>{activeFraming.fit === "cover" ? "Fill" : "Fit"}</span>
                </Button>

                <Button
                  type="button"
                  size="xs"
                  variant={activeFraming.showSafeZones ? "secondary" : "ghost"}
                  onClick={() =>
                    updateFraming(focusedPlatform, {
                      showSafeZones: !activeFraming.showSafeZones,
                    })
                  }
                  className="h-7 rounded-lg px-2 text-[11px]"
                >
                  Safe zones
                </Button>
              </div>
            </div>

            {/* Canvas Viewport */}
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex min-h-full flex-col items-center justify-center p-5 sm:p-7">
                {viewMode === "focused" ? (
                  <PlatformFeedCard
                    platformId={focusedPlatform}
                    framing={activeFraming}
                    title={activeCopy.title || item.name}
                    description={activeCopy.description}
                    hashtags={activeCopy.hashtags}
                    mediaUrl={mediaUrl}
                    posterUrl={item.thumbnailDataUrl}
                    isVideo={isVideo}
                    muted={muted}
                    playing={playing}
                    videoRef={videoRef}
                    onLoadedMetadata={(dur) => setDurationSec(dur)}
                    onTimeUpdate={(sec) => setCurrentTimeSec(sec)}
                    onPointerDown={(e) => handlePreviewPointerDown(focusedPlatform, e)}
                    onPointerMove={handlePreviewPointerMove}
                    onPointerUp={handlePreviewPointerUp}
                    onToggleMute={() => setMuted((m) => !m)}
                    onTogglePlay={togglePlayback}
                  />
                ) : enabledPlatforms.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-8 text-center text-[13px] text-muted-foreground">
                    Enable one or more platforms above to compare their feed layouts side-by-side.
                  </div>
                ) : (
                  <div className="grid w-full max-w-[780px] grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {enabledPlatforms.map((pid) => {
                      const pf = draft.platforms[pid]!;
                      const cp = resolvedPlatformCopy(draft, pid);
                      return (
                        <div key={pid} className="flex flex-col items-center gap-2">
                          <div className="flex w-full items-center justify-between px-1 text-[11.5px]">
                            <span className="font-medium text-foreground">
                              {getSocialPlatform(pid).name} · {pf.framing.aspectMode}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setFocusedPlatform(pid);
                                setViewMode("focused");
                              }}
                              className="text-[11px] font-medium text-[color:var(--land-gold)] hover:underline"
                            >
                              Adjust frame
                            </button>
                          </div>
                          <PlatformFeedCard
                            compact
                            platformId={pid}
                            framing={pf.framing}
                            title={cp.title || item.name}
                            description={cp.description}
                            hashtags={cp.hashtags}
                            mediaUrl={mediaUrl}
                            posterUrl={item.thumbnailDataUrl}
                            isVideo={isVideo}
                            muted
                            playing={playing}
                            onPointerDown={(e) => handlePreviewPointerDown(pid, e)}
                            onPointerMove={handlePreviewPointerMove}
                            onPointerUp={handlePreviewPointerUp}
                            onToggleMute={() => setMuted((m) => !m)}
                            onTogglePlay={togglePlayback}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Bottom Framing & Playback Transport Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-card/60 px-4 py-2.5 text-[11.5px]">
              <div className="flex items-center gap-2">
                {isVideo ? (
                  <>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="outline"
                      onClick={togglePlayback}
                      aria-label={playing ? "Pause preview" : "Play preview"}
                      className="size-7 rounded-full"
                    >
                      {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => setMuted((m) => !m)}
                      aria-label={muted ? "Unmute audio" : "Mute audio"}
                      className="size-7 rounded-full text-muted-foreground hover:text-foreground"
                    >
                      {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                    </Button>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, durationSec)}
                      step={0.05}
                      value={Math.min(currentTimeSec, Math.max(1, durationSec))}
                      onChange={(e) => {
                        const t = Number(e.target.value);
                        setCurrentTimeSec(t);
                        if (videoRef.current) videoRef.current.currentTime = t;
                      }}
                      aria-label="Preview scrubber"
                      className="w-24 accent-[color:var(--land-gold)] sm:w-32"
                    />
                    <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
                      {formatVaultDuration(currentTimeSec * 1000)} / {formatVaultDuration(durationSec * 1000)}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Drag framing inside preview to pan</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-muted-foreground">
                  <SlidersHorizontal className="size-3" />
                  <span>Zoom</span>
                  <input
                    type="range"
                    min={1}
                    max={2.2}
                    step={0.05}
                    value={activeFraming.zoom}
                    onChange={(e) =>
                      updateFraming(focusedPlatform, { zoom: Number(e.target.value) })
                    }
                    className="w-20 accent-[color:var(--land-gold)]"
                  />
                  <span className="w-8 text-right font-mono tabular-nums text-foreground">
                    {activeFraming.zoom.toFixed(1)}×
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() =>
                    updateFraming(
                      focusedPlatform,
                      createDefaultFraming(activeFraming.aspectMode),
                    )
                  }
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="size-3" />
                  <span>Reset crop</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right: Mandatory Metadata, Platform Overrides & Multi-Dispatch */}
          <div className="flex min-h-0 flex-col border-t border-border/80 bg-card lg:border-t-0 lg:border-l">
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-4 p-5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="social-title" className="text-[12.5px] font-medium">
                      Title <span className="text-[color:var(--land-gold)]">*</span>
                    </Label>
                    <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
                      {draft.title.length}/{activeSpec.maxTitleChars}
                    </span>
                  </div>
                  <Input
                    id="social-title"
                    value={draft.title}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, title: e.target.value }))
                    }
                    placeholder="Give this release a crisp headline…"
                    className={`h-9 rounded-xl text-[13px] ${
                      validationAttempted && !draft.title.trim() ? "border-destructive" : ""
                    }`}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="social-desc" className="text-[12.5px] font-medium">
                      Description / Caption <span className="text-[color:var(--land-gold)]">*</span>
                    </Label>
                    <span
                      className={`font-mono text-[10.5px] tabular-nums ${
                        activeCopy.description.length + activeCopy.hashtags.length >
                        activeSpec.maxDescriptionChars
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                    >
                      {(activeCopy.hashtags
                        ? `${activeCopy.description}\n\n${activeCopy.hashtags}`
                        : activeCopy.description
                      ).length}
                      /{activeSpec.maxDescriptionChars} ({activeSpec.name})
                    </span>
                  </div>
                  <Textarea
                    id="social-desc"
                    rows={4}
                    value={draft.description}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="Write the story, takeaway, or prompt that travels with this video across every feed…"
                    className={`rounded-xl text-[13px] leading-relaxed ${
                      validationAttempted && !draft.description.trim() ? "border-destructive" : ""
                    }`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="social-tags" className="text-[12px] font-medium">
                      Hashtags
                    </Label>
                    <Input
                      id="social-tags"
                      value={draft.hashtags}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, hashtags: e.target.value }))
                      }
                      placeholder="#podcast #cinema"
                      className="h-9 rounded-xl text-[12.5px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px] font-medium">Visibility</Label>
                    <Select
                      value={draft.visibility}
                      onValueChange={(v) =>
                        setDraft((prev) => ({ ...prev, visibility: v as SocialVisibility }))
                      }
                    >
                      <SelectTrigger className="h-9 rounded-xl text-[12.5px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public">Public</SelectItem>
                        <SelectItem value="unlisted">Unlisted</SelectItem>
                        <SelectItem value="private">Private</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="social-schedule"
                    className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground"
                  >
                    <CalendarClock className="size-3.5" />
                    <span>Schedule release (optional)</span>
                  </Label>
                  <Input
                    id="social-schedule"
                    type="datetime-local"
                    value={draft.scheduledAt ?? ""}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        scheduledAt: e.target.value || null,
                      }))
                    }
                    className="h-9 rounded-xl text-[12px]"
                  />
                </div>

                {/* Per-Platform Copy Override */}
                <div className="rounded-2xl border border-border/80 bg-muted/25 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium text-foreground">
                        Tailor copy for {activeSpec.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Override master caption uniquely for {activeSpec.name}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="xs"
                      variant={customizePerApp || hasPerAppOverride ? "secondary" : "outline"}
                      onClick={() => {
                        if (hasPerAppOverride) {
                          setDraft((prev) => ({
                            ...prev,
                            platforms: {
                              ...prev.platforms,
                              [focusedPlatform]: {
                                ...prev.platforms[focusedPlatform],
                                customTitle: undefined,
                                customDescription: undefined,
                                customHashtags: undefined,
                              },
                            },
                          }));
                          setCustomizePerApp(false);
                        } else {
                          setCustomizePerApp((v) => !v);
                        }
                      }}
                      className="h-7 rounded-lg px-2.5 text-[11px]"
                    >
                      {hasPerAppOverride ? "Reset to master" : customizePerApp ? "Hide" : "Customize"}
                    </Button>
                  </div>

                  {customizePerApp || hasPerAppOverride ? (
                    <div className="mt-3 space-y-2.5 border-t border-border/60 pt-3">
                      {activeSpec.supportsTitle ? (
                        <Input
                          value={activeConfig.customTitle ?? draft.title}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              platforms: {
                                ...prev.platforms,
                                [focusedPlatform]: {
                                  ...prev.platforms[focusedPlatform],
                                  customTitle: e.target.value,
                                },
                              },
                            }))
                          }
                          placeholder={`${activeSpec.name} title`}
                          className="h-8 rounded-lg text-[12px]"
                        />
                      ) : null}
                      <Textarea
                        rows={2}
                        value={activeConfig.customDescription ?? draft.description}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            platforms: {
                              ...prev.platforms,
                              [focusedPlatform]: {
                                ...prev.platforms[focusedPlatform],
                                customDescription: e.target.value,
                              },
                            },
                          }))
                        }
                        placeholder={`${activeSpec.name} caption override…`}
                        className="rounded-lg text-[12px]"
                      />
                    </div>
                  ) : null}
                </div>

                {/* Connected Social Accounts */}
                <div className="space-y-2 rounded-2xl border border-border/80 bg-background/50 p-3">
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="font-medium text-foreground">Connected Accounts</span>
                    <span className="text-muted-foreground tabular-nums">
                      {enabledPlatforms.filter((id) => connectedSet.has(getSocialPlatform(id).connectorId)).length}/
                      {enabledPlatforms.length} signed in
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {enabledPlatforms.map((pid) => {
                      const spec = getSocialPlatform(pid);
                      const isConnected = connectedSet.has(spec.connectorId);
                      const accountLabel = connectedAccounts[spec.connectorId];
                      const avail = connectorAvailability?.[spec.connectorId];
                      const serverNeedsOAuth = avail ? !avail.connectable : false;
                      const res = lastRecord?.platforms.find((r) => r.platformId === pid);
                      const isSigningThis = signingInId === spec.connectorId;
                      return (
                        <div
                          key={pid}
                          className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-card/80 px-2.5 py-1.5 text-[11.5px]"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={`size-1.5 shrink-0 rounded-full ${
                                res?.status === "published" || isConnected
                                  ? "bg-emerald-500"
                                  : "bg-[color:var(--land-gold)]"
                              }`}
                            />
                            <span className="truncate font-medium text-foreground">{spec.name}</span>
                            <span className="truncate font-mono text-[10px] text-muted-foreground">
                              {res
                                ? res.status === "published"
                                  ? "Published"
                                  : res.status === "needs_credentials"
                                    ? "Sign in required"
                                    : "Attention"
                                : isConnected
                                  ? accountLabel || "Signed in"
                                  : serverNeedsOAuth
                                    ? "Setup pending"
                                    : "Not signed in"}
                            </span>
                          </div>
                          {res?.postUrl ? (
                            <a
                              href={res.postUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--land-gold)] hover:underline"
                            >
                              View <ExternalLink className="size-3" />
                            </a>
                          ) : !isConnected ? (
                            <button
                              type="button"
                              disabled={signingInId !== null}
                              onClick={() => void handleSignInPlatform(spec)}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/15 px-2.5 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-[color:var(--land-gold)]/25 disabled:opacity-55"
                            >
                              {isSigningThis ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Link2 className="size-3 text-[color:var(--land-gold)]" />
                              )}
                              <span>
                                {isSigningThis
                                  ? "Opening…"
                                  : serverNeedsOAuth
                                    ? "Setup"
                                    : "Sign in"}
                              </span>
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {statusNotice ? (
                  <div
                    role="status"
                    className="flex items-start gap-2 rounded-xl border border-[color:var(--land-gold)]/40 bg-[color:var(--land-gold)]/10 px-3 py-2 text-[12px] text-foreground"
                  >
                    {validation.ok ? (
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[color:var(--land-gold)]" />
                    ) : (
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-[color:var(--land-gold)]" />
                    )}
                    <span className="leading-snug">{statusNotice}</span>
                  </div>
                ) : null}
              </div>
            </ScrollArea>

            {/* Footer Dispatch Actions */}
            <footer className="flex items-center justify-between gap-2 border-t border-border/80 px-5 py-3.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={savingDraft || publishing}
                onClick={() => void handleSaveDraft()}
                className="h-9 rounded-full px-4 text-[12.5px]"
              >
                {savingDraft ? "Saving…" : "Save draft"}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={publishing || enabledPlatforms.length === 0}
                onClick={() => void handlePublishEverywhere()}
                className="h-9 gap-1.5 rounded-full bg-foreground px-5 text-[12.5px] font-medium text-background hover:opacity-90"
              >
                {publishing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5 text-[color:var(--land-gold)]" />
                )}
                <span>
                  {publishing
                    ? "Publishing…"
                    : `Publish to ${enabledPlatforms.length} platform${enabledPlatforms.length === 1 ? "" : "s"}`}
                </span>
              </Button>
            </footer>
          </div>
        </div>
      </DialogContent>
  );
}

/* ============================================================================
   RECREATED PER-PLATFORM LIVE FEED MOCKUPS
   ============================================================================ */

function PlatformFeedCard({
  platformId,
  framing,
  title,
  description,
  hashtags,
  mediaUrl,
  posterUrl,
  isVideo,
  muted,
  playing,
  compact = false,
  videoRef,
  onLoadedMetadata,
  onTimeUpdate,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onToggleMute,
  onTogglePlay,
}: {
  platformId: SocialPlatformId;
  framing: PlatformFramingConfig;
  title: string;
  description: string;
  hashtags: string;
  mediaUrl: string | null;
  posterUrl: string | null;
  isVideo: boolean;
  muted: boolean;
  playing: boolean;
  compact?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onLoadedMetadata?: (durationSec: number) => void;
  onTimeUpdate?: (currentTimeSec: number) => void;
  onPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp?: () => void;
  onToggleMute: () => void;
  onTogglePlay: () => void;
}) {
  const spec = getSocialPlatform(platformId);
  const fullCaption = [description.trim(), hashtags.trim()].filter(Boolean).join(" ") || title;

  const mediaStage = (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ aspectRatio: aspectNumericRatio(framing.aspectMode) }}
      className="relative w-full cursor-grab overflow-hidden bg-black select-none active:cursor-grabbing"
    >
      {isVideo && mediaUrl ? (
        <video
          ref={videoRef}
          src={mediaUrl}
          poster={posterUrl ?? undefined}
          muted={muted}
          loop
          playsInline
          autoPlay={playing}
          onLoadedMetadata={(e) => onLoadedMetadata?.(e.currentTarget.duration || 0)}
          onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime || 0)}
          style={{
            objectFit: framing.fit,
            objectPosition: `${50 + framing.panX}% ${50 + framing.panY}%`,
            transform: `scale(${framing.zoom})`,
          }}
          className="h-full w-full transition-transform duration-75"
        />
      ) : posterUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={posterUrl}
          alt={title}
          style={{
            objectFit: framing.fit,
            objectPosition: `${50 + framing.panX}% ${50 + framing.panY}%`,
            transform: `scale(${framing.zoom})`,
          }}
          className="h-full w-full"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#0c0c0f] text-xs text-white/55">
          Loading preview…
        </div>
      )}

      {/* Optional safe-zone reticle guides */}
      {framing.showSafeZones && (platformId === "tiktok" || (platformId === "instagram" && framing.aspectMode === "9:16") || (platformId === "youtube" && framing.aspectMode === "9:16")) ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-3 top-10 bottom-20 rounded-xl border border-dashed border-[color:var(--land-gold)]/45"
        />
      ) : null}

      {/* Center tap to play/pause overlay button */}
      {!playing && !compact && isVideo ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePlay();
          }}
          aria-label="Play video preview"
          className="absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/55 text-white backdrop-blur-md transition-transform hover:scale-105"
        >
          <Play className="ml-0.5 size-4 fill-current" />
        </button>
      ) : null}
    </div>
  );

  // 1. Vertical Fullscreen Overlay UIs: TikTok, IG Reels (9:16), YouTube Shorts (9:16)
  if (
    platformId === "tiktok" ||
    (platformId === "instagram" && framing.aspectMode === "9:16") ||
    (platformId === "youtube" && framing.aspectMode === "9:16")
  ) {
    const maxW = compact ? "max-w-[235px]" : "max-w-[295px]";
    return (
      <div
        className={`relative w-full ${maxW} overflow-hidden rounded-[26px] border border-white/15 bg-black text-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]`}
      >
        <div className={`relative w-full ${ASPECT_RATIO_CLASS[framing.aspectMode]}`}>
          {mediaStage}

          {/* Top bar */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center bg-gradient-to-b from-black/65 to-transparent px-4 pt-3 pb-6 text-[11px] font-medium">
            {platformId === "tiktok" ? (
              <div className="flex items-center gap-3">
                <span className="text-white/60">Following</span>
                <span className="relative text-white">
                  For You
                  <span className="mx-auto mt-0.5 block h-0.5 w-4 rounded-full bg-white" />
                </span>
              </div>
            ) : platformId === "instagram" ? (
              <div className="flex w-full items-center justify-between text-white">
                <span className="text-[12px] font-semibold">Reels</span>
                <span className="text-[10px] text-white/75">9:16</span>
              </div>
            ) : (
              <div className="flex w-full items-center justify-between text-white">
                <span className="text-[12px] font-semibold">Shorts</span>
                <span className="text-[10px] text-white/75">9:16</span>
              </div>
            )}
          </div>

          {/* Right Vertical Action Stack */}
          <div className="pointer-events-none absolute right-2.5 bottom-4 flex flex-col items-center gap-3 text-[10px] font-medium">
            {platformId === "tiktok" ? (
              <>
                <div className="relative mb-0.5 flex size-8 items-center justify-center rounded-full border border-white bg-white/15 text-[10px] font-semibold">
                  NC
                  <span className="absolute -bottom-1.5 flex size-3.5 items-center justify-center rounded-full bg-[#fe2c55] text-[9px] leading-none">
                    +
                  </span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Heart className="size-5 fill-white/90 text-white" />
                  <span>12.4K</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <MessageCircle className="size-5 text-white" />
                  <span>348</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Bookmark className="size-5 text-white" />
                  <span>912</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Share2 className="size-5 text-white" />
                  <span>184</span>
                </div>
              </>
            ) : platformId === "instagram" ? (
              <>
                <div className="flex flex-col items-center gap-0.5">
                  <Heart className="size-5 text-white" />
                  <span>8.2K</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <MessageCircle className="size-5 text-white" />
                  <span>214</span>
                </div>
                <Send className="size-5 text-white" />
                <MoreHorizontal className="size-4 text-white/90" />
              </>
            ) : (
              <>
                <div className="flex flex-col items-center gap-0.5">
                  <ThumbsUp className="size-5 text-white" />
                  <span>4.1K</span>
                </div>
                <ThumbsDown className="size-5 text-white/90" />
                <div className="flex flex-col items-center gap-0.5">
                  <MessageCircle className="size-5 text-white" />
                  <span>96</span>
                </div>
                <Share2 className="size-5 text-white" />
              </>
            )}
          </div>

          {/* Bottom Caption & Creator Overlay */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pt-10 pb-3.5 pr-12 text-left">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[12px] text-white">{spec.defaultHandle}</span>
              {platformId !== "tiktok" ? (
                <span className="rounded-full border border-white/45 px-2 py-0.5 text-[9.5px] font-medium">
                  {platformId === "youtube" ? "Subscribe" : "Follow"}
                </span>
              ) : null}
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-white/90">
              {fullCaption}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-white/75">
              <Music2 className="size-3 shrink-0" />
              <span className="truncate">Original sound · {title}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. YouTube 16:9 Watch Feed
  if (platformId === "youtube") {
    return (
      <div className="w-full max-w-[460px] overflow-hidden rounded-[20px] border border-border bg-card text-left shadow-lg">
        <div className="relative">
          {mediaStage}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-white/25">
            <div className="h-full w-1/3 bg-[#ff0033]" />
          </div>
        </div>
        <div className="space-y-2.5 p-3.5">
          <h4 className="line-clamp-2 text-[14px] leading-snug font-semibold text-foreground">
            {title || "Untitled release"}
          </h4>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background">
                NA
              </span>
              <div>
                <p className="text-[12px] font-medium text-foreground">{spec.defaultHandle}</p>
                <p className="text-[10.5px] text-muted-foreground">Creator channel</p>
              </div>
            </div>
            <span className="rounded-full bg-foreground px-3 py-1 text-[11px] font-medium text-background">
              Subscribe
            </span>
          </div>
          {fullCaption ? (
            <p className="line-clamp-2 rounded-xl bg-muted/50 px-2.5 py-2 text-[11.5px] text-muted-foreground">
              {fullCaption}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  // 3. Instagram 4:5 Feed Card
  if (platformId === "instagram") {
    return (
      <div className="w-full max-w-[340px] overflow-hidden rounded-[20px] border border-border bg-card text-left shadow-lg">
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full border border-[color:var(--land-gold)]/70 bg-muted text-[10px] font-semibold text-foreground">
              NA
            </span>
            <div>
              <p className="text-[12px] font-semibold text-foreground">{spec.defaultHandle}</p>
              <p className="text-[10px] text-muted-foreground">Original Audio</p>
            </div>
          </div>
          <MoreHorizontal className="size-4 text-muted-foreground" />
        </div>
        <div className="relative">
          {mediaStage}
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="absolute right-2.5 bottom-2.5 flex size-6 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur-sm"
          >
            {muted ? <VolumeX className="size-3" /> : <Volume2 className="size-3" />}
          </button>
        </div>
        <div className="space-y-1.5 p-3">
          <div className="flex items-center justify-between text-foreground">
            <div className="flex items-center gap-3.5">
              <Heart className="size-4.5" />
              <MessageCircle className="size-4.5" />
              <Send className="size-4.5" />
            </div>
            <Bookmark className="size-4.5" />
          </div>
          <p className="line-clamp-2 text-[11.5px] leading-snug text-foreground">
            <span className="font-semibold">{spec.defaultHandle} </span>
            <span className="text-muted-foreground">{fullCaption}</span>
          </p>
        </div>
      </div>
    );
  }

  // 4. X (Twitter) & LinkedIn Feed Cards
  const isX = platformId === "x";
  return (
    <div className="w-full max-w-[440px] overflow-hidden rounded-[20px] border border-border bg-card p-3.5 text-left shadow-lg">
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-[10.5px] font-semibold text-background">
          {spec.monogram}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <div className="min-w-0">
              <span className="font-semibold text-foreground">Nexus Atelier </span>
              <span className="text-muted-foreground">
                {isX ? `${spec.defaultHandle} · now` : "Creator Studio · Public"}
              </span>
            </div>
            {isX ? (
              <span
                className={`font-mono text-[10px] tabular-nums ${
                  fullCaption.length > 280 ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {fullCaption.length}/280
              </span>
            ) : null}
          </div>

          <p className="line-clamp-3 text-[12.5px] leading-snug text-foreground">
            {fullCaption}
          </p>

          <div className="overflow-hidden rounded-[14px] border border-border/80">
            {mediaStage}
          </div>

          <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
            {isX ? (
              <>
                <span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5" /> 14</span>
                <span className="inline-flex items-center gap-1"><Repeat2 className="size-3.5" /> 29</span>
                <span className="inline-flex items-center gap-1"><Heart className="size-3.5" /> 142</span>
                <span className="inline-flex items-center gap-1"><Bookmark className="size-3.5" /> 18</span>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1"><ThumbsUp className="size-3.5" /> Like</span>
                <span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5" /> Comment</span>
                <span className="inline-flex items-center gap-1"><Repeat2 className="size-3.5" /> Repost</span>
                <span className="inline-flex items-center gap-1"><Send className="size-3.5" /> Send</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
