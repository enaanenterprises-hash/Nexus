"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signOutAction } from "@/lib/auth/actions";
import type { Viewer } from "@/lib/auth/types";
import { useTheme } from "@/lib/theme";
import { MoonIcon, SignOutIcon, SunIcon } from "./icons";

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
      router.replace("/");
      router.refresh();
    } catch {
      setError("Network error while deleting your account.");
      setDeleting(false);
    }
  }

  return (
    <section aria-labelledby="settings-heading" className="flex flex-col gap-7">
      <header>
        <p className="dash-eyebrow">Account & workspace</p>
        <h2 id="settings-heading" className="dash-heading mt-2">
          Settings
        </h2>
        <p className="mt-1 text-[13px] leading-snug text-[color:var(--land-muted)]">
          Manage your profile, appearance, connected apps, and account data.
        </p>
      </header>

      {/* Profile & Tier */}
      <div className="dash-card-subtle rounded-2xl border border-[color:var(--land-hair)] p-4">
        <p className="dash-eyebrow">Profile</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[14.5px] font-medium text-[color:var(--land-ink)]">
              {viewer.name?.trim() || "Nexus member"}
            </p>
            {viewer.email ? (
              <p className="truncate text-[12.5px] text-[color:var(--land-muted)]">{viewer.email}</p>
            ) : null}
          </div>
          <span className="shrink-0 rounded-full border border-[color:var(--land-line)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--land-gold-soft)]">
            {isPro ? "Pro" : "Free"}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[color:var(--land-hair)] pt-3">
          <button
            type="button"
            onClick={onTogglePro}
            className={`dash-button ${isPro ? "" : "dash-button--gold"}`}
          >
            {isPro ? "Back to Free tier" : "Preview Pro"}
          </button>
          <form action={signOutAction}>
            <button type="submit" className="dash-button inline-flex items-center gap-1.5">
              <SignOutIcon size={13} />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </div>

      {/* Appearance */}
      <div className="dash-card-subtle rounded-2xl border border-[color:var(--land-hair)] p-4">
        <p className="dash-eyebrow">Appearance</p>
        <p className="mt-1 text-[12.5px] text-[color:var(--land-muted)]">
          Choose how Nexus renders across the Laniakea canvas and panels.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTheme("dark")}
            aria-pressed={theme === "dark"}
            className={`settings-theme-btn ${theme === "dark" ? "settings-theme-btn--on" : ""}`}
          >
            <MoonIcon size={14} />
            <span>Dark mode</span>
          </button>
          <button
            type="button"
            onClick={() => setTheme("light")}
            aria-pressed={theme === "light"}
            className={`settings-theme-btn ${theme === "light" ? "settings-theme-btn--on" : ""}`}
          >
            <SunIcon size={14} />
            <span>Light mode</span>
          </button>
        </div>
      </div>

      {/* Workspace tools */}
      <div className="dash-card-subtle rounded-2xl border border-[color:var(--land-hair)] p-4">
        <p className="dash-eyebrow">Workspace setup</p>
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={onOpenCommandConnections}
            className="dash-button flex h-9 w-full items-center justify-between px-3 text-left text-[13px]"
          >
            <span>Manage Command apps & tokens</span>
            <span className="text-[11.5px] text-[color:var(--land-faint)]">Command →</span>
          </button>
          <button
            type="button"
            onClick={onReplaySetup}
            className="dash-button flex h-9 w-full items-center justify-between px-3 text-left text-[13px]"
          >
            <span>Run onboarding setup wizard</span>
            <span className="text-[11.5px] text-[color:var(--land-faint)]">Restart →</span>
          </button>
        </div>
      </div>

      {/* Danger zone: Delete Account */}
      <div className="settings-danger-card rounded-2xl p-4">
        <p className="dash-eyebrow text-[#f87171]">Danger zone</p>
        <h3 className="mt-2 text-[14.5px] font-medium text-[color:var(--land-ink)]">
          Delete account
        </h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[color:var(--land-muted)]">
          Permanently remove your Nexus profile, encrypted app tokens, Command history, Research library, and active sessions. This cannot be undone.
        </p>

        {!confirmOpen ? (
          <div className="mt-3.5">
            <button
              type="button"
              onClick={() => {
                setConfirmOpen(true);
                setError(null);
                setConfirmText("");
              }}
              className="settings-delete-btn"
            >
              Delete my account
            </button>
          </div>
        ) : (
          <form onSubmit={handleDeleteAccount} className="mt-4 space-y-3 border-t border-red-500/20 pt-3.5">
            <label htmlFor="delete-account-confirm" className="block">
              <span className="text-[12px] font-medium text-[color:var(--land-ink)]">
                Type <code className="dash-code font-semibold">DELETE</code> to confirm
              </span>
              <input
                id="delete-account-confirm"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                spellCheck={false}
                className="cmd-field mt-1.5 w-full"
              />
            </label>

            {error ? (
              <p className="cmd-error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={!canConfirmDelete}
                className="settings-confirm-btn"
              >
                {deleting ? "Deleting account…" : "Permanently delete account"}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  setConfirmOpen(false);
                  setConfirmText("");
                  setError(null);
                }}
                className="dash-button"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
