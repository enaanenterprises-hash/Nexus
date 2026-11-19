"use client";

import { ArrowUpRight, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { ExtensionHubSnapshot, ExtensionId, SlotId } from "@/lib/extensions";

/** Panel view of one wired-in extension, with live Laniakea arm controls. */
export function ExtensionPanel({
  hub,
  id,
  onRelease,
  onTransfer,
  onOpenNodes,
}: {
  hub: ExtensionHubSnapshot;
  id: ExtensionId;
  onRelease: (id: ExtensionId) => void;
  onTransfer?: (fromId: ExtensionId, toId?: ExtensionId) => void;
  onOpenNodes?: (slotId?: SlotId) => void;
}) {
  const ext = hub.extensions.find((e) => e.manifest.id === id);
  const slot = hub.slots.find((s) => s.occupiedBy === id);
  if (!ext) {
    return (
      <p className="text-[13.5px] text-muted-foreground">
        This extension is no longer registered.
      </p>
    );
  }
  const { manifest } = ext;

  const otherLive = hub.slots
    .filter((s) => s.occupiedBy && s.occupiedBy !== id)
    .map((s) => ({
      slot: s,
      ext: hub.extensions.find((e) => e.manifest.id === s.occupiedBy),
    }))
    .filter(
      (item): item is { slot: typeof item.slot; ext: NonNullable<typeof item.ext> } =>
        Boolean(item.ext),
    );

  return (
    <section aria-labelledby="ext-heading" className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <span className="dash-monogram--live grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border bg-muted/60 text-[12px] font-semibold">
          {manifest.monogram ?? manifest.name.slice(0, 2)}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
            {slot ? (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--land-gold)]"
                aria-hidden
              />
            ) : null}
            <span>{slot ? `${slot.tier === "pro" ? "Pro" : "Free"} socket · connected` : "Disconnected"}</span>
          </div>
          <h2 id="ext-heading" className="dash-heading mt-0.5 truncate">
            {manifest.name}
          </h2>
        </div>
      </header>

      <p className="text-[13.5px] leading-relaxed text-muted-foreground">{manifest.description}</p>

      {slot && onTransfer ? (
        <Card size="sm" className="rounded-2xl border border-border/80 bg-card/60 ring-0 shadow-none">
          <CardHeader>
            <CardTitle className="font-sans text-[13.5px] font-medium">Send to node</CardTitle>
            <CardDescription className="text-[12.5px] leading-snug">
              Route an output from {manifest.name} across the network to another connected node.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {otherLive.length > 0 ? (
              otherLive.map((target) => (
                <Button
                  key={target.ext.manifest.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onTransfer(id, target.ext.manifest.id)}
                  className="gap-1.5 rounded-full"
                >
                  <Zap className="size-3.5 text-[color:var(--land-gold)]" />
                  <span>Send → {target.ext.manifest.name}</span>
                </Button>
              ))
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onTransfer(id)}
                className="gap-1.5 rounded-full"
              >
                <Zap className="size-3.5 text-[color:var(--land-gold)]" />
                <span>Send → Command</span>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Separator />

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[13px]">
        <dt className="text-muted-foreground">Version</dt>
        <dd>{manifest.version}</dd>
        <dt className="text-muted-foreground">Author</dt>
        <dd>{manifest.author ?? "Unknown"}</dd>
        <dt className="text-muted-foreground">Capabilities</dt>
        <dd className="flex flex-wrap gap-1.5">
          {manifest.capabilities.map((c) => (
            <Badge key={c} variant="secondary" className="font-normal">
              {c}
            </Badge>
          ))}
        </dd>
        <dt className="text-muted-foreground">Id</dt>
        <dd className="truncate dash-code">{manifest.id}</dd>
      </dl>

      {slot ? (
        <div className="flex flex-wrap items-center gap-2">
          {onOpenNodes ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 rounded-full"
              onClick={() => onOpenNodes(slot.id)}
            >
              <span>Inspect in Nodes</span>
              <ArrowUpRight className="size-3.5" />
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-full text-muted-foreground hover:text-destructive"
            onClick={() => onRelease(id)}
          >
            Disconnect
          </Button>
        </div>
      ) : null}
    </section>
  );
}
