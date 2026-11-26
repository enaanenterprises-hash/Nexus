"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Contrast,
  Eye,
  Film,
  FolderOpen,
  HardDrive,
  ImagePlus,
  Layers,
  PanelRight,
  Redo2,
  Search,
  Share2,
  SlidersHorizontal,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { SocialPublishStudio } from "@/components/storage/SocialPublishStudio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OPTICS_NODE_ID } from "@/extensions/optics/node";
import { commandApi } from "@/components/command/command-client";
import type { ExtensionHubSnapshot } from "@/lib/extensions";
import { nexusBus } from "@/lib/extensions";
import { clamp, computeHistogram } from "@/lib/optics/color-math";
import {
  BUILTIN_LOOKS,
  deleteCustomLook,
  readCustomLooks,
  saveCustomLook,
} from "@/lib/optics/looks";
import {
  buildStarterOpticsProject,
  deleteOpticsProjectClient,
  fetchOpticsDatabaseStatus,
  getOpticsProjectClient,
  listOpticsCollectionsClient,
  listOpticsProjectsClient,
  saveOpticsProjectClient,
} from "@/lib/optics/optics-client";
import {
  decodeBlobToImageElement,
  loadOpticsBlob,
  saveOpticsBlob,
} from "@/lib/optics/optics-db";
import { toOpticsProjectEnvelope } from "@/lib/optics/optics-envelope";
import {
  evaluateEditStack,
  exportBufferToBlob,
  imageSourceToBuffer,
} from "@/lib/optics/processors/engine";
import {
  computeAutoTuneParams,
  computeAutoWhiteBalance,
  solveNeutralWhiteBalance,
  type ImageBuffer,
} from "@/lib/optics/processors/tonal";
import { createDefaultToolParams, getToolMeta } from "@/lib/optics/tools-meta";
import type {
  OpticsCollection,
  OpticsCompareMode,
  OpticsDoubleExposureParams,
  OpticsEditLayer,
  OpticsHistogram,
  OpticsLookPreset,
  OpticsMatteMode,
  OpticsProject,
  OpticsProjectSummary,
  OpticsToolId,
  OpticsToolParamMap,
  OpticsWhiteBalanceParams,
} from "@/lib/optics/types";
import type { VaultItem } from "@/lib/storage/types";
import { resolveVaultItemBlob, saveBlobToVault, useVault } from "@/lib/storage/vault-client";
import { OpticsApertureReveal } from "./OpticsApertureReveal";
import { OpticsDock, type OpticsDockTab } from "./OpticsDock";
import { OpticsExportDialog } from "./OpticsExportDialog";
import { OpticsImportModal, type OpticsImportedImage } from "./OpticsImportModal";
import { OpticsInspector, type OpticsInspectorTab } from "./OpticsInspector";
import { OpticsStage, type ActiveScrubHudState } from "./OpticsStage";

function makeLayerId(toolId: OpticsToolId): string {
  return `lyr-${toolId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const MATTE_CYCLE: readonly OpticsMatteMode[] = ["auto", "obsidian", "grey", "paper"];

function matteLabel(mode: OpticsMatteMode): string {
  switch (mode) {
    case "auto":
      return "Theme Matte";
    case "obsidian":
      return "Obsidian";
    case "grey":
      return "18% Lab Grey";
    case "paper":
      return "Gallery Paper";
  }
}

export function OpticsView({
  hub,
  visible,
  incomingVaultItem,
  onClose,
  onReleaseNode,
  onOpenCommandStorage,
  onOpenCommandConnections,
  onSendPlateToCinema,
}: {
  hub: ExtensionHubSnapshot;
  visible: boolean;
  incomingVaultItem?: { itemId: string; serial: number } | null;
  onClose: () => void;
  onReleaseNode: () => void;
  onOpenCommandStorage?: (itemId?: string) => void;
  onOpenCommandConnections?: (connectorId?: string) => void;
  onSendPlateToCinema?: (vaultItem: VaultItem, blob: Blob, width: number, height: number) => void;
}) {
  const vault = useVault();
  const [apertureKey, setApertureKey] = useState(1);
  const [databaseConfigured, setDatabaseConfigured] = useState(false);
  const [collections, setCollections] = useState<OpticsCollection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState("");
  const [summaries, setSummaries] = useState<OpticsProjectSummary[]>([]);
  const [project, setProject] = useState<OpticsProject>(() =>
    buildStarterOpticsProject("local-optics-darkroom", "alpine-alpenglow"),
  );
  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const [undoStack, setUndoStack] = useState<OpticsProject[]>([]);
  const [redoStack, setRedoStack] = useState<OpticsProject[]>([]);

  // Decoded pixel buffers (preview resolution <= 1360px for 60fps interaction)
  const [sourcePreview, setSourcePreview] = useState<ImageBuffer | null>(null);
  const [renderedPreview, setRenderedPreview] = useState<ImageBuffer | null>(null);
  const [overlayBuffers, setOverlayBuffers] = useState<Map<string, ImageBuffer>>(() => new Map());
  const upstreamCacheRef = useRef<{ key: string; buffer: ImageBuffer } | null>(null);
  const sourceBlobRef = useRef<Blob | null>(null);

  // Studio UI State
  const [dockTab, setDockTab] = useState<OpticsDockTab>("tools");
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [activeParamIndex, setActiveParamIndex] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<OpticsInspectorTab>("adjust");
  const [compareMode, setCompareMode] = useState<OpticsCompareMode>("off");
  const [splitPos, setSplitPos] = useState(0.5);
  const [loupeEnabled, setLoupeEnabled] = useState(false);
  const [zoomMode, setZoomMode] = useState<"fit" | 0.5 | 1 | 2>("fit");
  const [scrubHud, setScrubHud] = useState<ActiveScrubHudState | null>(null);
  const [customLooks, setCustomLooks] = useState<OpticsLookPreset[]>(() => readCustomLooks());

  // Contextual tool modes
  const [eyedropperArmed, setEyedropperArmed] = useState(false);
  const [selectiveAddArmed, setSelectiveAddArmed] = useState(false);
  const [maskingLayerId, setMaskingLayerId] = useState<string | null>(null);
  const [maskBrushStrength, setMaskBrushStrength] = useState<0 | 25 | 50 | 75 | 100>(0);
  const [maskBrushSize, setMaskBrushSize] = useState(34);

  // Drawers & Modals
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [importModalMode, setImportModalMode] = useState<"source" | "overlay" | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [publishItem, setPublishItem] = useState<VaultItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | undefined>(undefined);

  // Command social connection state for direct SocialPublishStudio integration
  const [connectedConnectors, setConnectedConnectors] = useState<string[]>([]);
  const [connectedAccounts, setConnectedAccounts] = useState<Record<string, string>>({});
  const [connectorAvailability, setConnectorAvailability] = useState<
    Record<string, { connectable: boolean; missing: string[] }>
  >({});

  const handledVaultSerialRef = useRef(0);
  const wasVisibleRef = useRef(visible);

  // Sync SSR-safe mobile breakpoint listener; collapse bottom sheet automatically on first mobile mount
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = (initial = false) => {
      setIsMobileLayout(mq.matches);
      if (initial && mq.matches) setInspectorOpen(false);
    };
    const frame = window.requestAnimationFrame(() => sync(true));
    const onChange = () => sync(false);
    mq.addEventListener("change", onChange);
    return () => {
      window.cancelAnimationFrame(frame);
      mq.removeEventListener("change", onChange);
    };
  }, []);

  // Re-trigger majestic optical iris opening when transitioning from hidden -> visible
  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      const id = window.requestAnimationFrame(() => setApertureKey((k) => k + 1));
      wasVisibleRef.current = true;
      return () => window.cancelAnimationFrame(id);
    }
    wasVisibleRef.current = visible;
  }, [visible]);

  const flash = useCallback((text: string) => {
    setNotice(text);
    window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 4200);
  }, []);

  // Boot storage collections & latest project
  useEffect(() => {
    let alive = true;
    void (async () => {
      const dbOk = await fetchOpticsDatabaseStatus();
      if (!alive) return;
      setDatabaseConfigured(dbOk);
      const cols = await listOpticsCollectionsClient(dbOk);
      if (!alive) return;
      setCollections(cols);
      const firstColId = cols[0]?.id ?? "local-optics-darkroom";
      setActiveCollectionId(firstColId);
      const list = await listOpticsProjectsClient(dbOk, firstColId);
      if (!alive) return;
      setSummaries(list);
      if (list[0]) {
        const loaded = await getOpticsProjectClient(dbOk, list[0].id);
        if (loaded && alive) setProject(loaded);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Refresh social connectors whenever visible or export/publish opens
  useEffect(() => {
    if (!visible && !publishItem) return;
    let alive = true;
    void commandApi
      .state()
      .then((s) => {
        if (!alive) return;
        const okConns = s.connections.filter((c) => c.status === "ok" && c.hasCredentials);
        setConnectedConnectors(okConns.map((c) => c.connectorId));
        const accounts: Record<string, string> = {};
        for (const c of okConns) {
          const label = c.settings?.["accountLabel"]?.trim();
          if (label) accounts[c.connectorId] = label;
        }
        setConnectedAccounts(accounts);
        setConnectorAvailability(s.availability);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [publishItem, visible]);

  // Hydrate source plate blob -> preview ImageBuffer whenever source key changes
  useEffect(() => {
    let alive = true;
    upstreamCacheRef.current = null;
    void (async () => {
      let blob = await loadOpticsBlob(project.source.idbKey);
      if (!blob && project.source.vaultItemId) {
        const vItem = vault.items.find((it) => it.id === project.source.vaultItemId);
        if (vItem) blob = await resolveVaultItemBlob(vItem);
      }
      if (!blob) {
        blob = await loadOpticsBlob("starter:alpine-alpenglow");
      }
      if (!blob || !alive) return;
      sourceBlobRef.current = blob;
      const img = await decodeBlobToImageElement(blob);
      if (!alive) return;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setProject((prev) =>
          prev.source.idbKey === project.source.idbKey &&
          prev.source.source === "starter" &&
          (prev.width !== img.naturalWidth || prev.height !== img.naturalHeight)
            ? {
                ...prev,
                width: img.naturalWidth,
                height: img.naturalHeight,
                source: {
                  ...prev.source,
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                },
              }
            : prev,
        );
      }
      const buf = imageSourceToBuffer(img, 1280);
      setSourcePreview(buf);
    })();
    return () => {
      alive = false;
    };
  }, [project.source.idbKey, project.source.vaultItemId, vault.items]);

  // Hydrate any Double Exposure overlay assets
  useEffect(() => {
    let alive = true;
    void (async () => {
      for (const ov of project.overlays) {
        if (overlayBuffers.has(ov.id)) continue;
        const blob = await loadOpticsBlob(ov.idbKey);
        if (!blob || !alive) continue;
        const img = await decodeBlobToImageElement(blob);
        if (!alive) continue;
        const buf = imageSourceToBuffer(img, 960);
        setOverlayBuffers((prev) => {
          const next = new Map(prev);
          next.set(ov.id, buf);
          return next;
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [overlayBuffers, project.overlays]);

  // Evaluate non-destructive stack sequentially cleanly on source or editStack updates
  const editingCropLayerId = useMemo(
    () =>
      activeLayerId
        ? project.editStack.find((l) => l.id === activeLayerId && l.toolId === "crop")?.id ?? null
        : null,
    [activeLayerId, project.editStack],
  );

  useEffect(() => {
    if (!sourcePreview) return;
    const handle = window.requestAnimationFrame(() => {
      const result = evaluateEditStack(
        sourcePreview,
        project.source.idbKey,
        project.editStack,
        activeLayerId,
        {
          rubyMaskLayerId: maskingLayerId,
          editingCropLayerId,
          overlayBuffers,
          upstreamCache: upstreamCacheRef.current,
        },
      );
      if (result.upstreamSnapshot) {
        upstreamCacheRef.current = result.upstreamSnapshot;
      }
      setRenderedPreview(result.buffer);
    });
    return () => window.cancelAnimationFrame(handle);
  }, [
    sourcePreview,
    project.source.idbKey,
    project.editStack,
    activeLayerId,
    maskingLayerId,
    editingCropLayerId,
    overlayBuffers,
  ]);

  const histogram = useMemo<OpticsHistogram | null>(
    () => (renderedPreview ? computeHistogram(renderedPreview.data) : null),
    [renderedPreview],
  );

  const activeLayer = useMemo(
    () =>
      activeLayerId ? project.editStack.find((l) => l.id === activeLayerId) ?? null : null,
    [activeLayerId, project.editStack],
  );

  const persistProject = useCallback(
    async (target: OpticsProject) => {
      try {
        // Generate lightweight preview thumbnail for Projects drawer
        let thumb = target.thumbnailUrl;
        const canvas = document.querySelector<HTMLCanvasElement>(
          '[data-optics-stage="true"] canvas',
        );
        if (canvas && canvas.width > 0) {
          const small = document.createElement("canvas");
          const s = 180 / Math.max(canvas.width, canvas.height);
          small.width = Math.max(24, Math.round(canvas.width * s));
          small.height = Math.max(24, Math.round(canvas.height * s));
          const sctx = small.getContext("2d");
          if (sctx) {
            sctx.drawImage(canvas, 0, 0, small.width, small.height);
            thumb = small.toDataURL("image/jpeg", 0.72);
          }
        }
        const saved = await saveOpticsProjectClient(databaseConfigured, {
          ...target,
          thumbnailUrl: thumb,
        });
        setSummaries(await listOpticsProjectsClient(databaseConfigured, target.collectionId));
        return saved;
      } catch {
        return target;
      }
    },
    [databaseConfigured],
  );

  const commitProject = useCallback(
    (updater: (prev: OpticsProject) => OpticsProject, recordUndo = true) => {
      setProject((prev) => {
        const next = updater(prev);
        if (next === prev) return prev;
        if (recordUndo) {
          setUndoStack((u) => [...u.slice(-28), prev]);
          setRedoStack([]);
        }
        return next;
      });
    },
    [],
  );

  const handleUndo = useCallback(() => {
    setUndoStack((u) => {
      if (u.length === 0) return u;
      const last = u[u.length - 1]!;
      setRedoStack((r) => [...r, projectRef.current]);
      setProject(last);
      return u.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const next = r[r.length - 1]!;
      setUndoStack((u) => [...u, projectRef.current]);
      setProject(next);
      return r.slice(0, -1);
    });
  }, []);

  // Load any incoming Command Storage image routed into Optics
  const loadImportedImage = useCallback(
    async (img: OpticsImportedImage) => {
      const idbKey = img.starterId
        ? `starter:${img.starterId}`
        : `plate-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      if (!img.starterId) {
        await saveOpticsBlob(idbKey, img.blob);
      }
      const decoded = await decodeBlobToImageElement(img.blob);
      const colId = activeCollectionId || collections[0]?.id || "local-optics-darkroom";
      const now = new Date().toISOString();
      const fresh: OpticsProject = {
        id: `opt-${Date.now().toString(36)}`,
        collectionId: colId,
        title: img.name,
        description: null,
        width: decoded.naturalWidth,
        height: decoded.naturalHeight,
        source: {
          id: `src-${Date.now().toString(36)}`,
          name: img.name,
          mimeType: img.mimeType,
          width: decoded.naturalWidth,
          height: decoded.naturalHeight,
          byteLength: img.blob.size,
          source: img.source,
          ...(img.starterId ? { starterId: img.starterId } : {}),
          idbKey,
          vaultItemId: img.vaultItemId ?? null,
          cameraHint: img.cameraHint ?? `${decoded.naturalWidth}×${decoded.naturalHeight}`,
        },
        overlays: [],
        editStack: [],
        activeLookId: "original",
        matteMode: projectRef.current.matteMode,
        thumbnailUrl: null,
        tags: [],
        notes: null,
        createdAt: now,
        updatedAt: now,
      };
      setUndoStack([]);
      setRedoStack([]);
      setActiveLayerId(null);
      setMaskingLayerId(null);
      setProject(fresh);
      await persistProject(fresh);
      flash(`Opened “${fresh.title}” (${fresh.width}×${fresh.height}).`);
    },
    [activeCollectionId, collections, flash, persistProject],
  );

  useEffect(() => {
    if (!incomingVaultItem || incomingVaultItem.serial === handledVaultSerialRef.current) return;
    handledVaultSerialRef.current = incomingVaultItem.serial;
    const item = vault.items.find((it) => it.id === incomingVaultItem.itemId);
    if (!item || item.kind !== "image") return;
    void (async () => {
      const sourceProjectId = item.metadata.sourceProjectId;
      if (sourceProjectId) {
        const savedProj = await getOpticsProjectClient(databaseConfigured, sourceProjectId);
        if (savedProj) {
          setUndoStack([]);
          setRedoStack([]);
          setMaskingLayerId(null);
          setActiveLayerId(savedProj.editStack[savedProj.editStack.length - 1]?.id ?? null);
          setProject(savedProj);
          flash(
            `Restored non-destructive Optics project “${savedProj.title}” (${savedProj.editStack.length} layer${savedProj.editStack.length === 1 ? "" : "s"}).`,
          );
          return;
        }
      }
      const blob = await resolveVaultItemBlob(item);
      if (!blob) {
        flash(`Couldn't read binary payload for ${item.name} in this browser session.`);
        return;
      }
      await loadImportedImage({
        blob,
        name: item.name.replace(/\.[^.]+$/, ""),
        mimeType: item.mimeType || "image/png",
        source: "vault",
        vaultItemId: item.id,
        cameraHint: "Loaded from Command Vault",
      });
    })();
  }, [databaseConfigured, flash, incomingVaultItem, loadImportedImage, vault.items]);

  const handleSelectTool = useCallback(
    (toolId: OpticsToolId) => {
      setEyedropperArmed(false);
      setSelectiveAddArmed(false);
      setMaskingLayerId(null);
      setActiveParamIndex(0);
      setInspectorOpen(true);
      setInspectorTab("adjust");

      // Re-use top-most matching layer if active or add a fresh non-destructive layer
      const existingTop = projectRef.current.editStack[projectRef.current.editStack.length - 1];
      if (existingTop && existingTop.toolId === toolId) {
        setActiveLayerId(existingTop.id);
        return;
      }
      const meta = getToolMeta(toolId);
      const layer: OpticsEditLayer = {
        id: makeLayerId(toolId),
        toolId,
        label: meta.name,
        enabled: true,
        opacity: 100,
        params: createDefaultToolParams(toolId),
        mask: null,
        createdAt: new Date().toISOString(),
      };
      commitProject((prev) => ({
        ...prev,
        editStack: [...prev.editStack, layer],
        activeLookId: null,
      }));
      setActiveLayerId(layer.id);
    },
    [commitProject],
  );

  const handleApplyLook = useCallback(
    (look: OpticsLookPreset) => {
      setMaskingLayerId(null);
      setEyedropperArmed(false);
      const nextLayers: OpticsEditLayer[] = look.layers.map((l) => ({
        id: makeLayerId(l.toolId),
        toolId: l.toolId,
        label: l.label,
        enabled: true,
        opacity: l.opacity ?? 100,
        params: structuredClone(l.params),
        mask: null,
        createdAt: new Date().toISOString(),
      }));
      commitProject((prev) => ({
        ...prev,
        editStack: nextLayers,
        activeLookId: look.id,
      }));
      setActiveLayerId(nextLayers[nextLayers.length - 1]?.id ?? null);
      flash(`Applied “${look.name}” Look (${nextLayers.length} editable layer${nextLayers.length === 1 ? "" : "s"}).`);
    },
    [commitProject, flash],
  );

  const handleUpdateLayerParams = useCallback(
    <K extends OpticsToolId>(layerId: string, nextParams: OpticsToolParamMap[K]) => {
      commitProject(
        (prev) => ({
          ...prev,
          editStack: prev.editStack.map((l) =>
            l.id === layerId ? { ...l, params: nextParams } : l,
          ),
        }),
        false,
      );
    },
    [commitProject],
  );

  const handlePaintMaskStroke = useCallback(
    (layerId: string, points: Array<{ x: number; y: number }>, radius: number, strength: number) => {
      commitProject((prev) => ({
        ...prev,
        editStack: prev.editStack.map((l) => {
          if (l.id !== layerId) return l;
          const existing = l.mask ?? {
            enabled: true,
            invert: false,
            baseAlpha: strength === 0 ? 1 : 0,
            strokes: [],
          };
          return {
            ...l,
            mask: {
              ...existing,
              enabled: true,
              strokes: [
                ...existing.strokes,
                {
                  id: `msk-${Date.now().toString(36)}`,
                  points,
                  radius,
                  feather: 0.7,
                  strength,
                },
              ],
            },
          };
        }),
      }));
    },
    [commitProject],
  );

  /** Full-resolution synchronous/async export across original source pixels. */
  const renderFullPlate = useCallback(async (): Promise<ImageBuffer> => {
    let fullSource = sourcePreview;
    const blob = sourceBlobRef.current ?? (await loadOpticsBlob(projectRef.current.source.idbKey));
    if (blob) {
      const img = await decodeBlobToImageElement(blob);
      fullSource = imageSourceToBuffer(img);
    }
    if (!fullSource) {
      return { width: 1, height: 1, data: new Uint8ClampedArray(4) };
    }
    const fullOverlays = new Map<string, ImageBuffer>();
    for (const ov of projectRef.current.overlays) {
      const ovBlob = await loadOpticsBlob(ov.idbKey);
      if (ovBlob) {
        const ovImg = await decodeBlobToImageElement(ovBlob);
        fullOverlays.set(ov.id, imageSourceToBuffer(ovImg));
      }
    }
    return evaluateEditStack(
      fullSource,
      `${projectRef.current.source.idbKey}:full`,
      projectRef.current.editStack,
      null,
      { overlayBuffers: fullOverlays },
    ).buffer;
  }, [sourcePreview]);

  const handleSaveToVault = useCallback(async () => {
    const buffer = await renderFullPlate();
    const blob = await exportBufferToBlob(buffer, "image/png", 0.96, 1);
    const saved = await saveBlobToVault({
      blob,
      name: `${projectRef.current.title.trim() || "Optics Plate"}.png`,
      mimeType: "image/png",
      folderId: "optics-darkroom",
      tags: ["optics", ...projectRef.current.tags],
      source: "extension",
      metadata: {
        width: buffer.width,
        height: buffer.height,
        sourceNodeId: OPTICS_NODE_ID,
        sourceProjectId: projectRef.current.id,
      },
    });
    await persistProject(projectRef.current);
    flash(`Saved “${saved.name}” to Command Storage.`);
  }, [flash, persistProject, renderFullPlate]);

  const handleQuickSendToCinema = useCallback(async () => {
    const buffer = await renderFullPlate();
    const blob = await exportBufferToBlob(buffer, "image/png", 0.96, 1);
    const saved = await saveBlobToVault({
      blob,
      name: `${projectRef.current.title.trim() || "Optics Plate"}.png`,
      mimeType: "image/png",
      folderId: "optics-darkroom",
      tags: ["optics", "cinema-plate"],
      source: "extension",
      metadata: {
        width: buffer.width,
        height: buffer.height,
        sourceNodeId: OPTICS_NODE_ID,
        sourceProjectId: projectRef.current.id,
      },
    });
    nexusBus.emit(
      "optics:photo-routed",
      {
        projectId: projectRef.current.id,
        targetNodeId: "dev.nexus.cinema",
        title: projectRef.current.title,
        transfer: {
          projectId: projectRef.current.id,
          vaultItemId: saved.id,
          title: projectRef.current.title,
          width: buffer.width,
          height: buffer.height,
          targetNodeId: "dev.nexus.cinema",
          createdAt: new Date().toISOString(),
        },
        envelope: toOpticsProjectEnvelope(projectRef.current),
      },
      OPTICS_NODE_ID,
    );
    onSendPlateToCinema?.(saved, blob, buffer.width, buffer.height);
  }, [onSendPlateToCinema, renderFullPlate]);

  // Keyboard shortcuts when Optics view is visible
  useEffect(() => {
    if (!visible) return;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (e.key === "\\") {
        e.preventDefault();
        setCompareMode((m) => (m === "off" ? "hold" : "off"));
      } else if (e.key.toLowerCase() === "z" && !e.metaKey && !e.ctrlKey) {
        setLoupeEnabled((v) => !v);
      } else if (e.key === "[") {
        setMaskBrushSize((s) => Math.max(8, s - 6));
      } else if (e.key === "]") {
        setMaskBrushSize((s) => Math.min(96, s + 6));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleRedo, handleUndo, visible]);

  const allLooks = useMemo(() => [...customLooks, ...BUILTIN_LOOKS], [customLooks]);
  const nodeIsWired = hub.slots.some((s) => s.occupiedBy === OPTICS_NODE_ID);

  return (
    <section
      aria-label="Nexus Optics Photo Darkroom"
      data-optics-ready="true"
      className="optics-screen relative flex h-full w-full flex-col overflow-hidden"
    >
      <OpticsApertureReveal triggerKey={apertureKey} />

      {/* Top Three-Island Liquid Glass Bar positioned cleanly beside top-left h-16 Menu Orb */}
      <header key={`hdr-${apertureKey}`} className="optics-chrome-enter pointer-events-none relative z-30 flex h-16 shrink-0 items-center justify-between gap-2 pl-[98px] pr-3 sm:pr-5">
        {/* Left Island: Project Title, Collections, Import, Matte Switcher */}
        <div className="optics-glass-pill pointer-events-auto flex min-w-0 items-center gap-1 rounded-full px-2 py-1">
          <Input
            value={project.title}
            onChange={(e) =>
              commitProject((p) => ({ ...p, title: e.target.value }), false)
            }
            onBlur={() => void persistProject(projectRef.current)}
            aria-label="Optics plate title"
            className="font-heading h-8 w-28 min-w-0 border-0 bg-transparent px-2 text-[13.5px] font-medium tracking-[-0.015em] text-foreground shadow-none focus-visible:ring-1 sm:w-44"
          />

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setProjectsOpen(true)}
                  aria-label="Browse Optics darkroom projects"
                  className="size-8 rounded-full text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className="size-4" />
                </Button>
              }
            />
            <TooltipContent side="bottom">Darkroom Studies ({summaries.length})</TooltipContent>
          </Tooltip>

          <span className="h-4 w-px bg-border/70" aria-hidden />

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setImportModalMode("source")}
                  className="h-8 gap-1.5 rounded-full px-2.5 text-[12px] text-muted-foreground hover:text-foreground"
                >
                  <ImagePlus className="size-3.5 text-[color:var(--land-gold)]" />
                  <span className="hidden md:inline">Open Photo</span>
                </Button>
              }
            />
            <TooltipContent side="bottom">Open photo from Stills, Vault, Device or Camera</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const nextIdx = (MATTE_CYCLE.indexOf(project.matteMode) + 1) % MATTE_CYCLE.length;
                    const nextMode = MATTE_CYCLE[nextIdx]!;
                    commitProject((p) => ({ ...p, matteMode: nextMode }), false);
                  }}
                  className="hidden h-8 gap-1.5 rounded-full px-2.5 text-[12px] text-muted-foreground hover:text-foreground xl:inline-flex"
                >
                  <Contrast className="size-3.5" />
                  <span>{matteLabel(project.matteMode)}</span>
                </Button>
              }
            />
            <TooltipContent side="bottom">Cycle stage matte (Theme / Obsidian / 18% Grey / Paper)</TooltipContent>
          </Tooltip>
        </div>

        {/* Center Island: Either Live Vernier Scrub Scale OR Precision Compare/Stack Controls */}
        {scrubHud ? (
          <div className="optics-glass-pill pointer-events-auto flex h-10 items-center gap-3 rounded-full border-[color:var(--land-gold)]/60 px-4 shadow-xl">
            <span className="text-[12px] font-medium text-foreground">{scrubHud.label}</span>
            <div className="relative h-4 w-32 overflow-hidden sm:w-44">
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
              <div
                style={{
                  left: `${clamp(((scrubHud.value - scrubHud.min) / Math.max(1, scrubHud.max - scrubHud.min)) * 100, 0, 100)}%`,
                }}
                className="absolute top-0 bottom-0 w-0.5 -translate-x-1/2 bg-[color:var(--land-gold)] shadow-[0_0_8px_rgba(240,181,74,0.8)]"
              />
            </div>
            <span className="min-w-[44px] text-right font-mono text-[12px] font-semibold text-[color:var(--land-gold)] tabular-nums">
              {scrubHud.value > 0 && scrubHud.min < 0 ? `+${Math.round(scrubHud.value)}` : Math.round(scrubHud.value)}
              {scrubHud.unit}
            </span>
          </div>
        ) : (
          <div className="optics-glass-pill pointer-events-auto hidden items-center gap-1 rounded-full px-2 py-1 md:flex">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={undoStack.length === 0}
              onClick={handleUndo}
              aria-label="Undo edit step"
              className="size-8 rounded-full"
            >
              <Undo2 className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={redoStack.length === 0}
              onClick={handleRedo}
              aria-label="Redo edit step"
              className="size-8 rounded-full"
            >
              <Redo2 className="size-3.5" />
            </Button>

            <span className="mx-0.5 h-4 w-px bg-border/70" aria-hidden />

            <button
              type="button"
              onClick={() => {
                setInspectorOpen(true);
                setInspectorTab("stack");
              }}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-colors ${
                inspectorOpen && inspectorTab === "stack"
                  ? "bg-[color:var(--land-gold)]/16 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="size-3.5 text-[color:var(--land-gold)]" />
              <span className="font-mono tabular-nums">{project.editStack.length}</span>
            </button>

            <button
              type="button"
              onPointerDown={() => compareMode === "off" && setCompareMode("hold")}
              onPointerUp={() => compareMode === "hold" && setCompareMode("off")}
              onPointerLeave={() => compareMode === "hold" && setCompareMode("off")}
              onClick={() =>
                setCompareMode((m) => (m === "split" ? "off" : "split"))
              }
              title="Hold to peek Original · Click to toggle Split Curtain"
              className={`inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium transition-colors ${
                compareMode !== "off"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye className="size-3.5" />
              <span>{compareMode === "split" ? "Split" : "Compare"}</span>
            </button>

            <button
              type="button"
              onClick={() => setLoupeEnabled((v) => !v)}
              title="Toggle 1:1 Optical Loupe (Z)"
              className={`inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium transition-colors ${
                loupeEnabled
                  ? "bg-[color:var(--land-gold)] text-black"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Search className="size-3.5" />
              <span>1:1</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setZoomMode((z) => (z === "fit" ? 1 : z === 1 ? 2 : "fit"))
              }
              className="h-8 rounded-full px-2 font-mono text-[11.5px] text-muted-foreground tabular-nums hover:text-foreground"
            >
              {zoomMode === "fit" ? "Fit" : `${Math.round(zoomMode * 100)}%`}
            </button>
          </div>
        )}

        {/* Right Island: Inspector Toggle, Quick Vault, Send to Cinema, Export/Publish */}
        <div className="optics-glass-pill pointer-events-auto flex items-center gap-1 rounded-full px-2 py-1">
          <Button
            type="button"
            size="icon-sm"
            variant={inspectorOpen ? "secondary" : "ghost"}
            onClick={() => setInspectorOpen((v) => !v)}
            aria-label={inspectorOpen ? "Hide precision inspector" : "Show precision inspector"}
            className="size-8 rounded-full"
          >
            <PanelRight className="size-3.5" />
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void handleSaveToVault()}
            className="hidden h-8 gap-1.5 rounded-full px-2.5 text-[12px] text-muted-foreground hover:text-foreground sm:inline-flex"
          >
            <HardDrive className="size-3.5 text-[color:var(--land-gold)]" />
            <span>Vault</span>
          </Button>

          {onSendPlateToCinema ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void handleQuickSendToCinema()}
              className="hidden h-8 gap-1.5 rounded-full px-2.5 text-[12px] text-muted-foreground hover:text-foreground xl:inline-flex"
            >
              <Film className="size-3.5" />
              <span>Cinema</span>
            </Button>
          ) : null}

          <Button
            type="button"
            size="sm"
            onClick={() => setExportOpen(true)}
            className="h-8 gap-1.5 rounded-full bg-[color:var(--land-gold)] px-3.5 text-[12px] font-medium text-black hover:opacity-90"
          >
            <Share2 className="size-3.5" />
            <span>Export</span>
          </Button>

          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onClose}
            aria-label="Return to Nexus stage"
            className="size-8 rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </header>

      {/* Main Workspace: Interactive Stage + Collapsible Liquid Glass Inspector */}
      <div className="relative flex min-h-0 flex-1 gap-3 px-3 pb-2 sm:px-4">
        <div key={`stg-${apertureKey}`} className="optics-stage-enter relative flex min-h-0 min-w-0 flex-1 flex-col">
          <OpticsStage
            renderedBuffer={renderedPreview}
            originalBuffer={sourcePreview}
            matteMode={project.matteMode}
            compareMode={compareMode}
            splitPos={splitPos}
            onSplitPosChange={setSplitPos}
            loupeEnabled={loupeEnabled}
            zoomMode={zoomMode}
            onZoomModeChange={setZoomMode}
            activeLayer={activeLayer}
            activeParamIndex={activeParamIndex}
            onSelectParamIndex={setActiveParamIndex}
            onScrubHudChange={setScrubHud}
            onUpdateLayerParams={handleUpdateLayerParams}
            onSampleWhiteBalance={(r, g, b) => {
              if (!activeLayer || activeLayer.toolId !== "white-balance") return;
              const solved = solveNeutralWhiteBalance(r, g, b);
              handleUpdateLayerParams<"white-balance">(activeLayer.id, solved);
              setEyedropperArmed(false);
              flash(`Calibrated White Balance (${solved.temperature >= 0 ? "+" : ""}${solved.temperature} Temp).`);
            }}
            eyedropperArmed={eyedropperArmed}
            selectiveAddArmed={selectiveAddArmed}
            onClearSelectiveAdd={() => setSelectiveAddArmed(false)}
            maskingLayerId={maskingLayerId}
            maskBrushStrength={maskBrushStrength}
            maskBrushSize={maskBrushSize}
            onPaintMaskStroke={handlePaintMaskStroke}
            onDropFiles={(files) => {
              const first = files[0];
              if (!first) return;
              void loadImportedImage({
                blob: first,
                name: first.name.replace(/\.[^.]+$/, "") || "Dropped Plate",
                mimeType: first.type || "image/png",
                source: "upload",
              });
            }}
          />

          {/* Floating Toast Notice */}
          {notice ? (
            <div className="optics-glass-pill pointer-events-none absolute top-4 right-4 z-30 rounded-full px-3.5 py-1.5 text-[12px] text-foreground shadow-lg">
              {notice}
            </div>
          ) : null}
        </div>

        {/* Desktop Collapsible Precision Inspector */}
        {inspectorOpen ? (
          <div className="hidden min-h-0 lg:block">
            <OpticsInspector
              open={inspectorOpen}
              tab={inspectorTab}
              onTabChange={setInspectorTab}
              project={project}
              activeLayer={activeLayer}
              activeParamIndex={activeParamIndex}
              onSelectParamIndex={setActiveParamIndex}
              histogram={histogram}
              maskingLayerId={maskingLayerId}
              maskBrushStrength={maskBrushStrength}
              maskBrushSize={maskBrushSize}
              eyedropperArmed={eyedropperArmed}
              selectiveAddArmed={selectiveAddArmed}
              onUpdateLayerParams={handleUpdateLayerParams}
              onUpdateLayerOpacity={(layerId, opacity) =>
                commitProject(
                  (prev) => ({
                    ...prev,
                    editStack: prev.editStack.map((l) => (l.id === layerId ? { ...l, opacity } : l)),
                  }),
                  false,
                )
              }
              onAutoTune={(layerId) => {
                if (!renderedPreview) return;
                const auto = computeAutoTuneParams(renderedPreview);
                handleUpdateLayerParams<"tune">(layerId, auto);
                flash("Applied Auto-Tune exposure & dynamic range calibration.");
              }}
              onAutoWhiteBalance={(layerId) => {
                if (!renderedPreview) return;
                const auto: OpticsWhiteBalanceParams = computeAutoWhiteBalance(renderedPreview);
                handleUpdateLayerParams<"white-balance">(layerId, auto);
                flash("Applied Gray-World Auto White Balance.");
              }}
              onArmEyedropper={setEyedropperArmed}
              onArmSelectiveAdd={setSelectiveAddArmed}
              onOpenOverlayPicker={() => setImportModalMode("overlay")}
              onResetActiveLayer={(layerId) => {
                const target = projectRef.current.editStack.find((l) => l.id === layerId);
                if (!target) return;
                handleUpdateLayerParams(layerId, createDefaultToolParams(target.toolId));
              }}
              onSelectLayerForEdit={(layerId) => {
                setActiveLayerId(layerId);
                setInspectorTab("adjust");
                setMaskingLayerId(null);
              }}
              onToggleLayer={(layerId) =>
                commitProject((prev) => ({
                  ...prev,
                  editStack: prev.editStack.map((l) =>
                    l.id === layerId ? { ...l, enabled: !l.enabled } : l,
                  ),
                }))
              }
              onMoveLayer={(layerId, dir) =>
                commitProject((prev) => {
                  const idx = prev.editStack.findIndex((l) => l.id === layerId);
                  if (idx < 0) return prev;
                  const targetIdx = idx + dir;
                  if (targetIdx < 0 || targetIdx >= prev.editStack.length) return prev;
                  const copy = [...prev.editStack];
                  const [item] = copy.splice(idx, 1);
                  copy.splice(targetIdx, 0, item!);
                  return { ...prev, editStack: copy };
                })
              }
              onDeleteLayer={(layerId) => {
                commitProject((prev) => ({
                  ...prev,
                  editStack: prev.editStack.filter((l) => l.id !== layerId),
                }));
                if (activeLayerId === layerId) setActiveLayerId(null);
                if (maskingLayerId === layerId) setMaskingLayerId(null);
              }}
              onStartMaskBrush={(layerId) => {
                setActiveLayerId(layerId);
                setMaskingLayerId(layerId);
              }}
              onStopMaskBrush={() => setMaskingLayerId(null)}
              onMaskBrushStrengthChange={setMaskBrushStrength}
              onMaskBrushSizeChange={setMaskBrushSize}
              onDoneEditingLayer={() => setActiveLayerId(null)}
              onToggleMaskInvert={(layerId) =>
                commitProject((prev) => ({
                  ...prev,
                  editStack: prev.editStack.map((l) =>
                    l.id === layerId && l.mask
                      ? { ...l, mask: { ...l.mask, invert: !l.mask.invert } }
                      : l,
                  ),
                }))
              }
            />
          </div>
        ) : null}
      </div>

      {/* Compact Mobile Undo/Redo/Stack/Compare Pill */}
      <div className="relative z-30 flex justify-center pb-1.5 md:hidden">
        <div className="optics-glass-pill inline-flex items-center gap-1 rounded-full px-2 py-1">
          <button
            type="button"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            aria-label="Undo edit step"
            className="grid size-11 place-items-center rounded-full text-foreground disabled:opacity-35"
          >
            <Undo2 className="size-4" />
          </button>
          <button
            type="button"
            disabled={redoStack.length === 0}
            onClick={handleRedo}
            aria-label="Redo edit step"
            className="grid size-11 place-items-center rounded-full text-foreground disabled:opacity-35"
          >
            <Redo2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setInspectorOpen(true);
              setInspectorTab("stack");
            }}
            className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-foreground"
          >
            <Layers className="size-3.5 text-[color:var(--land-gold)]" />
            <span className="font-mono tabular-nums">{project.editStack.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setCompareMode((m) => (m === "split" ? "off" : "split"))}
            className={`inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium ${
              compareMode !== "off" ? "bg-foreground text-background" : "text-foreground"
            }`}
          >
            <Eye className="size-3.5" />
            <span>{compareMode === "split" ? "Split" : "Compare"}</span>
          </button>
        </div>
      </div>

      {/* Bottom Floating Liquid Glass Dock */}
      <div key={`dck-${apertureKey}`} className="optics-chrome-enter relative z-30 pb-3 sm:pb-4">
        <OpticsDock
          dockTab={dockTab}
          onDockTabChange={setDockTab}
          activeToolId={activeLayer?.toolId ?? null}
          activeLookId={project.activeLookId}
          looks={allLooks}
          canSaveLook={project.editStack.length > 0}
          onSelectLook={handleApplyLook}
          onSaveCurrentLook={(name) => {
            const look: OpticsLookPreset = {
              id: `custom-${Date.now().toString(36)}`,
              name,
              subtitle: `${project.editStack.length} custom step${project.editStack.length === 1 ? "" : "s"}`,
              custom: true,
              layers: project.editStack.map((l) => ({
                toolId: l.toolId,
                label: l.label,
                opacity: l.opacity,
                params: structuredClone(l.params),
              })),
            };
            const next = saveCustomLook(look);
            setCustomLooks(next);
            commitProject((prev) => ({ ...prev, activeLookId: look.id }), false);
            flash(`Saved custom Look “${name}”.`);
          }}
          onDeleteCustomLook={(id) => {
            setCustomLooks(deleteCustomLook(id));
          }}
          onSelectTool={handleSelectTool}
        />
      </div>

      {/* Mobile Drawer Inspector Sheet */}
      <Sheet
        open={inspectorOpen && isMobileLayout}
        onOpenChange={(open) => {
          if (!open) setInspectorOpen(false);
        }}
      >
        <SheetContent side="bottom" className="h-[68svh] rounded-t-[24px] p-0 lg:hidden">
          <OpticsInspector
            open
            tab={inspectorTab}
            onTabChange={setInspectorTab}
            project={project}
            activeLayer={activeLayer}
            activeParamIndex={activeParamIndex}
            onSelectParamIndex={setActiveParamIndex}
            histogram={histogram}
            maskingLayerId={maskingLayerId}
            maskBrushStrength={maskBrushStrength}
            maskBrushSize={maskBrushSize}
            eyedropperArmed={eyedropperArmed}
            selectiveAddArmed={selectiveAddArmed}
            onUpdateLayerParams={handleUpdateLayerParams}
            onUpdateLayerOpacity={(layerId, opacity) =>
              commitProject(
                (prev) => ({
                  ...prev,
                  editStack: prev.editStack.map((l) => (l.id === layerId ? { ...l, opacity } : l)),
                }),
                false,
              )
            }
            onAutoTune={(layerId) => {
              if (!renderedPreview) return;
              handleUpdateLayerParams<"tune">(layerId, computeAutoTuneParams(renderedPreview));
            }}
            onAutoWhiteBalance={(layerId) => {
              if (!renderedPreview) return;
              handleUpdateLayerParams<"white-balance">(layerId, computeAutoWhiteBalance(renderedPreview));
            }}
            onArmEyedropper={setEyedropperArmed}
            onArmSelectiveAdd={setSelectiveAddArmed}
            onOpenOverlayPicker={() => setImportModalMode("overlay")}
            onResetActiveLayer={(layerId) => {
              const target = projectRef.current.editStack.find((l) => l.id === layerId);
              if (target) handleUpdateLayerParams(layerId, createDefaultToolParams(target.toolId));
            }}
            onSelectLayerForEdit={(layerId) => {
              setActiveLayerId(layerId);
              setInspectorTab("adjust");
            }}
            onToggleLayer={(layerId) =>
              commitProject((prev) => ({
                ...prev,
                editStack: prev.editStack.map((l) =>
                  l.id === layerId ? { ...l, enabled: !l.enabled } : l,
                ),
              }))
            }
            onMoveLayer={(layerId, dir) =>
              commitProject((prev) => {
                const idx = prev.editStack.findIndex((l) => l.id === layerId);
                if (idx < 0) return prev;
                const targetIdx = idx + dir;
                if (targetIdx < 0 || targetIdx >= prev.editStack.length) return prev;
                const copy = [...prev.editStack];
                const [item] = copy.splice(idx, 1);
                copy.splice(targetIdx, 0, item!);
                return { ...prev, editStack: copy };
              })
            }
            onDeleteLayer={(layerId) =>
              commitProject((prev) => ({
                ...prev,
                editStack: prev.editStack.filter((l) => l.id !== layerId),
              }))
            }
            onStartMaskBrush={(layerId) => {
              setActiveLayerId(layerId);
              setMaskingLayerId(layerId);
            }}
            onStopMaskBrush={() => setMaskingLayerId(null)}
            onMaskBrushStrengthChange={setMaskBrushStrength}
            onMaskBrushSizeChange={setMaskBrushSize}
            onDoneEditingLayer={() => setActiveLayerId(null)}
            onToggleMaskInvert={(layerId) =>
              commitProject((prev) => ({
                ...prev,
                editStack: prev.editStack.map((l) =>
                  l.id === layerId && l.mask
                    ? { ...l, mask: { ...l.mask, invert: !l.mask.invert } }
                    : l,
                ),
              }))
            }
          />
        </SheetContent>
      </Sheet>

      {/* Saved Darkroom Studies Sheet */}
      <Sheet open={projectsOpen} onOpenChange={setProjectsOpen}>
        <SheetContent side="left" className="w-80 border-r border-border bg-card/95 p-0 backdrop-blur-2xl">
          <SheetHeader className="border-b border-border/70 px-4 py-3.5">
            <SheetTitle className="font-editorial text-[1.2rem] font-medium">
              Darkroom Studies
            </SheetTitle>
          </SheetHeader>
          <div className="flex h-[calc(100%-58px)] flex-col">
            <div className="flex flex-wrap gap-1.5 border-b border-border/60 p-3">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setProjectsOpen(false);
                  setImportModalMode("source");
                }}
                className="h-8 flex-1 gap-1.5 rounded-full bg-foreground text-[12px] text-background"
              >
                <ImagePlus className="size-3.5" />
                <span>New Plate</span>
              </Button>
              {onOpenCommandStorage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setProjectsOpen(false);
                    onOpenCommandStorage();
                  }}
                  className="h-8 gap-1 rounded-full text-[12px]"
                >
                  <FolderOpen className="size-3.5" />
                  <span>Vault</span>
                </Button>
              ) : null}
            </div>

            <ScrollArea className="flex-1 p-3">
              <div className="space-y-2">
                {summaries.map((item) => (
                  <div
                    key={item.id}
                    className={`group flex items-center gap-2.5 rounded-xl border p-2 transition-colors ${
                      item.id === project.id
                        ? "border-[color:var(--land-gold)]/70 bg-[color:var(--land-gold)]/10"
                        : "border-transparent hover:border-border/70 hover:bg-muted/35"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={async () => {
                        const loaded = await getOpticsProjectClient(databaseConfigured, item.id);
                        if (loaded) {
                          setProject(loaded);
                          setActiveLayerId(null);
                          setProjectsOpen(false);
                        }
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-muted/60">
                        {item.thumbnailUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={item.thumbnailUrl} alt={item.title} className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full place-items-center text-muted-foreground">
                            <SlidersHorizontal className="size-3.5" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[12.5px] font-medium text-foreground">
                          {item.title}
                        </div>
                        <div className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
                          {item.width}×{item.height} · {item.layerCount} layers
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void deleteOpticsProjectClient(databaseConfigured, item.id).then(async () => {
                          setSummaries(await listOpticsProjectsClient(databaseConfigured, activeCollectionId));
                        })
                      }
                      aria-label={`Delete ${item.title}`}
                      className="rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {nodeIsWired ? (
              <div className="border-t border-border/70 p-3">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onReleaseNode}
                  className="h-8 w-full rounded-full text-[11.5px] text-muted-foreground hover:text-destructive"
                >
                  Release Optics from Socket
                </Button>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <OpticsImportModal
        open={importModalMode !== null}
        onOpenChange={(open) => {
          if (!open) setImportModalMode(null);
        }}
        mode={importModalMode ?? "source"}
        onSelectImage={(img) => {
          if (importModalMode === "overlay") {
            void (async () => {
              const idbKey = img.starterId
                ? `starter:${img.starterId}`
                : `overlay-${Date.now().toString(36)}`;
              if (!img.starterId) await saveOpticsBlob(idbKey, img.blob);
              const decoded = await decodeBlobToImageElement(img.blob);
              const ovId = `ov-${Date.now().toString(36)}`;
              const buf = imageSourceToBuffer(decoded, 960);
              setOverlayBuffers((prev) => {
                const next = new Map(prev);
                next.set(ovId, buf);
                return next;
              });
              commitProject((prev) => {
                const nextOverlays = [
                  ...prev.overlays,
                  {
                    id: ovId,
                    name: img.name,
                    mimeType: img.mimeType,
                    width: decoded.naturalWidth,
                    height: decoded.naturalHeight,
                    idbKey,
                    thumbnailDataUrl: null,
                  },
                ];
                const layer = activeLayer?.toolId === "double-exposure" ? activeLayer : null;
                return {
                  ...prev,
                  overlays: nextOverlays,
                  editStack: layer
                    ? prev.editStack.map((l) =>
                        l.id === layer.id
                          ? {
                              ...l,
                              params: {
                                ...(l.params as OpticsDoubleExposureParams),
                                overlayAssetId: ovId,
                                overlayName: img.name,
                              },
                            }
                          : l,
                      )
                    : prev.editStack,
                };
              });
              flash(`Loaded double-exposure plate “${img.name}”.`);
            })();
          } else {
            void loadImportedImage(img);
          }
        }}
      />

      <OpticsExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        project={project}
        renderFullPlate={renderFullPlate}
        onPersistProject={() => persistProject(projectRef.current)}
        onSendToCinema={(vItem, blob, w, h) => {
          onSendPlateToCinema?.(vItem, blob, w, h);
        }}
        onPublishVaultItem={(vItem) => setPublishItem(vItem)}
        onSavedNotice={flash}
      />

      <SocialPublishStudio
        open={publishItem !== null}
        onOpenChange={(open) => {
          if (!open) setPublishItem(null);
        }}
        item={publishItem}
        connectedConnectorIds={connectedConnectors}
        connectedAccounts={connectedAccounts}
        connectorAvailability={connectorAvailability}
        onOpenConnections={(connectorId) => {
          setPublishItem(null);
          onOpenCommandConnections?.(connectorId);
        }}
      />
    </section>
  );
}
