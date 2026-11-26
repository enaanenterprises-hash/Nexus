"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";
import {
  Archive,
  BarChart3,
  Check,
  Download,
  ExternalLink,
  File as FileIcon,
  FileText,
  Film,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Mic,
  MoreHorizontal,
  Music,
  NotebookPen,
  Play,
  Plus,
  Search,
  Send,
  Share2,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { getSocialPlatform } from "@/lib/social/platforms";
import { getVaultActionsForItem, type VaultWorkflowAction } from "@/lib/storage/actions";
import {
  formatVaultBytes,
  formatVaultDuration,
  itemMatchesSpace,
  kindLabel,
  type VaultItem,
  type VaultItemKind,
  type VaultSpaceId,
} from "@/lib/storage/types";
import { resolveVaultItemBlob, useVault } from "@/lib/storage/vault-client";
import { SocialPublishStudio } from "./SocialPublishStudio";

const SPACES: ReadonlyArray<{
  id: VaultSpaceId;
  label: string;
  icon: typeof LayoutGrid;
}> = [
  { id: "all", label: "All files", icon: LayoutGrid },
  { id: "videos", label: "Videos & Exports", icon: Film },
  { id: "images", label: "Photos & Optics", icon: ImageIcon },
  { id: "audio", label: "Podcast & Audio", icon: Music },
  { id: "documents", label: "Notes & Docs", icon: NotebookPen },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "published", label: "Published", icon: Share2 },
  { id: "starred", label: "Starred", icon: Star },
];

type SortKey = "newest" | "name" | "size";

function VaultKindIcon({ kind, className }: { kind: VaultItemKind; className?: string }) {
  switch (kind) {
    case "video":
      return <Film className={className} />;
    case "audio":
      return <Music className={className} />;
    case "image":
      return <ImageIcon className={className} />;
    case "dataset":
      return <BarChart3 className={className} />;
    case "note":
      return <NotebookPen className={className} />;
    case "document":
      return <FileText className={className} />;
    case "archive":
      return <Archive className={className} />;
    default:
      return <FileIcon className={className} />;
  }
}

function provenanceLabel(item: VaultItem): string {
  const src = item.metadata.sourceNodeId;
  if (src === "dev.nexus.cinema") return "Cinema";
  if (src === "dev.nexus.optics") return "Optics";
  if (src === "dev.nexus.studio") return "Studio";
  return kindLabel(item.kind);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export function StorageVaultView({
  initialItemId = null,
  connectedConnectorIds = [],
  connectedAccounts = {},
  connectorAvailability,
  onOpenCinemaWithItem,
  onOpenStudioWithItem,
  onOpenOpticsWithItem,
  onOpenConnections,
}: {
  initialItemId?: string | null;
  connectedConnectorIds?: readonly string[];
  connectedAccounts?: Record<string, string>;
  connectorAvailability?: Record<string, { connectable: boolean; missing: string[] }>;
  onOpenCinemaWithItem?: (itemId: string) => void;
  onOpenStudioWithItem?: (itemId: string) => void;
  onOpenOpticsWithItem?: (itemId: string) => void;
  onOpenConnections?: (connectorId: string) => void;
}) {
  const vault = useVault();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeSpace, setActiveSpace] = useState<VaultSpaceId>("all");
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [selectedId, setSelectedId] = useState<string | null>(initialItemId);
  const [publishItem, setPublishItem] = useState<VaultItem | null>(null);
  const [draggingOver, setDraggingOver] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    item: VaultItem;
    x: number;
    y: number;
  } | null>(null);

  const effectiveSelected = useMemo(
    () => vault.items.find((i) => i.id === selectedId) ?? vault.items[0] ?? null,
    [vault.items, selectedId],
  );

  // Close floating context menu on Escape or click anywhere outside
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = vault.items.filter((item) => {
      if (activeFolderId !== null && item.folderId !== activeFolderId) return false;
      if (activeFolderId === null && !itemMatchesSpace(item, activeSpace)) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.kind.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q)) ||
        (item.metadata.socialDraft?.title?.toLowerCase().includes(q) ?? false)
      );
    });
    return [...list].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "size") return b.sizeBytes - a.sizeBytes;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [vault.items, activeFolderId, activeSpace, query, sortBy]);

  const totals = useMemo(() => {
    let total = 0;
    let video = 0;
    let audio = 0;
    let docs = 0;
    for (const item of vault.items) {
      total += item.sizeBytes;
      if (item.kind === "video") video += item.sizeBytes;
      else if (item.kind === "audio") audio += item.sizeBytes;
      else if (item.kind === "document" || item.kind === "note" || item.kind === "dataset") {
        docs += item.sizeBytes;
      }
    }
    const other = Math.max(0, total - video - audio - docs);
    return { total, video, audio, docs, other };
  }, [vault.items]);

  const handleUploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      setUploadingCount(arr.length);
      try {
        const added = await vault.uploadFiles(arr, activeFolderId ?? undefined);
        if (added[0]) setSelectedId(added[0].id);
        setNotice(
          `Added ${added.length} file${added.length === 1 ? "" : "s"} to Command Storage.`,
        );
      } finally {
        setUploadingCount(0);
      }
    },
    [vault, activeFolderId],
  );

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDraggingOver(false);
    if (e.dataTransfer.files?.length) {
      void handleUploadFiles(e.dataTransfer.files);
    }
  }

  async function runWorkflowAction(action: VaultWorkflowAction, item: VaultItem) {
    setContextMenu(null);
    switch (action.id) {
      case "core.social.publish":
        setPublishItem(item);
        return;
      case "dev.nexus.optics.open":
        if (onOpenOpticsWithItem) {
          onOpenOpticsWithItem(item.id);
        } else {
          setNotice("Switch to Optics in your workspace menu to edit this photograph.");
        }
        return;
      case "dev.nexus.cinema.open":
        if (onOpenCinemaWithItem) {
          onOpenCinemaWithItem(item.id);
        } else {
          setNotice("Switch to Cinema in your workspace menu to edit this file.");
        }
        return;
      case "dev.nexus.studio.open":
        if (onOpenStudioWithItem) {
          onOpenStudioWithItem(item.id);
        } else {
          setNotice("Switch to Recording Studio to open this audio asset.");
        }
        return;
      case "core.file.download": {
        const blob = await resolveVaultItemBlob(item);
        if (blob) {
          downloadBlob(blob, item.name);
        } else {
          setNotice("Binary payload unavailable in this browser session.");
        }
        return;
      }
      default:
        setNotice(`Triggered ${action.label} for ${item.name}.`);
    }
  }

  function openContextMenuFor(item: VaultItem, clientX: number, clientY: number) {
    const x = typeof window !== "undefined" ? Math.min(clientX, window.innerWidth - 252) : clientX;
    const y = typeof window !== "undefined" ? Math.min(clientY, window.innerHeight - 320) : clientY;
    setSelectedId(item.id);
    setContextMenu({ item, x: Math.max(12, x), y: Math.max(12, y) });
  }

  const folderName = activeFolderId
    ? vault.folders.find((f) => f.id === activeFolderId)?.name ?? "Folder"
    : SPACES.find((s) => s.id === activeSpace)?.label ?? "All files";

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!draggingOver) setDraggingOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDraggingOver(false);
        }
      }}
      onDrop={handleDrop}
      className="relative flex h-full min-h-0 flex-col bg-card text-card-foreground"
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void handleUploadFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Full-stage drop invitation overlay */}
      {draggingOver ? (
        <div className="pointer-events-none absolute inset-3 z-40 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[color:var(--land-gold)] bg-background/85 backdrop-blur-xl">
          <Upload className="size-7 text-[color:var(--land-gold)]" />
          <p className="mt-2 font-editorial text-xl text-foreground">
            Drop files into {folderName}
          </p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Videos, Studio audio, class notes, PDFs, or analytics CSVs
          </p>
        </div>
      ) : null}

      {/* Main Three-Column Finder Layout */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[224px_minmax(0,1fr)_316px] xl:grid-cols-[236px_minmax(0,1fr)_344px]">
        {/* 1. Left Rail: Smart Spaces, Folders & Quiet Storage Meter */}
        <aside className="hidden min-h-0 flex-col justify-between border-r border-border/80 bg-background/40 p-3.5 lg:flex">
          <ScrollArea className="min-h-0 flex-1 pr-1">
            <div className="space-y-5">
              {/* Smart Spaces */}
              <div className="space-y-0.5">
                <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">Spaces</p>
                {SPACES.map((sp) => {
                  const Icon = sp.icon;
                  const active = activeFolderId === null && activeSpace === sp.id;
                  const count = vault.items.filter((i) => itemMatchesSpace(i, sp.id)).length;
                  return (
                    <button
                      key={sp.id}
                      type="button"
                      onClick={() => {
                        setActiveFolderId(null);
                        setActiveSpace(sp.id);
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-[10px] px-2.5 py-1.5 text-[12.5px] transition-colors ${
                        active
                          ? "bg-muted font-medium text-foreground shadow-2xs"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon
                          className={`size-3.5 shrink-0 ${
                            active ? "text-[color:var(--land-gold)]" : ""
                          }`}
                        />
                        <span className="truncate">{sp.label}</span>
                      </span>
                      <span className="font-mono text-[10.5px] tabular-nums opacity-70">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Modular Folders */}
              <div className="space-y-0.5">
                <div className="flex items-center justify-between px-2 pb-1">
                  <p className="text-[11px] font-medium text-muted-foreground">Folders</p>
                  <button
                    type="button"
                    onClick={() => setNewFolderOpen((v) => !v)}
                    aria-label="New Storage folder"
                    className="rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <FolderPlus className="size-3.5" />
                  </button>
                </div>

                {newFolderOpen ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const clean = newFolderName.trim();
                      if (!clean) return;
                      void vault.createFolder(clean).then((created) => {
                        setActiveFolderId(created.id);
                        setNewFolderName("");
                        setNewFolderOpen(false);
                      });
                    }}
                    className="mb-2 flex gap-1.5 px-1"
                  >
                    <Input
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Folder name…"
                      className="h-7 rounded-lg text-[11.5px]"
                    />
                    <Button type="submit" size="xs" className="h-7 rounded-lg px-2 text-[11px]">
                      Add
                    </Button>
                  </form>
                ) : null}

                {vault.folders.map((folder) => {
                  const active = activeFolderId === folder.id;
                  const count = vault.items.filter((i) => i.folderId === folder.id).length;
                  return (
                    <div key={folder.id} className="group flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setActiveFolderId(folder.id)}
                        className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-[10px] px-2.5 py-1.5 text-[12.5px] transition-colors ${
                          active
                            ? "bg-muted font-medium text-foreground shadow-2xs"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Folder
                            className={`size-3.5 shrink-0 ${
                              active ? "text-[color:var(--land-gold)]" : ""
                            }`}
                          />
                          <span className="truncate">{folder.name}</span>
                        </span>
                        <span className="font-mono text-[10.5px] tabular-nums opacity-70">
                          {count}
                        </span>
                      </button>
                      {!folder.system ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (activeFolderId === folder.id) setActiveFolderId(null);
                            void vault.deleteFolder(folder.id);
                          }}
                          aria-label={`Delete folder ${folder.name}`}
                          className="rounded-md p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>

          {/* Quiet Storage Capacity & Type Breakdown */}
          <div className="mt-3 space-y-2 rounded-2xl border border-border/75 bg-card/70 p-3">
            <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
              <span className="font-medium text-foreground">Vault footprint</span>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {formatVaultBytes(totals.total)}
              </span>
            </div>
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-foreground/10" aria-hidden>
              {totals.total > 0 ? (
                <>
                  <div
                    className="h-full bg-[color:var(--land-gold)]"
                    style={{ width: `${(totals.video / totals.total) * 100}%` }}
                  />
                  <div
                    className="h-full bg-foreground/75"
                    style={{ width: `${(totals.audio / totals.total) * 100}%` }}
                  />
                  <div
                    className="h-full bg-foreground/40"
                    style={{ width: `${(totals.docs / totals.total) * 100}%` }}
                  />
                </>
              ) : null}
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
              <span>{vault.items.length} items</span>
              <span>Video · Audio · Docs</span>
            </div>
          </div>
        </aside>

        {/* 2. Center Gallery / List Stage */}
        <div className="flex min-h-0 flex-col">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/80 px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <h2 className="font-editorial truncate text-[1.35rem] leading-none font-medium tracking-[-0.02em] text-foreground">
                {folderName}
              </h2>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {filteredItems.length}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Mobile space selector */}
              <div className="lg:hidden">
                <Select
                  value={activeFolderId ?? activeSpace}
                  onValueChange={(v) => {
                    if (!v) return;
                    if (SPACES.some((s) => s.id === v)) {
                      setActiveFolderId(null);
                      setActiveSpace(v as VaultSpaceId);
                    } else {
                      setActiveFolderId(v);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 rounded-full text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPACES.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                    {vault.folders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        Folder · {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="relative w-44 sm:w-56">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search vault…"
                  aria-label="Search Command Storage"
                  className="cmd-field h-8 w-full rounded-full pr-7 pl-8 text-[12px]"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </div>

              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                <SelectTrigger className="h-8 w-26 rounded-full text-[11.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="size">Largest</SelectItem>
                </SelectContent>
              </Select>

              <div className="inline-flex rounded-full border border-border/80 bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  aria-label="Grid view"
                  aria-pressed={viewMode === "grid"}
                  className={`rounded-full p-1.5 transition-colors ${
                    viewMode === "grid"
                      ? "bg-card text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <LayoutGrid className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  aria-label="List view"
                  aria-pressed={viewMode === "list"}
                  className={`rounded-full p-1.5 transition-colors ${
                    viewMode === "list"
                      ? "bg-card text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <List className="size-3.5" />
                </button>
              </div>

              <Button
                type="button"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="h-8 gap-1.5 rounded-full bg-foreground px-3.5 text-[12px] font-medium text-background hover:opacity-90"
              >
                <Plus className="size-3.5" />
                <span>{uploadingCount > 0 ? `Adding ${uploadingCount}…` : "Upload"}</span>
              </Button>
            </div>
          </div>

          {notice ? (
            <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-[color:var(--land-gold)]/10 px-4 py-2 text-[12px] text-foreground">
              <span>{notice}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Dismiss notice"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}

          <ScrollArea className="min-h-0 flex-1">
            {filteredItems.length === 0 ? (
              <div className="mx-auto flex max-w-md flex-col items-center justify-center px-6 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-muted/40 text-muted-foreground">
                  <Upload className="size-5 text-[color:var(--land-gold)]" />
                </div>
                <p className="mt-4 font-editorial text-xl font-medium text-foreground">
                  {query ? "Nothing matched that filter" : "Your Command Storage is ready"}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  Export videos from Cinema, save podcast mixes from Recording Studio, or drop
                  notes, datasets, and files here. Right-click any video to stage &amp; publish
                  across every social feed at once.
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 h-9 gap-1.5 rounded-full bg-foreground px-4 text-[12.5px] font-medium text-background hover:opacity-90"
                >
                  <Plus className="size-3.5" />
                  <span>Add files to vault</span>
                </Button>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-3.5 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
                {filteredItems.map((item) => (
                  <VaultGridCard
                    key={item.id}
                    item={item}
                    selected={effectiveSelected?.id === item.id}
                    onSelect={() => setSelectedId(item.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      openContextMenuFor(item, e.clientX, e.clientY);
                    }}
                    onMenuButtonClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      openContextMenuFor(item, rect.left - 180, rect.bottom + 6);
                    }}
                    onPublish={() => setPublishItem(item)}
                  />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-border/60 px-4 py-2 sm:px-5">
                {filteredItems.map((item) => {
                  const selected = effectiveSelected?.id === item.id;
                  const publishedCount =
                    item.metadata.publishHistory?.reduce(
                      (acc, r) => acc + r.platforms.filter((p) => p.status === "published").length,
                      0,
                    ) ?? 0;
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(item.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        openContextMenuFor(item, e.clientX, e.clientY);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(item.id);
                        }
                      }}
                      className={`group flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                        selected ? "bg-muted/80" : "hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-border/70 bg-muted">
                          {item.thumbnailDataUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={item.thumbnailDataUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <VaultKindIcon kind={item.kind} className="size-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-foreground">
                            {item.name}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground tabular-nums">
                            {provenanceLabel(item)} · {formatVaultBytes(item.sizeBytes)}
                            {item.metadata.durationMs
                              ? ` · ${formatVaultDuration(item.metadata.durationMs)}`
                              : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {publishedCount > 0 ? (
                          <Badge
                            variant="outline"
                            className="h-5 border-[color:var(--land-gold)]/45 text-[10px] text-[color:var(--land-gold)]"
                          >
                            {publishedCount} live
                          </Badge>
                        ) : null}
                        {(item.kind === "video" || item.kind === "image") ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPublishItem(item);
                            }}
                            className="h-7 gap-1 rounded-full px-2.5 text-[11px] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                          >
                            <Send className="size-3 text-[color:var(--land-gold)]" />
                            <span>Publish</span>
                          </Button>
                        ) : null}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            openContextMenuFor(item, rect.left - 180, rect.bottom + 6);
                          }}
                          aria-label={`Actions for ${item.name}`}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* 3. Right Quick-Look Inspector */}
        <aside className="hidden min-h-0 flex-col border-l border-border/80 bg-background/35 lg:flex">
          {effectiveSelected ? (
            <VaultQuickLook
              key={effectiveSelected.id}
              item={effectiveSelected}
              folders={vault.folders}
              onRunAction={(action) => void runWorkflowAction(action, effectiveSelected)}
              onUpdate={(patch) => void vault.updateItem(effectiveSelected.id, patch)}
              onDelete={() => {
                void vault.deleteItem(effectiveSelected.id);
                setSelectedId(null);
              }}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-[12.5px] text-muted-foreground">
              <p>Select any item to preview media, inspect metadata, or run Nexus workflows.</p>
            </div>
          )}
        </aside>
      </div>

      {/* Floating Liquid Glass Right-Click / Overflow Context Menu */}
      {contextMenu ? (
        <div
          role="menu"
          aria-label={`Actions for ${contextMenu.item.name}`}
          onClick={(e) => e.stopPropagation()}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-50 w-60 rounded-2xl border border-border bg-popover/95 p-1.5 text-popover-foreground shadow-2xl backdrop-blur-2xl"
        >
          <div className="truncate px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">
            {contextMenu.item.name}
          </div>
          <Separator className="my-1" />

          {getVaultActionsForItem(contextMenu.item).map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              onClick={() => void runWorkflowAction(action, contextMenu.item)}
              className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12.5px] transition-colors ${
                action.emphasis === "gold"
                  ? "bg-[color:var(--land-gold)]/12 font-medium text-foreground hover:bg-[color:var(--land-gold)]/22"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              {action.id === "core.social.publish" ? (
                <Sparkles className="size-3.5 text-[color:var(--land-gold)]" />
              ) : action.id === "core.file.download" ? (
                <Download className="size-3.5 text-muted-foreground" />
              ) : action.id === "dev.nexus.studio.open" ? (
                <Mic className="size-3.5 text-muted-foreground" />
              ) : (
                <Film className="size-3.5 text-muted-foreground" />
              )}
              <span>{action.label}</span>
            </button>
          ))}

          <Separator className="my-1" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void vault.updateItem(contextMenu.item.id, { starred: !contextMenu.item.starred });
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12.5px] text-foreground hover:bg-muted"
          >
            <Star
              className={`size-3.5 ${
                contextMenu.item.starred ? "fill-[color:var(--land-gold)] text-[color:var(--land-gold)]" : "text-muted-foreground"
              }`}
            />
            <span>{contextMenu.item.starred ? "Remove star" : "Star file"}</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void vault.deleteItem(contextMenu.item.id);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12.5px] text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-3.5" />
            <span>Delete from Storage</span>
          </button>
        </div>
      ) : null}

      <SocialPublishStudio
        open={Boolean(publishItem)}
        onOpenChange={(next) => {
          if (!next) setPublishItem(null);
        }}
        item={publishItem}
        connectedConnectorIds={connectedConnectorIds}
        connectedAccounts={connectedAccounts}
        connectorAvailability={connectorAvailability}
        onOpenConnections={onOpenConnections}
        onPublished={() => setNotice("Updated social publishing status in Command Storage.")}
      />
    </div>
  );
}

/* ============================================================================
   GALLERY GRID CARD (Video Hover-Play, Audio Waveform, Notes & Analytics)
   ============================================================================ */

function VaultGridCard({
  item,
  selected,
  onSelect,
  onContextMenu,
  onMenuButtonClick,
  onPublish,
}: {
  item: VaultItem;
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (e: MouseEvent<HTMLDivElement>) => void;
  onMenuButtonClick: (e: MouseEvent<HTMLButtonElement>) => void;
  onPublish: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [hoverVideoUrl, setHoverVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hovered || item.kind !== "video") return;
    let alive = true;
    let url: string | null = null;
    void resolveVaultItemBlob(item).then((blob) => {
      if (!alive || !blob) return;
      url = URL.createObjectURL(blob);
      setHoverVideoUrl(url);
    });
    return () => {
      alive = false;
      setHoverVideoUrl(null);
      if (url) URL.revokeObjectURL(url);
    };
  }, [hovered, item]);

  const publishedResults = item.metadata.publishHistory?.[0]?.platforms ?? [];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group flex flex-col overflow-hidden rounded-[16px] border p-2.5 text-left transition-all ${
        selected
          ? "border-[color:var(--land-gold)]/70 bg-muted/65 ring-1 ring-[color:var(--land-gold)]/25"
          : "border-border/80 bg-background/55 hover:border-border hover:bg-muted/35"
      }`}
    >
      {/* Concentric 10px Inner Media Surface */}
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[10px] border border-border/60 bg-[#0b0b0e]">
        {item.kind === "video" ? (
          hoverVideoUrl ? (
            <video
              src={hoverVideoUrl}
              muted
              loop
              autoPlay
              playsInline
              className="h-full w-full object-cover"
            />
          ) : item.thumbnailDataUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={item.thumbnailDataUrl}
              alt={item.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/40">
              <Film className="size-7" />
            </div>
          )
        ) : item.kind === "image" && item.thumbnailDataUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.thumbnailDataUrl}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        ) : item.kind === "audio" ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-[#131317] to-[#0a0a0c] px-4">
            <div className="flex h-10 w-full items-center justify-center gap-[3px]">
              {(item.metadata.peaks?.length
                ? item.metadata.peaks.slice(0, 32)
                : [0.3, 0.7, 0.5, 0.9, 0.6, 0.4, 0.85, 0.55, 0.72, 0.45, 0.8, 0.35, 0.6, 0.5, 0.75, 0.4]
              ).map((pk, idx) => (
                <span
                  key={idx}
                  className="w-[3px] rounded-full bg-[color:var(--land-gold)]"
                  style={{ height: `${Math.max(16, Math.round(pk * 100))}%`, opacity: 0.75 }}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-full w-full flex-col justify-between bg-card/90 p-3 text-card-foreground">
            <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
              <span>{kindLabel(item.kind).toUpperCase()}</span>
              {item.metadata.rowCount !== undefined ? (
                <span>{item.metadata.rowCount} rows</span>
              ) : item.metadata.wordCount !== undefined ? (
                <span>{item.metadata.wordCount} words</span>
              ) : null}
            </div>
            {item.metadata.excerpt ? (
              <p className="line-clamp-3 font-mono text-[10px] leading-snug text-muted-foreground">
                {item.metadata.excerpt}
              </p>
            ) : (
              <VaultKindIcon kind={item.kind} className="size-5 text-muted-foreground/60" />
            )}
          </div>
        )}

        {/* Provenance & Duration Overlay Badges */}
        <span className="absolute top-2 left-2 rounded-full border border-white/15 bg-black/65 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-md">
          {provenanceLabel(item)}
        </span>

        {item.metadata.durationMs ? (
          <span className="absolute right-2 bottom-2 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-white tabular-nums backdrop-blur-sm">
            {formatVaultDuration(item.metadata.durationMs)}
          </span>
        ) : null}

        <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
          {(item.kind === "video" || item.kind === "image") ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPublish();
              }}
              aria-label={`Publish ${item.name} to social media`}
              className="flex h-7 items-center gap-1 rounded-full border border-white/20 bg-black/70 px-2 text-[10.5px] font-medium text-white opacity-0 backdrop-blur-md transition-opacity hover:border-[color:var(--land-gold)] group-hover:opacity-100 focus-visible:opacity-100"
            >
              <Send className="size-2.5 text-[color:var(--land-gold)]" />
              <span>Post</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onMenuButtonClick}
            aria-label={`More actions for ${item.name}`}
            className="flex size-7 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Metadata Strip */}
      <div className="mt-2.5 flex items-start justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-foreground">{item.name}</p>
          <p className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground tabular-nums">
            {formatVaultBytes(item.sizeBytes)}
            {item.metadata.width && item.metadata.height
              ? ` · ${item.metadata.width}×${item.metadata.height}`
              : ""}
          </p>
        </div>
        {item.starred ? (
          <Star className="mt-0.5 size-3.5 shrink-0 fill-[color:var(--land-gold)] text-[color:var(--land-gold)]" />
        ) : null}
      </div>

      {publishedResults.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1 px-0.5">
          {publishedResults.map((res) => (
            <span
              key={res.platformId}
              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9.5px] font-medium ${
                res.status === "published"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-border/80 bg-muted/40 text-muted-foreground"
              }`}
            >
              {getSocialPlatform(res.platformId).monogram}
              {res.status === "published" ? <Check className="size-2.5" /> : null}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ============================================================================
   RIGHT QUICK-LOOK INSPECTOR (Playable Player + Tags + Workflow Actions)
   ============================================================================ */

function VaultQuickLook({
  item,
  folders,
  onRunAction,
  onUpdate,
  onDelete,
}: {
  item: VaultItem;
  folders: ReturnType<typeof useVault>["folders"];
  onRunAction: (action: VaultWorkflowAction) => void;
  onUpdate: (patch: Parameters<ReturnType<typeof useVault>["updateItem"]>[1]) => void;
  onDelete: () => void;
}) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(item.name);
  const [tagDraft, setTagDraft] = useState("");
  const actions = useMemo(() => getVaultActionsForItem(item), [item]);

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    if (item.kind === "video" || item.kind === "audio" || item.kind === "image") {
      void resolveVaultItemBlob(item).then((blob) => {
        if (!alive || !blob) return;
        url = URL.createObjectURL(blob);
        setMediaUrl(url);
      });
    }
    return () => {
      alive = false;
      setMediaUrl(null);
      if (url) URL.revokeObjectURL(url);
    };
  }, [item]);

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-5 p-4">
        {/* Live Media Stage */}
        <div className="overflow-hidden rounded-[14px] border border-border/80 bg-[#0a0a0d]">
          {item.kind === "video" && mediaUrl ? (
            <video
              src={mediaUrl}
              poster={item.thumbnailDataUrl ?? undefined}
              controls
              playsInline
              className="aspect-video w-full bg-black object-contain"
            />
          ) : item.kind === "audio" && mediaUrl ? (
            <div className="space-y-3 p-4">
              <div className="flex items-center gap-2 text-[12px] text-white/80">
                <Play className="size-3.5 text-[color:var(--land-gold)]" />
                <span className="truncate font-medium">{item.name}</span>
              </div>
              <audio src={mediaUrl} controls className="w-full" />
            </div>
          ) : item.kind === "image" && (mediaUrl || item.thumbnailDataUrl) ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={mediaUrl ?? item.thumbnailDataUrl!}
              alt={item.name}
              className="max-h-56 w-full object-contain"
            />
          ) : (
            <div className="p-4 text-[12px] text-white/75">
              <p className="font-mono text-[10.5px] uppercase text-white/50">
                {kindLabel(item.kind)} · {formatVaultBytes(item.sizeBytes)}
              </p>
              {item.metadata.excerpt ? (
                <pre className="mt-2 max-h-40 overflow-hidden font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-white/80">
                  {item.metadata.excerpt}
                </pre>
              ) : (
                <p className="mt-2 text-white/55">Ready inside Command Storage.</p>
              )}
            </div>
          )}
        </div>

        {/* Modular Workflow Action Triggers */}
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">Workflows</p>
          <div className="space-y-1.5">
            {actions.map((action) => (
              <Button
                key={action.id}
                type="button"
                variant={action.emphasis === "gold" ? "default" : "outline"}
                onClick={() => onRunAction(action)}
                className={
                  action.emphasis === "gold"
                    ? "h-9 w-full justify-between rounded-xl bg-foreground px-3.5 text-[12.5px] font-medium text-background hover:opacity-90"
                    : "h-8 w-full justify-between rounded-xl px-3 text-[12px]"
                }
              >
                <span className="flex items-center gap-2">
                  {action.emphasis === "gold" ? (
                    <Sparkles className="size-3.5 text-[color:var(--land-gold)]" />
                  ) : null}
                  <span>{action.label}</span>
                </span>
                <span className="text-[10.5px] opacity-65">→</span>
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Editable Name, Folder & Tags */}
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">File name</p>
            <Input
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={() => {
                const clean = editingName.trim();
                if (clean && clean !== item.name) onUpdate({ name: clean });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
              className="h-8 rounded-xl text-[12.5px]"
            />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">Folder</p>
              <Select
                value={item.folderId ?? "__none__"}
                onValueChange={(v) =>
                  onUpdate({ folderId: v === "__none__" ? null : v })
                }
              >
                <SelectTrigger className="h-8 rounded-xl text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unfiled</SelectItem>
                  {folders.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              onClick={() => onUpdate({ starred: !item.starred })}
              aria-label={item.starred ? "Unstar item" : "Star item"}
              className="size-8 rounded-xl"
            >
              <Star
                className={`size-3.5 ${
                  item.starred ? "fill-[color:var(--land-gold)] text-[color:var(--land-gold)]" : ""
                }`}
              />
            </Button>
          </div>

          <div className="space-y-1.5">
            <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Tag className="size-3" />
              <span>Tags</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-muted/40 px-2 py-0.5 text-[11px] text-foreground"
                >
                  <span>#{tag}</span>
                  <button
                    type="button"
                    onClick={() => onUpdate({ tags: item.tags.filter((t) => t !== tag) })}
                    aria-label={`Remove tag ${tag}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-2.5" />
                  </button>
                </span>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const clean = tagDraft.trim().replace(/^#/, "");
                if (!clean || item.tags.includes(clean)) return;
                onUpdate({ tags: [...item.tags, clean] });
                setTagDraft("");
              }}
              className="flex gap-1.5"
            >
              <Input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                placeholder="Add tag…"
                className="h-7 rounded-lg text-[11.5px]"
              />
              <Button type="submit" size="xs" variant="outline" className="h-7 rounded-lg px-2.5 text-[11px]">
                Add
              </Button>
            </form>
          </div>
        </div>

        {/* Technical Metadata Ledger */}
        <div className="space-y-1.5 rounded-2xl border border-border/75 bg-card/65 p-3 text-[11.5px]">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Type</span>
            <span className="font-mono text-foreground">{item.mimeType}</span>
          </div>
          <div className="flex justify-between gap-2 tabular-nums">
            <span className="text-muted-foreground">Size</span>
            <span className="font-mono text-foreground">{formatVaultBytes(item.sizeBytes)}</span>
          </div>
          {item.metadata.width && item.metadata.height ? (
            <div className="flex justify-between gap-2 tabular-nums">
              <span className="text-muted-foreground">Dimensions</span>
              <span className="font-mono text-foreground">
                {item.metadata.width}×{item.metadata.height}
              </span>
            </div>
          ) : null}
          {item.metadata.durationMs ? (
            <div className="flex justify-between gap-2 tabular-nums">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-mono text-foreground">
                {formatVaultDuration(item.metadata.durationMs)}
              </span>
            </div>
          ) : null}
          {item.metadata.columns?.length ? (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Columns</span>
              <span className="truncate font-mono text-foreground">
                {item.metadata.columns.slice(0, 4).join(", ")}
              </span>
            </div>
          ) : null}
        </div>

        {item.metadata.publishHistory?.length ? (
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground">Recent social dispatches</p>
            {item.metadata.publishHistory.slice(0, 2).map((rec) => (
              <div
                key={rec.jobId}
                className="space-y-1 rounded-xl border border-border/75 bg-card/70 p-2.5 text-[11px]"
              >
                <p className="truncate font-medium text-foreground">{rec.title}</p>
                <div className="flex flex-wrap gap-1.5">
                  {rec.platforms.map((p) => (
                    <span key={p.platformId} className="inline-flex items-center gap-1 text-muted-foreground">
                      <span>{getSocialPlatform(p.platformId).name}:</span>
                      <span
                        className={
                          p.status === "published" ? "text-emerald-400" : "text-[color:var(--land-gold)]"
                        }
                      >
                        {p.status}
                      </span>
                      {p.postUrl ? (
                        <a href={p.postUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="size-2.5" />
                        </a>
                      ) : null}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={onDelete}
          className="h-8 w-full justify-center gap-1.5 rounded-xl text-[11.5px] text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
          <span>Delete from Storage</span>
        </Button>
      </div>
    </ScrollArea>
  );
}
