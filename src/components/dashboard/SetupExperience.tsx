"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { LocationInput } from "@/components/command/ConnectionsView";
import { SourceGlyph } from "@/components/command/parts";
import { useCommand, type CommandController } from "@/components/command/use-command";
import { SAMPLE_EXTENSIONS } from "@/extensions/samples";
import { connectGoogleServices } from "@/lib/command/google-connect";
import {
  COMMAND_WIDGETS,
  OVERVIEW_COLUMNS,
  OVERVIEW_ROWS,
  overviewAccepts,
  placeWidgets,
  widgetDef,
} from "@/lib/command/widgets";
import { CONNECTOR_CATALOG } from "@/lib/connectors/catalog";
import type { ConnectorManifest } from "@/lib/connectors/types";
import {
  FREE_ACTIVE_EXTENSION_SLOTS,
  type ExtensionHubSnapshot,
  type ExtensionId,
} from "@/lib/extensions";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { ArrowRight, CheckIcon, ChevronLeft, CloseIcon, MoonIcon, SunIcon } from "./icons";
import { SetupCanvas, type SetupStagePhase } from "./SetupCanvas";

export type SetupStep = "name" | "theme" | "apps" | "widgets" | "nodes";

export const SETUP_RESUME_KEY = "nexus:setup-resume.v1";

const STEPS: { id: SetupStep; num: number; label: string }[] = [
  { id: "name", num: 1, label: "Name" },
  { id: "theme", num: 2, label: "Theme" },
  { id: "apps", num: 3, label: "Apps" },
  { id: "widgets", num: 4, label: "Widgets" },
  { id: "nodes", num: 5, label: "Nodes" },
];

const DEFAULT_SAMPLE_NODES: ExtensionId[] = [
  "dev.nexus.sample.daily-brief",
  "dev.nexus.sample.focus-guard",
];

function computeSuggestedWidgets(connectedConnectorIds: Set<string>): string[] {
  const candidates: string[] = [];
  for (const w of COMMAND_WIDGETS) {
    if (connectedConnectorIds.has(w.connectorId) || !w.needsConnection) {
      candidates.push(w.id);
    }
  }
  if (!candidates.includes("weather")) candidates.push("weather");
  if (candidates.length < 3) {
    for (const fallback of ["calendar", "tasks", "crypto"]) {
      if (!candidates.includes(fallback)) candidates.push(fallback);
    }
  }
  return placeWidgets(candidates).map((p) => p.id);
}

function defaultSettingsFor(m: ConnectorManifest): Record<string, string> {
  return Object.fromEntries(
    (m.settings ?? []).map((s) => [s.key, s.defaultValue ?? ""]),
  );
}

function rememberSetupResume() {
  try {
    document.cookie = "nexus_setup_resume=apps; path=/; max-age=600; SameSite=Lax";
    window.sessionStorage.setItem(SETUP_RESUME_KEY, "apps");
    window.localStorage.setItem(SETUP_RESUME_KEY, "apps");
  } catch {
    // Ignore storage failures
  }
}

export function SetupExperience({
  initialName,
  theme,
  hub,
  initialStep,
  oauthNotice,
  onDismissNotice,
  onNameSaved,
  onPersistSetup,
  onComplete,
  onSkip,
}: {
  initialName: string;
  theme: ThemeMode;
  hub: ExtensionHubSnapshot;
  initialStep: SetupStep | null;
  oauthNotice: { ok: boolean; text: string } | null;
  onDismissNotice: () => void;
  onNameSaved: (name: string) => void;
  onPersistSetup?: (nodeIds: ExtensionId[]) => Promise<void>;
  onComplete: (nodeIds: ExtensionId[], options?: { fromFinale?: boolean }) => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const command = useCommand();
  const { setTheme } = useTheme();
  const [stage, setStage] = useState<SetupStagePhase>(initialStep ? "modal" : "singularity");
  const [step, setStep] = useState<SetupStep>(initialStep ?? "name");
  const [impulseSerial, setImpulseSerial] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const [nameInput, setNameInput] = useState(initialName);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [widgetIds, setWidgetIds] = useState<string[] | null>(null);
  const [widgetsTouched, setWidgetsTouched] = useState(false);

  const [selectedNodes, setSelectedNodes] = useState<ExtensionId[]>(() => {
    const active = hub.slots.flatMap((s) => (s.occupiedBy ? [s.occupiedBy] : []));
    return active.length > 0 ? active.slice(0, FREE_ACTIVE_EXTENSION_SLOTS) : DEFAULT_SAMPLE_NODES;
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const modalTimerRef = useRef<number | undefined>(undefined);
  const finaleFallbackRef = useRef<number | undefined>(undefined);
  const persistPromiseRef = useRef<Promise<void> | null>(null);
  const finaleHandledRef = useRef(false);
  useEffect(
    () => () => {
      window.clearTimeout(modalTimerRef.current);
      window.clearTimeout(finaleFallbackRef.current);
    },
    [],
  );

  const connectionsList = command.state?.connections;
  const connections = useMemo(
    () => new Map((connectionsList ?? []).map((c) => [c.connectorId, c])),
    [connectionsList],
  );
  const connectedIds = useMemo(() => new Set(connections.keys()), [connections]);

  const overviewIds = command.state?.overview;
  const effectiveWidgetIds = useMemo(() => {
    if (widgetIds !== null) return widgetIds;
    if (overviewIds && overviewIds.length > 0) {
      return placeWidgets(overviewIds).map((p) => p.id);
    }
    return computeSuggestedWidgets(connectedIds);
  }, [widgetIds, overviewIds, connectedIds]);

  function pulse() {
    setImpulseSerial((s) => s + 1);
  }

  function handleStart() {
    if (stage !== "singularity") return;
    setStage("exploding");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    modalTimerRef.current = window.setTimeout(
      () => setStage("modal"),
      reduceMotion ? 120 : 1080,
    );
  }

  function goToStep(next: SetupStep) {
    if (step === "widgets" && widgetsTouched && command.state) {
      const normalized = placeWidgets(effectiveWidgetIds).map((p) => p.id);
      void command.setOverview(normalized);
      setWidgetsTouched(false);
    }
    setNameError(null);
    setStep(next);
    pulse();
  }

  async function saveNameAndContinue(target: SetupStep = "theme") {
    if (nameSaving) return;
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError("Enter a name to continue, or skip setup.");
      return;
    }
    if (trimmed.length > 80) {
      setNameError("Keep your name under 80 characters.");
      return;
    }
    setNameError(null);

    if (trimmed === initialName.trim()) {
      onNameSaved(trimmed);
      goToStep(target);
      return;
    }

    setNameSaving(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; name?: string; error?: string }
        | null;
      if (!res.ok) {
        setNameError(body?.error ?? "Could not save your name.");
        return;
      }
      const saved = body?.name?.trim() || trimmed;
      setNameInput(saved);
      onNameSaved(saved);
      goToStep(target);
    } catch {
      setNameError("Network error while saving your name.");
    } finally {
      setNameSaving(false);
    }
  }

  async function finalizeAfterAnimation() {
    if (finaleHandledRef.current) return;
    finaleHandledRef.current = true;
    window.clearTimeout(finaleFallbackRef.current);
    try {
      if (persistPromiseRef.current) {
        await persistPromiseRef.current;
      }
      await onComplete(selectedNodes, { fromFinale: true });
    } catch {
      finaleHandledRef.current = false;
      setFinishing(false);
      setStage("modal");
    }
  }

  async function handleFinish() {
    if (finishing) return;
    setFinishing(true);
    finaleHandledRef.current = false;

    persistPromiseRef.current = (async () => {
      if (command.state) {
        const finalWidgets = placeWidgets(effectiveWidgetIds).map((p) => p.id);
        await command.setOverview(finalWidgets);
      }
      await onPersistSetup?.(selectedNodes);
    })();

    setStage("finale");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    finaleFallbackRef.current = window.setTimeout(
      () => void finalizeAfterAnimation(),
      reduceMotion ? 260 : 3200,
    );
  }

  async function handleSkip() {
    if (finishing) return;
    setFinishing(true);
    try {
      await onSkip();
    } finally {
      setFinishing(false);
    }
  }

  const currentStepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div
      ref={rootRef}
      className="dash setup-root relative h-[100svh] w-full flex-1 overflow-hidden"
      data-theme={theme}
    >
      <div className="absolute inset-0">
        <SetupCanvas
          phase={stage}
          theme={theme}
          impulseSerial={impulseSerial}
          onClickSingularity={handleStart}
          onFinaleComplete={() => void finalizeAfterAnimation()}
          onCoreLayout={(y) => rootRef.current?.style.setProperty("--setup-core-y", `${y}px`)}
        />
      </div>

      {stage === "singularity" ? (
        <div className="setup-start-layer pointer-events-none absolute inset-0 z-20">
          <div className="setup-start-pos">
            <button
              type="button"
              onClick={handleStart}
              className="setup-start-button pointer-events-auto"
            >
              Press to get Started
            </button>
          </div>
        </div>
      ) : null}

      {stage === "modal" ? (
        <div className="setup-modal-backdrop fixed inset-0 z-30 flex items-center justify-center p-4 sm:p-6">
          <section
            aria-label="Workspace setup"
            className="setup-card relative flex max-h-[86svh] w-full max-w-[660px] flex-col overflow-hidden"
          >
            <header className="setup-card-head flex flex-wrap items-center justify-between gap-3 px-6 py-4">
              <div className="flex flex-wrap items-center gap-1.5">
                {STEPS.map((s) => {
                  const active = s.id === step;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        if (step === "name" && s.id !== "name") {
                          const trimmed = nameInput.trim();
                          if (trimmed && trimmed !== initialName.trim()) {
                            void saveNameAndContinue(s.id);
                            return;
                          }
                        }
                        goToStep(s.id);
                      }}
                      className="setup-step-pill"
                      data-active={active ? "true" : "false"}
                    >
                      <span className="setup-step-num">{s.num}</span>
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => void handleSkip()}
                disabled={finishing}
                className="setup-skip-link"
              >
                Skip setup
              </button>
            </header>

            <div className="px-6 pt-5 pb-3">
              <h1 className="setup-title text-[20px] font-medium tracking-[-0.02em]">
                {step === "name"
                  ? "What should Nexus call you?"
                  : step === "theme"
                    ? "Choose your appearance"
                    : step === "apps"
                      ? "Connect apps"
                      : step === "widgets"
                        ? "Organize widgets"
                        : "Install nodes"}
              </h1>
              <p className="setup-subtitle mt-1 text-[13px]">
                {step === "name"
                  ? "Your workspace greets you by this name."
                  : step === "theme"
                    ? "Pick the look that fits your workspace."
                    : step === "apps"
                      ? "Enable feeds or link accounts for Command."
                      : step === "widgets"
                        ? "Drag to reorder your 4×2 Command board, or toggle tiles below."
                        : `Select up to ${FREE_ACTIVE_EXTENSION_SLOTS} starter nodes (${selectedNodes.length}/${FREE_ACTIVE_EXTENSION_SLOTS} active).`}
              </p>
            </div>

            {oauthNotice ? (
              <div className="mx-6 mb-2">
                <div
                  role="status"
                  className="setup-notice flex items-center justify-between gap-3 px-3.5 py-2 text-[12.5px]"
                  data-ok={oauthNotice.ok ? "true" : "false"}
                >
                  <span>{oauthNotice.text}</span>
                  <button
                    type="button"
                    onClick={onDismissNotice}
                    className="setup-icon-btn"
                    aria-label="Dismiss notice"
                  >
                    <CloseIcon size={13} />
                  </button>
                </div>
              </div>
            ) : null}

            <div className="setup-card-body min-h-0 flex-1 overflow-y-auto px-6 py-3">
              {step === "name" ? (
                <SetupNameStep
                  value={nameInput}
                  error={nameError}
                  busy={nameSaving}
                  onChange={(v) => {
                    setNameInput(v);
                    if (nameError) setNameError(null);
                  }}
                  onSubmit={() => void saveNameAndContinue("theme")}
                />
              ) : step === "theme" ? (
                <SetupThemeStep
                  theme={theme}
                  onSelect={(next) => {
                    setTheme(next);
                    pulse();
                  }}
                />
              ) : step === "apps" ? (
                <SetupAppsStep
                  command={command}
                  connectedIds={connectedIds}
                  onPulse={pulse}
                />
              ) : step === "widgets" ? (
                <SetupWidgetsStep
                  widgetIds={effectiveWidgetIds}
                  connectedIds={connectedIds}
                  onChange={(next) => {
                    setWidgetIds(next);
                    setWidgetsTouched(true);
                    pulse();
                  }}
                />
              ) : (
                <SetupNodesStep
                  selectedNodes={selectedNodes}
                  onChange={(next) => {
                    setSelectedNodes(next);
                    pulse();
                  }}
                />
              )}
            </div>

            <footer className="setup-card-foot flex items-center justify-between gap-3 px-6 py-4">
              <div>
                {currentStepIndex > 0 ? (
                  <button
                    type="button"
                    onClick={() => goToStep(STEPS[currentStepIndex - 1]!.id)}
                    className="setup-btn setup-btn--ghost"
                  >
                    <ChevronLeft size={14} />
                    <span>Back</span>
                  </button>
                ) : (
                  <span />
                )}
              </div>

              <div className="flex items-center gap-2.5">
                {step === "name" ? (
                  <button
                    type="button"
                    disabled={nameSaving}
                    onClick={() => void saveNameAndContinue("theme")}
                    className="setup-btn setup-btn--primary"
                  >
                    <span>{nameSaving ? "Saving…" : "Continue"}</span>
                    <ArrowRight size={14} />
                  </button>
                ) : currentStepIndex < STEPS.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => goToStep(STEPS[currentStepIndex + 1]!.id)}
                    className="setup-btn setup-btn--primary"
                  >
                    <span>Continue</span>
                    <ArrowRight size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={finishing}
                    onClick={() => void handleFinish()}
                    className="setup-btn setup-btn--primary"
                  >
                    <span>{finishing ? "Preparing workspace…" : "Enter Nexus"}</span>
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

/* ============================================================================
   STEP 1: NAME
   ============================================================================ */

function SetupNameStep({
  value,
  error,
  busy,
  onChange,
  onSubmit,
}: {
  value: string;
  error: string | null;
  busy: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <form onSubmit={handleFormSubmit} className="py-4">
      <label className="block">
        <span className="setup-label">Name</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Your name"
          maxLength={80}
          disabled={busy}
          autoFocus
          autoComplete="given-name"
          className="setup-input mt-2"
        />
      </label>
      {error ? (
        <p className="setup-error mt-2.5" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/* ============================================================================
   STEP 2: THEME
   ============================================================================ */

function SetupThemeStep({
  theme,
  onSelect,
}: {
  theme: ThemeMode;
  onSelect: (next: ThemeMode) => void;
}) {
  const options: { id: ThemeMode; title: string; note: string }[] = [
    { id: "dark", title: "Dark", note: "Deep obsidian surface" },
    { id: "light", title: "Light", note: "Clean paper white" },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2">
      {options.map((opt) => {
        const active = theme === opt.id;
        const isDark = opt.id === "dark";
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            className="setup-theme-card text-left"
            data-active={active ? "true" : "false"}
            aria-pressed={active}
          >
            <div
              className="setup-theme-preview"
              style={{
                background: isDark ? "#08080a" : "#f7f7f9",
                borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)",
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="h-2 w-10 rounded-full"
                  style={{ background: isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.16)" }}
                />
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: isDark ? "#f4f4f6" : "#111113" }}
                />
              </div>
              <div className="mt-4 space-y-1.5">
                <div
                  className="h-2 w-3/4 rounded-full"
                  style={{ background: isDark ? "rgba(255,255,255,0.68)" : "rgba(0,0,0,0.72)" }}
                />
                <div
                  className="h-2 w-1/2 rounded-full"
                  style={{ background: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.14)" }}
                />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-1.5">
                {[0, 1, 2].map((idx) => (
                  <div
                    key={idx}
                    className="h-5 rounded-[5px]"
                    style={{
                      background: isDark ? "rgba(255,255,255,0.06)" : "#ffffff",
                      border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"}`,
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {isDark ? <MoonIcon size={14} /> : <SunIcon size={14} />}
                <div>
                  <div className="setup-row-title">{opt.title}</div>
                  <div className="setup-row-sub">{opt.note}</div>
                </div>
              </div>
              <span className="setup-check-ring" data-checked={active ? "true" : "false"}>
                {active ? <CheckIcon size={11} /> : null}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================================
   STEP 3: CONNECT APPS (SIMPLIFIED MONOCHROME LIST)
   ============================================================================ */

function SetupAppsStep({
  command,
  connectedIds,
  onPulse,
}: {
  command: CommandController;
  connectedIds: Set<string>;
  onPulse: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const available = useMemo(
    () => CONNECTOR_CATALOG.filter((m) => m.live.status === "available"),
    [],
  );
  const instantApps = available.filter((m) => m.auth.type === "none");
  const accountApps = available.filter((m) => m.auth.type !== "none");
  const googleApps = available.filter(
    (m) => m.auth.type === "oauth" && m.auth.provider === "google",
  );
  const availability = command.state?.availability ?? {};
  const googleConnectable = googleApps.some((m) => availability[m.id]?.connectable);
  const unconnectedGoogleIds = googleApps
    .filter((m) => !connectedIds.has(m.id))
    .map((m) => m.id);

  async function toggleInstant(m: ConnectorManifest) {
    setFormError(null);
    if (!command.state) {
      setFormError("Command storage is still initializing. Try again in a moment.");
      return;
    }
    if (connectedIds.has(m.id)) {
      const err = await command.disconnect(m.id);
      if (err) setFormError(err);
      else onPulse();
      return;
    }
    const err = await command.connect(m.id, { settings: defaultSettingsFor(m) });
    if (err) setFormError(err);
    else onPulse();
  }

  return (
    <div className="space-y-4">
      {formError ? (
        <p className="setup-error" role="alert">
          {formError}
        </p>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="setup-label">Instant feeds</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {instantApps.map((m) => {
            const isConnected = connectedIds.has(m.id);
            const isExpanded = expandedId === m.id;
            const busy =
              command.pending === `connect:${m.id}` ||
              command.pending === `disconnect:${m.id}`;
            const hasSettings = (m.settings?.length ?? 0) > 0;
            return (
              <div
                key={m.id}
                className="setup-item-card"
                data-selected={isConnected ? "true" : "false"}
              >
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <SourceGlyph connectorId={m.id} />
                    <div className="min-w-0">
                      <div className="setup-row-title truncate">{m.name}</div>
                      <div className="setup-row-sub truncate">{m.description}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isConnected && hasSettings ? (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : m.id)}
                        className="setup-text-btn"
                      >
                        {isExpanded ? "Close" : "Edit"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy || !command.state}
                      onClick={() => void toggleInstant(m)}
                      className="setup-pill-btn"
                      data-active={isConnected ? "true" : "false"}
                    >
                      {busy ? "…" : isConnected ? "Connected" : "Connect"}
                    </button>
                  </div>
                </div>
                {isExpanded ? (
                  <SetupConnectorInlineForm
                    manifest={m}
                    connection={command.state?.connections.find((c) => c.connectorId === m.id) ?? null}
                    command={command}
                    onSaved={() => {
                      setExpandedId(null);
                      onPulse();
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="setup-label">Accounts &amp; APIs</span>
          {googleConnectable && unconnectedGoogleIds.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                rememberSetupResume();
                void connectGoogleServices(unconnectedGoogleIds);
              }}
              className="setup-text-btn"
            >
              Connect all Google ({unconnectedGoogleIds.length})
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {accountApps.map((m) => {
            const isConnected = connectedIds.has(m.id);
            const isExpanded = expandedId === m.id;
            const busy =
              command.pending === `connect:${m.id}` ||
              command.pending === `disconnect:${m.id}`;
            const connectable = availability[m.id]?.connectable ?? false;
            const conn = command.state?.connections.find((c) => c.connectorId === m.id) ?? null;

            return (
              <div
                key={m.id}
                className="setup-item-card"
                data-selected={isConnected ? "true" : "false"}
              >
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <SourceGlyph connectorId={m.id} />
                    <div className="min-w-0">
                      <div className="setup-row-title truncate">{m.name}</div>
                      <div className="setup-row-sub truncate">
                        {m.auth.type === "oauth" ? "OAuth" : "API token"}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {!command.state ? (
                      <span className="setup-row-sub">Loading</span>
                    ) : !connectable && !isConnected ? (
                      <span className="setup-row-sub">Unconfigured</span>
                    ) : isConnected ? (
                      <>
                        {(m.settings?.length ?? 0) > 0 ? (
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : m.id)}
                            className="setup-text-btn"
                          >
                            {isExpanded ? "Close" : "Edit"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            const err = await command.disconnect(m.id);
                            if (err) setFormError(err);
                            else onPulse();
                          }}
                          className="setup-pill-btn"
                          data-active="true"
                        >
                          {busy ? "…" : "Connected"}
                        </button>
                      </>
                    ) : m.auth.type === "oauth" ? (
                      m.auth.provider === "google" ? (
                        <button
                          type="button"
                          className="setup-pill-btn"
                          onClick={() => {
                            rememberSetupResume();
                            void connectGoogleServices([m.id]);
                          }}
                        >
                          Connect
                        </button>
                      ) : (
                        <a
                          href={`/api/command/oauth/${m.id}/start`}
                          onClick={rememberSetupResume}
                          className="setup-pill-btn"
                        >
                          Connect
                        </a>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : m.id)}
                        className="setup-pill-btn"
                      >
                        {isExpanded ? "Cancel" : "Add key"}
                      </button>
                    )}
                  </div>
                </div>
                {isExpanded ? (
                  <SetupConnectorInlineForm
                    manifest={m}
                    connection={conn}
                    command={command}
                    onSaved={() => {
                      setExpandedId(null);
                      onPulse();
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SetupConnectorInlineForm({
  manifest: m,
  connection,
  command,
  onSaved,
}: {
  manifest: ConnectorManifest;
  connection: { settings: Record<string, string>; hasCredentials: boolean } | null;
  command: CommandController;
  onSaved: () => void;
}) {
  const [settings, setSettings] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (m.settings ?? []).map((s) => [s.key, connection?.settings[s.key] ?? s.defaultValue ?? ""]),
    ),
  );
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const busy = command.pending === `connect:${m.id}`;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const err = await command.connect(m.id, {
      settings,
      credentials: m.auth.type === "api_key" ? credentials : undefined,
    });
    if (err) {
      setError(err);
      return;
    }
    setCredentials({});
    onSaved();
  }

  return (
    <form onSubmit={onSubmit} className="setup-inline-form mt-2.5 space-y-2 pt-2.5">
      {m.auth.type === "api_key"
        ? m.auth.fields.map((f) => (
            <label key={f.key} className="block">
              <span className="setup-label">{f.label}</span>
              <input
                type={f.secret ? "password" : "text"}
                value={credentials[f.key] ?? ""}
                onChange={(e) => setCredentials((c) => ({ ...c, [f.key]: e.target.value }))}
                placeholder={connection?.hasCredentials ? "Saved · enter to replace" : f.placeholder}
                className="setup-input setup-input--sm mt-1"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          ))
        : null}
      {(m.settings ?? []).map((s) =>
        s.type === "location" ? (
          <LocationInput
            key={s.key}
            field={s}
            value={settings[s.key] ?? ""}
            onChange={(v) => setSettings((prev) => ({ ...prev, [s.key]: v }))}
          />
        ) : (
          <label key={s.key} className="block">
            <span className="setup-label">{s.label}</span>
            <input
              type="text"
              value={settings[s.key] ?? ""}
              onChange={(e) => setSettings((prev) => ({ ...prev, [s.key]: e.target.value }))}
              placeholder={s.placeholder}
              className="setup-input setup-input--sm mt-1"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        ),
      )}
      {error ? <p className="setup-error">{error}</p> : null}
      <div className="flex justify-end">
        <button type="submit" disabled={busy} className="setup-pill-btn" data-active="true">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

/* ============================================================================
   STEP 4: ORGANIZE WIDGETS (SIMPLIFIED 4x2 BOARD + TOGGLE PILLS)
   ============================================================================ */

function buildEmptyGridCells(placed: readonly { x: number; y: number; w: number; h: number }[]) {
  const occupied = Array.from({ length: OVERVIEW_ROWS }, () =>
    Array<boolean>(OVERVIEW_COLUMNS).fill(false),
  );
  for (const w of placed) {
    for (let dy = 0; dy < w.h; dy++) {
      for (let dx = 0; dx < w.w; dx++) {
        if (occupied[w.y + dy]) occupied[w.y + dy]![w.x + dx] = true;
      }
    }
  }
  const open: { x: number; y: number }[] = [];
  for (let y = 0; y < OVERVIEW_ROWS; y++) {
    for (let x = 0; x < OVERVIEW_COLUMNS; x++) {
      if (!occupied[y]![x]) open.push({ x, y });
    }
  }
  return open;
}

function SetupWidgetsStep({
  widgetIds,
  connectedIds,
  onChange,
}: {
  widgetIds: string[];
  connectedIds: Set<string>;
  onChange: (next: string[]) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const placed = useMemo(() => placeWidgets(widgetIds), [widgetIds]);
  const openCells = useMemo(() => buildEmptyGridCells(placed), [placed]);
  const placedIds = placed.map((p) => p.id);

  function addWidget(id: string) {
    if (!overviewAccepts(placedIds, id)) return;
    onChange(placeWidgets([...placedIds, id]).map((p) => p.id));
  }

  function removeWidget(id: string) {
    onChange(placedIds.filter((item) => item !== id));
  }

  function swapOrReorder(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const fromIdx = placedIds.indexOf(sourceId);
    const toIdx = placedIds.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const copy = [...placedIds];
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved!);
    onChange(copy);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="setup-label">Board layout (4×2)</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onChange(computeSuggestedWidgets(connectedIds))}
            className="setup-text-btn"
          >
            Suggested
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="setup-text-btn"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="setup-board" role="region" aria-label="4 by 2 Command widget board">
        {placed.map((p) => {
          const def = widgetDef(p.id);
          return (
            <div
              key={p.id}
              draggable
              onDragStart={() => setDraggingId(p.id)}
              onDragEnd={() => {
                setDraggingId(null);
                setDragOverId(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverId !== p.id) setDragOverId(p.id);
              }}
              onDragLeave={() => {
                if (dragOverId === p.id) setDragOverId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggingId) swapOrReorder(draggingId, p.id);
                setDraggingId(null);
                setDragOverId(null);
              }}
              className="setup-board-tile"
              data-dragging={draggingId === p.id ? "true" : "false"}
              data-drop-target={dragOverId === p.id && draggingId !== p.id ? "true" : "false"}
              style={{
                gridColumn: `${p.x + 1} / span ${p.w}`,
                gridRow: `${p.y + 1} / span ${p.h}`,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="setup-row-title truncate">{def?.name ?? p.id}</span>
                <button
                  type="button"
                  onClick={() => removeWidget(p.id)}
                  className="setup-icon-btn"
                  aria-label={`Remove ${def?.name ?? p.id}`}
                >
                  <CloseIcon size={11} />
                </button>
              </div>
              <span className="setup-row-sub">
                {p.w}×{p.h}
              </span>
            </div>
          );
        })}

        {openCells.map((cell) => (
          <div
            key={`empty-${cell.x}-${cell.y}`}
            className="setup-board-empty"
            style={{
              gridColumn: `${cell.x + 1} / span 1`,
              gridRow: `${cell.y + 1} / span 1`,
            }}
          />
        ))}
      </div>

      <div>
        <span className="setup-label mb-2 block">Widgets</span>
        <div className="flex flex-wrap gap-2">
          {COMMAND_WIDGETS.map((w) => {
            const onBoard = placedIds.includes(w.id);
            const canAdd = onBoard || overviewAccepts(placedIds, w.id);
            return (
              <button
                key={w.id}
                type="button"
                disabled={!canAdd}
                onClick={() => (onBoard ? removeWidget(w.id) : addWidget(w.id))}
                className="setup-widget-chip"
                data-selected={onBoard ? "true" : "false"}
              >
                {onBoard ? <CheckIcon size={11} /> : null}
                <span>{w.name}</span>
                <span className="setup-chip-dim">
                  {w.w}×{w.h}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   STEP 5: INSTALL NODES (SIMPLIFIED 2x2 SAMPLE EXTENSIONS)
   ============================================================================ */

function SetupNodesStep({
  selectedNodes,
  onChange,
}: {
  selectedNodes: ExtensionId[];
  onChange: (next: ExtensionId[]) => void;
}) {
  function toggleNode(id: ExtensionId) {
    if (selectedNodes.includes(id)) {
      onChange(selectedNodes.filter((n) => n !== id));
      return;
    }
    if (selectedNodes.length >= FREE_ACTIVE_EXTENSION_SLOTS) {
      onChange([...selectedNodes.slice(1), id]);
      return;
    }
    onChange([...selectedNodes, id]);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {SAMPLE_EXTENSIONS.map((ext) => {
          const { id, name, monogram, description } = ext.manifest;
          const active = selectedNodes.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggleNode(id)}
              className="setup-item-card text-left"
              data-selected={active ? "true" : "false"}
              aria-pressed={active}
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="setup-node-monogram" data-active={active ? "true" : "false"}>
                    {monogram ?? name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="setup-row-title truncate">{name}</div>
                    <div className="setup-row-sub truncate">{description}</div>
                  </div>
                </div>
                <span className="setup-check-ring shrink-0" data-checked={active ? "true" : "false"}>
                  {active ? <CheckIcon size={11} /> : null}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <p className="setup-footer-note">
        Showing sample starter nodes for now. Functional nodes will be added here in later updates.
      </p>
    </div>
  );
}
