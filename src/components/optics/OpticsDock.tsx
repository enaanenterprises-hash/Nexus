"use client";

import { useState } from "react";
import {
  Aperture,
  Bandage,
  BookmarkPlus,
  Contrast,
  Crop,
  Droplets,
  Expand,
  Film,
  Flame,
  Focus,
  Frame,
  Layers,
  Paintbrush,
  Palette,
  Scan,
  SlidersHorizontal,
  Sparkles,
  SunMedium,
  Target,
  Thermometer,
  Trash2,
  Type,
  UserRound,
  Wand2,
} from "lucide-react";
import { OPTICS_TOOLS_META } from "@/lib/optics/tools-meta";
import type { OpticsLookPreset, OpticsToolId } from "@/lib/optics/types";

export type OpticsDockTab = "looks" | "tools" | "filters";

function ToolGlyph({ id, className }: { id: OpticsToolId; className?: string }) {
  switch (id) {
    case "tune":
      return <SlidersHorizontal className={className} />;
    case "details":
      return <TriangleSharpIcon className={className} />;
    case "curves":
      return <SplineGlyph className={className} />;
    case "white-balance":
      return <Thermometer className={className} />;
    case "hsl":
      return <Palette className={className} />;
    case "crop":
      return <Crop className={className} />;
    case "perspective":
      return <Scan className={className} />;
    case "expand":
      return <Expand className={className} />;
    case "selective":
      return <Target className={className} />;
    case "brush":
      return <Paintbrush className={className} />;
    case "healing":
      return <Bandage className={className} />;
    case "lens-blur":
      return <Focus className={className} />;
    case "vignette":
      return <Aperture className={className} />;
    case "double-exposure":
      return <Layers className={className} />;
    case "text":
      return <Type className={className} />;
    case "frames":
      return <Frame className={className} />;
    case "hdr-scape":
      return <SunMedium className={className} />;
    case "glamour-glow":
      return <Sparkles className={className} />;
    case "tonal-contrast":
      return <Contrast className={className} />;
    case "drama":
      return <Flame className={className} />;
    case "vintage":
      return <Droplets className={className} />;
    case "grainy-film":
      return <Film className={className} />;
    case "retrolux":
      return <Wand2 className={className} />;
    case "black-white":
      return <Contrast className={className} />;
    case "noir":
      return <MoonSilverGlyph className={className} />;
    case "portrait":
      return <UserRound className={className} />;
  }
}

function TriangleSharpIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <path d="M12 4L3.5 19h17L12 4z" strokeLinejoin="round" />
      <path d="M12 10v5" strokeLinecap="round" />
    </svg>
  );
}

function SplineGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <path d="M4 19C8 19 8 5 20 5" strokeLinecap="round" />
      <circle cx="9" cy="14" r="1.6" fill="currentColor" />
      <circle cx="15" cy="9" r="1.6" fill="currentColor" />
    </svg>
  );
}

function MoonSilverGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16V4z" fill="currentColor" fillOpacity="0.45" />
    </svg>
  );
}

export function OpticsDock({
  dockTab,
  onDockTabChange,
  activeToolId,
  activeLookId,
  looks,
  canSaveLook,
  onSelectLook,
  onSaveCurrentLook,
  onDeleteCustomLook,
  onSelectTool,
}: {
  dockTab: OpticsDockTab;
  onDockTabChange: (tab: OpticsDockTab) => void;
  activeToolId: OpticsToolId | null;
  activeLookId: string | null;
  looks: readonly OpticsLookPreset[];
  canSaveLook: boolean;
  onSelectLook: (look: OpticsLookPreset) => void;
  onSaveCurrentLook: (name: string) => void;
  onDeleteCustomLook: (id: string) => void;
  onSelectTool: (toolId: OpticsToolId) => void;
}) {
  const [savingLook, setSavingLook] = useState(false);
  const [lookName, setLookName] = useState("");

  const coreTools = OPTICS_TOOLS_META.filter((t) => t.category !== "creative");
  const filterTools = OPTICS_TOOLS_META.filter((t) => t.category === "creative");

  return (
    <div className="pointer-events-none inset-x-0 bottom-3 z-30 flex flex-col items-center gap-2 px-3 sm:bottom-4">
      {/* Floating tray above pill switcher */}
      <div className="optics-glass-dock pointer-events-auto w-full max-w-[880px] overflow-hidden rounded-[22px] px-2 py-2">
        {dockTab === "looks" ? (
          <div className="flex items-center gap-2 px-1">
            <div
              onWheel={(e) => {
                if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                  e.currentTarget.scrollLeft += e.deltaY;
                }
              }}
              className="optics-dock-scroll w-full overflow-x-auto whitespace-nowrap"
            >
              <div className="flex items-center gap-1.5 py-0.5">
                {looks.map((look) => {
                  const active = activeLookId === look.id;
                  return (
                    <div key={look.id} className="group relative flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => onSelectLook(look)}
                        className={`flex h-11 min-w-[78px] flex-col items-start justify-center rounded-[14px] border px-3 transition-all ${
                          active
                            ? "border-[color:var(--land-gold)]/70 bg-[color:var(--land-gold)]/14 text-foreground"
                            : "border-transparent bg-foreground/[0.035] text-muted-foreground hover:bg-foreground/[0.07] hover:text-foreground"
                        }`}
                      >
                        <span className="text-[12px] font-medium leading-none">{look.name}</span>
                        <span className="mt-1 font-mono text-[9.5px] opacity-65 tabular-nums">
                          {look.layers.length === 0 ? "Base" : `${look.layers.length} step${look.layers.length === 1 ? "" : "s"}`}
                        </span>
                      </button>
                      {look.custom ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteCustomLook(look.id);
                          }}
                          aria-label={`Remove custom look ${look.name}`}
                          className="absolute -top-1 -right-1 hidden size-5 place-items-center rounded-full bg-card text-muted-foreground shadow group-hover:grid hover:text-destructive"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}

                {canSaveLook ? (
                  savingLook ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const trimmed = lookName.trim();
                        if (trimmed) {
                          onSaveCurrentLook(trimmed);
                          setLookName("");
                          setSavingLook(false);
                        }
                      }}
                      className="flex h-11 shrink-0 items-center gap-1.5 rounded-[14px] border border-[color:var(--land-gold)]/55 bg-background/80 px-2"
                    >
                      <input
                        autoFocus
                        value={lookName}
                        onChange={(e) => setLookName(e.target.value)}
                        placeholder="Look name…"
                        className="w-24 bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
                      />
                      <button
                        type="submit"
                        className="rounded-full bg-[color:var(--land-gold)] px-2.5 py-1 text-[11px] font-medium text-black"
                      >
                        Save
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSavingLook(true)}
                      className="flex h-11 shrink-0 items-center gap-1.5 rounded-[14px] border border-dashed border-border/90 px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:border-[color:var(--land-gold)]/60 hover:text-foreground"
                    >
                      <BookmarkPlus className="size-3.5 text-[color:var(--land-gold)]" />
                      <span>Save Look</span>
                    </button>
                  )
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {dockTab === "tools" ? (
          <div
            onWheel={(e) => {
              if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.currentTarget.scrollLeft += e.deltaY;
              }
            }}
            className="optics-dock-scroll w-full overflow-x-auto whitespace-nowrap"
          >
            <div className="flex items-center gap-1 px-1 py-0.5">
              {coreTools.map((tool) => {
                const active = activeToolId === tool.id;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => onSelectTool(tool.id)}
                    title={tool.blurb}
                    className={`flex h-11 shrink-0 items-center gap-1.5 rounded-[14px] border px-3 transition-all ${
                      active
                        ? "border-[color:var(--land-gold)]/70 bg-[color:var(--land-gold)]/14 text-foreground"
                        : "border-transparent text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                    }`}
                  >
                    <ToolGlyph
                      id={tool.id}
                      className={`size-4 shrink-0 ${active ? "text-[color:var(--land-gold)]" : ""}`}
                    />
                    <span className="text-[12px] font-medium">{tool.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {dockTab === "filters" ? (
          <div
            onWheel={(e) => {
              if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.currentTarget.scrollLeft += e.deltaY;
              }
            }}
            className="optics-dock-scroll w-full overflow-x-auto whitespace-nowrap"
          >
            <div className="flex items-center gap-1 px-1 py-0.5">
              {filterTools.map((tool) => {
                const active = activeToolId === tool.id;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => onSelectTool(tool.id)}
                    title={tool.blurb}
                    className={`flex h-11 shrink-0 items-center gap-1.5 rounded-[14px] border px-3 transition-all ${
                      active
                        ? "border-[color:var(--land-gold)]/70 bg-[color:var(--land-gold)]/14 text-foreground"
                        : "border-transparent text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                    }`}
                  >
                    <ToolGlyph
                      id={tool.id}
                      className={`size-4 shrink-0 ${active ? "text-[color:var(--land-gold)]" : ""}`}
                    />
                    <span className="text-[12px] font-medium">{tool.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* Primary Snapseed bottom triad pill */}
      <div
        role="tablist"
        aria-label="Optics Studio Categories"
        className="optics-glass-pill pointer-events-auto inline-flex items-center gap-1 rounded-full p-1"
      >
        {(
          [
            { id: "looks", label: "Looks" },
            { id: "tools", label: "Tools" },
            { id: "filters", label: "Filters" },
          ] as const
        ).map((tab) => {
          const active = dockTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onDockTabChange(tab.id)}
              className={`min-h-[44px] min-w-[82px] rounded-full px-4 text-[12.5px] font-medium transition-all sm:min-h-0 sm:h-9 ${
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
    </div>
  );
}
