"use client";

import { ArrowUpRight, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { signOutAction } from "@/lib/auth/actions";
import {
  FREE_ACTIVE_EXTENSION_SLOTS,
  PLANNED_EXTENSIONS,
  canActivateAnother,
  canUseSlot,
  type ExtensionHubSnapshot,
  type ExtensionId,
  type SlotId,
} from "@/lib/extensions";

type Props = {
  hub: ExtensionHubSnapshot;
  selected: SlotId | null;
  notice: string | null;
  previewAllNodes: boolean;
  onSnap: (id: ExtensionId) => void;
  onRelease: (id: ExtensionId) => void;
  onTogglePreviewAllNodes: () => void;
};

const CONTRACT_URL = "https://github.com/enaanenterprises-hash/Nexus/blob/main/docs/extensions.md";

/** Catalog + plan: where extensions are snapped into (and out of) the network. */
export function ExtensionHub({
  hub,
  selected,
  notice,
  previewAllNodes,
  onSnap,
  onRelease,
  onTogglePreviewAllNodes,
}: Props) {
  const { entitlement, slots, extensions } = hub;
  const active = slots.filter((s) => s.occupiedBy);
  const available = extensions.filter((e) => !slots.some((s) => s.occupiedBy === e.manifest.id));
  const openSockets = slots.filter((s) => !s.occupiedBy && canUseSlot(s, entitlement)).length;
  const hasRoom = openSockets > 0 && canActivateAnother(active.length, entitlement);
  const selectedSlot = slots.find((s) => s.id === selected);

  return (
    <section aria-labelledby="hub-heading" className="flex flex-col gap-6">
      <header className="space-y-1">
        <h2 id="hub-heading" className="dash-heading">
          Network nodes
        </h2>
        <p className="text-[13px] leading-snug text-muted-foreground">
          Snap an extension in and it&apos;s wired to the core, sharing your context.
        </p>
      </header>

      <Card size="sm" className="rounded-2xl border border-border/80 bg-card/60 ring-0 shadow-none">
        <CardHeader className="pb-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="font-sans text-[14px] font-medium">
                {entitlement.isPro ? "Nexus Pro · preview" : "Free plan"}
              </CardTitle>
              <CardDescription className="text-[12px]">
                {entitlement.isPro
                  ? `${active.length} of ${slots.length} sockets in use`
                  : `${active.length} of ${FREE_ACTIVE_EXTENSION_SLOTS} free sockets in use`}
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-[10px] tracking-wider tabular-nums">
              {active.length}/{entitlement.isPro ? slots.length : FREE_ACTIVE_EXTENSION_SLOTS}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10" aria-hidden>
            <div
              className="h-full rounded-full bg-[color:var(--land-gold)] transition-all duration-300"
              style={{
                width: `${Math.min(
                  100,
                  (active.length /
                    Math.max(entitlement.isPro ? slots.length : FREE_ACTIVE_EXTENSION_SLOTS, 1)) *
                    100,
                )}%`,
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={previewAllNodes ? "outline" : "default"}
              aria-pressed={previewAllNodes}
              onClick={onTogglePreviewAllNodes}
              className={
                previewAllNodes
                  ? "gap-1.5 border-[color:var(--land-gold)]/65 bg-[color:var(--land-gold)]/16 text-foreground hover:bg-[color:var(--land-gold)]/24"
                  : "gap-1.5 border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
              }
            >
              <Sparkles className="size-3.5 text-[color:var(--land-gold)]" />
              <span>{previewAllNodes ? "Exit all-nodes preview" : "Preview all nodes"}</span>
            </Button>
            <form action={signOutAction}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button type="submit" size="sm" variant="outline">
                      Sign out
                    </Button>
                  }
                />
                <TooltipContent side="bottom">Sign out of Nexus</TooltipContent>
              </Tooltip>
            </form>
          </div>

          {selectedSlot ? (
            <p className="text-[12px] leading-snug text-muted-foreground">
              {selectedSlot.description}.
            </p>
          ) : null}

          {notice ? (
            <Alert className="rounded-xl border-border/80 bg-muted/40 py-2.5" role="status">
              <AlertDescription className="text-[12.5px] text-foreground">
                {notice}
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {active.length > 0 ? (
        <div>
          <p className="dash-eyebrow">Wired in</p>
          <ul className="mt-2">
            {active.map((slot) => {
              const ext = extensions.find((e) => e.manifest.id === slot.occupiedBy)!;
              return (
                <ExtensionRow
                  key={slot.id}
                  monogram={ext.manifest.monogram ?? ext.manifest.name.slice(0, 2)}
                  name={ext.manifest.name}
                  detail={`${slot.tier === "pro" ? "Pro" : "Free"} socket · ${ext.manifest.capabilities.join(", ")}`}
                  live
                  action={
                    <Button type="button" size="sm" variant="outline" onClick={() => onRelease(ext.manifest.id)}>
                      Release
                    </Button>
                  }
                />
              );
            })}
          </ul>
        </div>
      ) : null}

      <div>
        <p className="dash-eyebrow">Available</p>
        <ul className="mt-2">
          {available.map((ext) => (
            <ExtensionRow
              key={ext.manifest.id}
              monogram={ext.manifest.monogram ?? ext.manifest.name.slice(0, 2)}
              name={ext.manifest.name}
              detail={ext.manifest.description}
              action={
                <Button
                  type="button"
                  size="sm"
                  variant={hasRoom ? "default" : "outline"}
                  className={
                    hasRoom
                      ? "border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
                      : undefined
                  }
                  onClick={() => onSnap(ext.manifest.id)}
                  aria-label={`Snap ${ext.manifest.name} into the network`}
                >
                  {hasRoom ? "Snap in" : "Pro"}
                </Button>
              }
            />
          ))}
        </ul>
        <p className="mt-2 text-[11.5px] text-muted-foreground">Sample extensions built on the public contract.</p>
      </div>

      <Separator />

      <div>
        <p className="dash-eyebrow">Coming soon</p>
        <ul className="mt-2.5 grid grid-cols-2 gap-2">
          {PLANNED_EXTENSIONS.map((p) => (
            <li key={p.key} className="rounded-xl border border-dashed border-border px-3 py-2.5">
              <p className="text-[13px] font-medium text-muted-foreground">{p.name}</p>
              <p className="text-[11.5px] text-muted-foreground/80">{p.tagline}</p>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="dash-eyebrow">Build a node</p>
        <pre className="dash-code dash-card-subtle mt-2.5 overflow-x-auto rounded-xl border border-border p-3">
          <span className="font-semibold text-foreground">const</span> node = defineExtension({"{"} manifest, handlers {"}"});{"\n"}
          <span className="font-semibold text-foreground">await</span> extensionRegistry.register(node);{"\n"}
          <span className="font-semibold text-foreground">await</span> extensionRegistry.activate(node.manifest.id);
        </pre>
        <a
          href={CONTRACT_URL}
          target="_blank"
          rel="noreferrer"
          className={cn(
            buttonVariants({ variant: "link", size: "sm" }),
            "mt-1 h-auto px-0 text-[12.5px] text-foreground",
          )}
        >
          <span>Read the extension contract</span>
          <ArrowUpRight className="size-3.5" />
        </a>
      </div>
    </section>
  );
}

function ExtensionRow({
  monogram,
  name,
  detail,
  action,
  live = false,
}: {
  monogram: string;
  name: string;
  detail: string;
  action: React.ReactNode;
  live?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-border/70 py-3 last:border-b-0">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
          live
            ? "dash-monogram--live border border-border bg-muted/60"
            : "border border-dashed border-border text-muted-foreground"
        }`}
      >
        {monogram}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium leading-tight">{name}</p>
        <p className="mt-0.5 truncate text-[12px] text-muted-foreground" title={detail}>
          {detail}
        </p>
      </div>
      {action}
    </li>
  );
}
