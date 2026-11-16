"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LogOut, Moon, RotateCcw, ShieldAlert, Sun } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { signOutAction } from "@/lib/auth/actions";
import type { Viewer } from "@/lib/auth/types";
import { useTheme } from "@/lib/theme";

type Props = {
  viewer: Viewer;
  isPro: boolean;
  onTogglePro: () => void;
  onOpenCommandConnections: () => void;
  onReplaySetup: () => void;
};

/** Account, appearance, workspace controls, and irreversible account deletion. */
export function SettingsPanel({
  viewer,
  isPro,
  onTogglePro,
  onOpenCommandConnections,
  onReplaySetup,
}: Props) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirmDelete = confirmText.trim().toUpperCase() === "DELETE" && !deleting;

  async function handleDeleteAccount(event: FormEvent) {
    event.preventDefault();
    if (!canConfirmDelete) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Could not delete your account. Try again.");
        setDeleting(false);
        return;
      }
      try {
        window.localStorage.removeItem("nexus:setup-done.v1");
        window.localStorage.removeItem("nexus:setup-resume.v1");
        window.localStorage.removeItem("nexus:installed-nodes.v1");
        window.sessionStorage.removeItem("nexus:setup-resume.v1");
      } catch {
        // Ignore storage errors
      }
      setConfirmOpen(false);
      router.replace("/");
      router.refresh();
    } catch {
      setError("Network error while deleting your account.");
      setDeleting(false);
    }
  }

  return (
    <section aria-labelledby="settings-heading" className="flex flex-col gap-5">
      <header className="space-y-1">
        <h2 id="settings-heading" className="dash-heading">
          Settings
        </h2>
        <p className="text-[13px] leading-snug text-muted-foreground">
          Manage your profile, appearance, connected apps, and account data.
        </p>
      </header>

      {/* Profile & Tier */}
      <Card size="sm" className="rounded-2xl border border-border/80 bg-card/60 ring-0 shadow-none">
        <CardHeader className="pb-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="font-sans text-[14.5px] font-medium truncate">
                {viewer.name?.trim() || "Nexus member"}
              </CardTitle>
              {viewer.email ? (
                <CardDescription className="truncate text-[12.5px]">
                  {viewer.email}
                </CardDescription>
              ) : null}
            </div>
            <Badge
              variant="outline"
              className="shrink-0 border-[color:var(--land-line)] px-2.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--land-gold-soft)]"
            >
              {isPro ? "Pro" : "Free"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Separator />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={isPro ? "outline" : "default"}
              onClick={onTogglePro}
              className={
                !isPro
                  ? "border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
                  : undefined
              }
            >
              {isPro ? "Back to Free tier" : "Preview Pro"}
            </Button>
            <form action={signOutAction}>
              <Button type="submit" size="sm" variant="outline" className="gap-1.5">
                <LogOut className="size-3.5" />
                <span>Sign out</span>
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card size="sm" className="rounded-2xl border border-border/80 bg-card/60 ring-0 shadow-none">
        <CardHeader>
          <CardTitle className="font-sans text-[14px] font-medium">Appearance</CardTitle>
          <CardDescription className="text-[12.5px]">
            Choose how Nexus renders across the canvas, panels, and menus.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={theme === "dark" ? "default" : "outline"}
              onClick={() => setTheme("dark")}
              aria-pressed={theme === "dark"}
              className="h-9 justify-center gap-2 rounded-xl"
            >
              <Moon className="size-3.5" />
              <span>Dark mode</span>
            </Button>
            <Button
              type="button"
              variant={theme === "light" ? "default" : "outline"}
              onClick={() => setTheme("light")}
              aria-pressed={theme === "light"}
              className="h-9 justify-center gap-2 rounded-xl"
            >
              <Sun className="size-3.5" />
              <span>Light mode</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Workspace tools */}
      <Card size="sm" className="rounded-2xl border border-border/80 bg-card/60 ring-0 shadow-none">
        <CardHeader>
          <CardTitle className="font-sans text-[14px] font-medium">Workspace setup</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onOpenCommandConnections}
            className="h-9 w-full justify-between rounded-xl px-3 font-normal"
          >
            <span>Manage Command apps &amp; tokens</span>
            <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
              Command <ArrowRight className="size-3" />
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onReplaySetup}
            className="h-9 w-full justify-between rounded-xl px-3 font-normal"
          >
            <span>Run onboarding setup wizard</span>
            <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
              Restart <RotateCcw className="size-3" />
            </span>
          </Button>
        </CardContent>
      </Card>

      {/* Danger zone: Delete Account with AlertDialog */}
      <Card
        size="sm"
        className="rounded-2xl border border-destructive/30 bg-destructive/5 ring-0 shadow-none"
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-sans text-[14px] font-medium text-destructive">
            <ShieldAlert className="size-4" />
            <span>Delete account</span>
          </CardTitle>
          <CardDescription className="text-[12.5px] leading-relaxed">
            Permanently remove your Nexus profile, encrypted app tokens, Command history, Research
            library, and active sessions. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog
            open={confirmOpen}
            onOpenChange={(next) => {
              if (deleting) return;
              setConfirmOpen(next);
              if (!next) {
                setConfirmText("");
                setError(null);
              }
            }}
          >
            <AlertDialogTrigger
              render={
                <Button type="button" variant="destructive" size="sm">
                  Delete my account
                </Button>
              }
            />
            <AlertDialogContent className="border border-border bg-popover text-popover-foreground ring-0 sm:max-w-md">
              <AlertDialogHeader className="place-items-start text-left">
                <AlertDialogTitle className="font-heading text-xl font-normal">
                  Permanently delete your account?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This wipes your account, encrypted tokens, Command data, and saved Research
                  sources immediately.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <form onSubmit={handleDeleteAccount} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="delete-account-confirm" className="text-xs">
                    Type <code className="dash-code font-semibold">DELETE</code> to confirm
                  </Label>
                  <Input
                    id="delete-account-confirm"
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="DELETE"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={deleting}
                    className="h-9 rounded-xl border border-border bg-background/50"
                  />
                </div>

                {error ? (
                  <Alert variant="destructive" className="rounded-xl py-2.5">
                    <AlertDescription className="text-xs">{error}</AlertDescription>
                  </Alert>
                ) : null}

                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                  <Button type="submit" variant="destructive" disabled={!canConfirmDelete}>
                    {deleting ? "Deleting account…" : "Permanently delete account"}
                  </Button>
                </AlertDialogFooter>
              </form>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </section>
  );
}
