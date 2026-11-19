"use client";

import { useState } from "react";
import { ArrowRight, BookOpen, Check, Film, FileText, Terminal, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { ExtensionHubSnapshot, ExtensionId } from "@/lib/extensions";
import { emitStudioTakeRouted } from "@/lib/studio/studio-client";
import type { StudioRecording, StudioRoutingIntent } from "@/lib/studio/types";
import { STUDIO_NODE_ID } from "@/extensions/studio/node";

const FUTURE_NODE_TARGETS: Array<{
  intent: StudioRoutingIntent;
  label: string;
  subtitle: string;
  badge: string;
  icon: typeof Film;
}> = [
  {
    intent: "video-studio",
    label: "Video Studio",
    subtitle: "Send multi-track audio, markers & timecode envelope to align with video cuts.",
    badge: "Future node · Bus ready",
    icon: Film,
  },
  {
    intent: "study-space",
    label: "Study Space",
    subtitle: "Hand voice lecture & chapter markers cleanly to Study flashcards & summaries.",
    badge: "Future node · Content ready",
    icon: BookOpen,
  },
  {
    intent: "ai-notes",
    label: "AI Analyzer Pipeline",
    subtitle: "Queue `studio.recording` envelope for automatic transcript, summary & chapter slots.",
    badge: "Hook registered",
    icon: FileText,
  },
  {
    intent: "command",
    label: "Nexus Command",
    subtitle: "Route session takeaways & markers into your active Nexus Command context.",
    badge: "Core node",
    icon: Terminal,
  },
];

export function StudioRoutingSheet({
  open,
  onOpenChange,
  recording,
  hub,
  theme,
  onRouteTransfer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recording: StudioRecording | null;
  hub: ExtensionHubSnapshot;
  theme: "dark" | "light";
  onRouteTransfer?: (targetId?: ExtensionId) => void;
}) {
  const [routedKey, setRoutedKey] = useState<string | null>(null);

  const connectedTargets = hub.slots
    .filter((s) => s.occupiedBy && s.occupiedBy !== STUDIO_NODE_ID)
    .map((s) => hub.extensions.find((e) => e.manifest.id === s.occupiedBy))
    .filter((ext): ext is NonNullable<typeof ext> => Boolean(ext));

  function sendTo(intent: StudioRoutingIntent, targetId?: ExtensionId, key?: string) {
    if (!recording) return;
    emitStudioTakeRouted(recording, { targetNodeId: targetId, intent });
    onRouteTransfer?.(targetId);
    setRoutedKey(key ?? intent);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-theme={theme}
        className="setup-card max-h-[86svh] max-w-[600px] overflow-y-auto p-6 sm:max-w-[600px]"
      >
        <DialogHeader className="text-left">
          <DialogTitle className="text-[1.15rem] font-medium tracking-[-0.015em]">
            Route recording across Nexus
          </DialogTitle>
          <DialogDescription className="text-[13px] text-muted-foreground">
            Emits a typed <code className="dash-code">studio.recording</code> v1 envelope on the network bus so
            compatible nodes and AI analyzers consume audio metadata, peaks, and markers cleanly.
          </DialogDescription>
        </DialogHeader>

        {!recording ? (
          <p className="py-6 text-[13px] text-muted-foreground">
            Save at least one recorded or imported layer to route this project across nodes.
          </p>
        ) : (
          <div className="mt-2 space-y-5">
            {connectedTargets.length > 0 ? (
              <div className="space-y-2.5">
                <p className="text-[12px] font-medium text-muted-foreground">
                  Wired in right now
                </p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {connectedTargets.map((ext) => {
                    const sent = routedKey === ext.manifest.id;
                    return (
                      <Button
                        key={ext.manifest.id}
                        type="button"
                        variant="outline"
                        onClick={() => sendTo("custom", ext.manifest.id, ext.manifest.id)}
                        className="h-auto justify-between rounded-xl px-3.5 py-2.5 text-left"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[13px] font-medium">
                            <Zap className="size-3.5 text-[color:var(--land-gold)]" />
                            <span className="truncate">{ext.manifest.name}</span>
                          </div>
                          <p className="truncate text-[11px] text-muted-foreground">{ext.manifest.id}</p>
                        </div>
                        {sent ? <Check className="size-4 shrink-0 text-[color:var(--land-gold)]" /> : <ArrowRight className="size-3.5 shrink-0" />}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="space-y-2.5">
              <p className="text-[12px] font-medium text-muted-foreground">
                Target workspaces &amp; downstream nodes
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {FUTURE_NODE_TARGETS.map((target) => {
                  const Icon = target.icon;
                  const sent = routedKey === target.intent;
                  return (
                    <Card key={target.intent} size="sm" className="rounded-xl border border-border/80 bg-card/50 shadow-none">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="flex items-center gap-1.5 font-sans text-[13px] font-medium">
                            <Icon className="size-3.5 text-[color:var(--land-gold)]" />
                            <span>{target.label}</span>
                          </CardTitle>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {target.badge}
                          </Badge>
                        </div>
                        <CardDescription className="text-[11.5px] leading-snug">
                          {target.subtitle}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <Button
                          type="button"
                          size="sm"
                          variant={sent ? "secondary" : "outline"}
                          onClick={() => sendTo(target.intent, undefined, target.intent)}
                          className="w-full justify-between rounded-lg text-[12px]"
                        >
                          <span>{sent ? "Envelope emitted on bus" : `Push to ${target.label}`}</span>
                          {sent ? <Check className="size-3.5" /> : <ArrowRight className="size-3.5" />}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            <Separator />

            <div className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3.5 text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  AI &amp; Annotation Schema Slots (<code className="dash-code">studio.recording</code> v1)
                </span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {recording.tracks.length} tracks · {recording.markers.length} markers
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] text-muted-foreground">
                <div className="rounded-lg border border-border/60 px-2.5 py-1.5">
                  <div className="font-medium text-foreground">Transcript</div>
                  <div>{recording.transcript ? "Populated" : "Nullable AI slot ready"}</div>
                </div>
                <div className="rounded-lg border border-border/60 px-2.5 py-1.5">
                  <div className="font-medium text-foreground">Summary</div>
                  <div>{recording.summary ? "Populated" : "Nullable AI slot ready"}</div>
                </div>
                <div className="rounded-lg border border-border/60 px-2.5 py-1.5">
                  <div className="font-medium text-foreground">Chapters</div>
                  <div>
                    {recording.chapters
                      ? `${recording.chapters.items.length} chapters`
                      : `${recording.markers.filter((m) => m.kind === "chapter").length} chapter cues`}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
