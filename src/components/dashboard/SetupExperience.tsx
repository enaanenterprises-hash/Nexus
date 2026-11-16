"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { LocationInput } from "@/components/command/ConnectionsView";
import { SourceGlyph, StatusDot } from "@/components/command/parts";
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
  EXTENSION_SLOT_BLUEPRINT,
  FREE_ACTIVE_EXTENSION_SLOTS,
  PLANNED_EXTENSIONS,
  type ExtensionHubSnapshot,
  type ExtensionId,
} from "@/lib/extensions";
import { ArrowRight, CheckIcon, ChevronLeft, CloseIcon, LockIcon, PlusIcon } from "./icons";
import { SetupCanvas, type SetupStagePhase } from "./SetupCanvas";

export type SetupStep = "apps" | "widgets" | "nodes";

export const SETUP_RESUME_KEY = "nexus:setup-resume.v1";

const STEPS: { id: SetupStep; num: number; label: string }[] = [
  { id: "apps", num: 1, label: "Connect apps" },
  { id: "widgets", num: 2, label: "Widgets" },
  { id: "nodes", num: 3, label: "Nodes" },
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
  // Ensure a rich starter layout if user connected only 0-1 services
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

export function SetupExperience({
  firstName,
  theme,
  hub,
  initialStep,
  oauthNotice,
  onDismissNotice,
  onComplete,
  onSkip,
}: {
  firstName: string;
  theme: "dark" | "light";
  hub: ExtensionHubSnapshot;
  initialStep: SetupStep | null;
  oauthNotice: { ok: boolean; text: string } | null;
  onDismissNotice: () => void;
  onComplete: (nodeIds: ExtensionId[]) => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const command = useCommand();
  const [stage, setStage] = useState<SetupStagePhase>(initialStep ? "modal" : "singularity");
  const [step, setStep] = useState<SetupStep>(initialStep ?? "apps");
  const [impulseSerial, setImpulseSerial] = useState(0);
  const [finishing, setFinishing] = useState(false);

  // Track widgets locally during organization, then persist smoothly
  const [widgetIds, setWidgetIds] = useState<string[] | null>(null);
  const [widgetsTouched, setWidgetsTouched] = useState(false);

  // Selected sample nodes for free sockets (up to FREE_ACTIVE_EXTENSION_SLOTS)
  const [selectedNodes, setSelectedNodes] = useState<ExtensionId[]>(() => {
    const active = hub.slots.flatMap((s) => (s.occupiedBy ? [s.occupiedBy] : []));
    return active.length > 0 ? active.slice(0, FREE_ACTIVE_EXTENSION_SLOTS) : DEFAULT_SAMPLE_NODES;
  });

  const modalTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(modalTimerRef.current), []);

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
    setStep(next);
    pulse();
  }

  async function handleFinish() {
    if (finishing) return;
    setFinishing(true);
    try {
      if (command.state) {
        const finalWidgets = placeWidgets(effectiveWidgetIds).map((p) => p.id);
        await command.setOverview(finalWidgets);
      }
      await onComplete(selectedNodes);
    } finally {
      setFinishing(false);
    }
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

  return (
    <div
      className="dash setup-root relative h-[100svh] w-full flex-1 overflow-hidden"
      data-theme={theme}
    >
      <div className="absolute inset-0">
        <SetupCanvas
          phase={stage}
          theme={theme}
          impulseSerial={impulseSerial}
          onClickSingularity={handleStart}
        />
      </div>

      {stage === "singularity" ? (
        <div className="setup-start-layer pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center px-6">
          <button
            type="button"
            onClick={handleStart}
            className="setup-start-button pointer-events-auto"
          >
            <span className="setup-start-kicker">Nexus · New workspace</span>
            <span className="setup-start-cta">Press to get Started</span>
          </button>
        </div>
      ) : null}

      {stage === "modal" ? (
        <div className="setup-modal-wrap pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4 sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-dialog-title"
            className="setup-card pointer-events-auto"
          >
            <header className="setup-card-header">
              <div className="min-w-0">
                <p className="dash-eyebrow">
                  {step === "apps"
                    ? `Set up Command · Welcome, ${firstName}`
                    : step === "widgets"
                      ? "Set up Command · Step 2 of 3"
                      : "Network setup · Step 3 of 3"}
                </p>
                <h1 id="setup-dialog-title" className="setup-card-title">
                  {step === "apps"
                    ? "Which apps would you like to connect?"
                    : step === "widgets"
                      ? "Organize your widgets page"
                      : "Which nodes would you like to install?"}
                </h1>
              </div>

              <button
                type="button"
                onClick={() => void handleSkip()}
                disabled={finishing}
                className="setup-skip-btn"
              >
                Skip setup
              </button>
            </header>

            <nav className="setup-steps" aria-label="Setup steps">
              {STEPS.map((s) => {
                const active = step === s.id;
                const currentIdx = STEPS.findIndex((item) => item.id === step);
                const itemIdx = STEPS.findIndex((item) => item.id === s.id);
                const done = itemIdx < currentIdx;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goToStep(s.id)}
                    aria-current={active ? "step" : undefined}
                    className={`setup-step-pill ${active ? "setup-step-pill--active" : ""} ${
                      done ? "setup-step-pill--done" : ""
                    }`}
                  >
                    <span className="setup-step-num">
                      {done ? <CheckIcon size={11} /> : s.num}
                    </span>
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </nav>

            {oauthNotice ? (
              <div
                className={`setup-notice ${oauthNotice.ok ? "setup-notice--ok" : "setup-notice--warn"}`}
                role="status"
              >
                <span>{oauthNotice.text}</span>
                <button
                  type="button"
                  onClick={onDismissNotice}
                  className="research-icon-button h-6 w-6"
                  aria-label="Dismiss notice"
                >
                  <CloseIcon size={12} />
                </button>
              </div>
            ) : null}

            <div className="setup-card-body dash-panel">
              {step === "apps" ? (
                <SetupAppsStep command={command} connectedIds={connectedIds} onPulse={pulse} />
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

            <footer className="setup-card-footer">
              <div className="flex items-center gap-2">
                {step !== "apps" ? (
                  <button
                    type="button"
                    onClick={() => goToStep(step === "nodes" ? "widgets" : "apps")}
                    className="dash-button inline-flex items-center gap-1.5"
                  >
                    <ChevronLeft size={14} />
                    <span>Back</span>
                  </button>
                ) : null}
                <span className="text-[12px] text-[color:var(--land-faint)]">
                  {step === "apps"
                    ? `${connectedIds.size} connected · you can adjust anytime in Command`
                    : step === "widgets"
                      ? `${placeWidgets(effectiveWidgetIds).length} placed on 4×2 board`
                      : `${selectedNodes.length} of ${FREE_ACTIVE_EXTENSION_SLOTS} free sockets selected`}
                </span>
              </div>

              {step !== "nodes" ? (
                <button
                  type="button"
                  onClick={() => goToStep(step === "apps" ? "widgets" : "nodes")}
                  className="dash-button dash-button--gold inline-flex items-center gap-1.5 px-4"
                >
                  <span>{step === "apps" ? "Next: Widgets" : "Next: Nodes"}</span>
                  <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={finishing}
                  onClick={() => void handleFinish()}
                  className="dash-button dash-button--gold inline-flex items-center gap-1.5 px-4"
                >
                  <span>{finishing ? "Launching…" : "Launch Nexus"}</span>
                  <ArrowRight size={14} />
                </button>
              )}
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

/* ============================================================================
   STEP 1: CONNECT APPS
   ============================================================================ */

function rememberSetupResume() {
  try {
    document.cookie = "nexus_setup_resume=apps; path=/; max-age=600; SameSite=Lax";
    window.sessionStorage.setItem(SETUP_RESUME_KEY, "apps");
    window.localStorage.setItem(SETUP_RESUME_KEY, "apps");
  } catch {
    // Ignore storage failures
  }
}

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
  const [showPlanned, setShowPlanned] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const available = useMemo(
    () => CONNECTOR_CATALOG.filter((m) => m.live.status === "available"),
    [],
  );
  const planned = useMemo(
    () => CONNECTOR_CATALOG.filter((m) => m.live.status === "planned"),
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
    <div className="space-y-5">
      <p className="text-[13.5px] leading-relaxed text-[color:var(--land-muted)]">
        Connect feeds and accounts for Command. Instant feeds turn on with one tap; accounts use OAuth or an encrypted token.
      </p>

      {formError ? (
        <p className="cmd-error" role="alert">
          {formError}
        </p>
      ) : null}

      {googleConnectable && unconnectedGoogleIds.length > 0 ? (
        <div className="setup-google-banner">
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium text-[color:var(--land-ink)]">
              Connect Google Workspace in one step
            </p>
            <p className="text-[12px] text-[color:var(--land-muted)]">
              Grant Calendar, Gmail, Tasks, and Mail sending scopes together ({unconnectedGoogleIds.length} remaining).
            </p>
          </div>
          <button
            type="button"
            className="dash-button dash-button--gold shrink-0"
            onClick={() => {
              rememberSetupResume();
              void connectGoogleServices(unconnectedGoogleIds);
            }}
          >
            Connect Google ({unconnectedGoogleIds.length})
          </button>
        </div>
      ) : null}

      <div>
        <p className="dash-eyebrow mb-2.5">Instant feeds · no API key needed</p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {instantApps.map((m) => {
            const isConnected = connectedIds.has(m.id);
            const busy = command.pending === `connect:${m.id}` || command.pending === `disconnect:${m.id}`;
            const hasSettings = (m.settings?.length ?? 0) > 0;
            const isExpanded = expandedId === m.id;
            return (
              <div
                key={m.id}
                className={`setup-item-card ${isConnected ? "setup-item-card--on" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <SourceGlyph connectorId={m.id} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[14px] font-medium text-[color:var(--land-ink)]">
                        {m.name}
                      </span>
                      <StatusDot tone={isConnected ? "ok" : "idle"} />
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[color:var(--land-faint)]">
                      {m.description}
                    </p>
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy || !command.state}
                        onClick={() => void toggleInstant(m)}
                        className={`dash-button h-7 px-2.5 text-[11.5px] ${
                          isConnected ? "" : "dash-button--gold"
                        }`}
                      >
                        {busy ? "Saving…" : isConnected ? "Connected · Remove" : "Connect"}
                      </button>
                      {hasSettings ? (
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : m.id)}
                          className="text-[11.5px] font-medium text-[color:var(--land-muted)] hover:text-[color:var(--land-ink)]"
                        >
                          {isExpanded ? "Hide options" : "Options"}
                        </button>
                      ) : null}
                    </div>
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
        <p className="dash-eyebrow mb-2.5">Accounts & developer tools</p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {accountApps.map((m) => {
            const conn = command.state?.connections.find((c) => c.connectorId === m.id) ?? null;
            const isConnected = Boolean(conn);
            const avail = availability[m.id];
            const connectable = avail ? avail.connectable : true;
            const isExpanded = expandedId === m.id;
            const busy = command.pending === `disconnect:${m.id}`;

            return (
              <div
                key={m.id}
                className={`setup-item-card ${isConnected ? "setup-item-card--on" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <SourceGlyph connectorId={m.id} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[14px] font-medium text-[color:var(--land-ink)]">
                        {m.name}
                      </span>
                      <StatusDot tone={isConnected ? "ok" : "idle"} />
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[color:var(--land-faint)]">
                      {m.description}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      {!command.state ? (
                        <span className="text-[11.5px] text-[color:var(--land-faint)]">Loading…</span>
                      ) : !connectable && !isConnected ? (
                        <span className="text-[11.5px] text-[color:var(--land-faint)]">
                          Needs server config
                        </span>
                      ) : isConnected ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={async () => {
                              const err = await command.disconnect(m.id);
                              if (err) setFormError(err);
                              else onPulse();
                            }}
                            className="dash-button h-7 px-2.5 text-[11.5px]"
                          >
                            {busy ? "Removing…" : "Connected · Disconnect"}
                          </button>
                          {(m.settings?.length ?? 0) > 0 ? (
                            <button
                              type="button"
                              onClick={() => setExpandedId(isExpanded ? null : m.id)}
                              className="text-[11.5px] font-medium text-[color:var(--land-muted)] hover:text-[color:var(--land-ink)]"
                            >
                              {isExpanded ? "Close" : "Edit"}
                            </button>
                          ) : null}
                        </>
                      ) : m.auth.type === "oauth" ? (
                        m.auth.provider === "google" ? (
                          <button
                            type="button"
                            className="dash-button dash-button--gold h-7 px-2.5 text-[11.5px]"
                            onClick={() => {
                              rememberSetupResume();
                              void connectGoogleServices([m.id]);
                            }}
                          >
                            Connect Google
                          </button>
                        ) : (
                          <a
                            href={`/api/command/oauth/${m.id}/start`}
                            onClick={rememberSetupResume}
                            className="dash-button dash-button--gold inline-flex h-7 items-center px-2.5 text-[11.5px]"
                          >
                            Connect {m.name}
                          </a>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : m.id)}
                          className="dash-button dash-button--gold h-7 px-2.5 text-[11.5px]"
                        >
                          {isExpanded ? "Cancel" : "Add token"}
                        </button>
                      )}
                    </div>
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

      <div className="border-t border-[color:var(--land-hair)] pt-3">
        <button
          type="button"
          onClick={() => setShowPlanned((v) => !v)}
          aria-expanded={showPlanned}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="dash-eyebrow">Planned apps · {planned.length} coming later</span>
          <span className="text-[12px] text-[color:var(--land-faint)]">
            {showPlanned ? "Hide" : "Show"}
          </span>
        </button>
        {showPlanned ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {planned.map((p) => (
              <span key={p.id} className="dash-chip h-7 px-2.5 text-[11.5px] opacity-75">
                {p.name}
              </span>
            ))}
          </div>
        ) : null}
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
    <form onSubmit={onSubmit} className="mt-3 space-y-2.5 border-t border-[color:var(--land-hair)] pt-3">
      {m.auth.type === "api_key"
        ? m.auth.fields.map((f) => (
            <label key={f.key} className="block">
              <span className="cmd-label">{f.label}</span>
              <input
                type={f.secret ? "password" : "text"}
                value={credentials[f.key] ?? ""}
                onChange={(e) => setCredentials((c) => ({ ...c, [f.key]: e.target.value }))}
                placeholder={connection?.hasCredentials ? "Saved · enter to replace" : f.placeholder}
                className="cmd-field mt-1 h-8 w-full text-[12.5px]"
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
            <span className="cmd-label">{s.label}</span>
            <input
              type="text"
              value={settings[s.key] ?? ""}
              onChange={(e) => setSettings((prev) => ({ ...prev, [s.key]: e.target.value }))}
              placeholder={s.placeholder}
              className="cmd-field mt-1 h-8 w-full text-[12.5px]"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        ),
      )}
      {error ? <p className="cmd-error">{error}</p> : null}
      <div className="flex justify-end">
        <button type="submit" disabled={busy} className="dash-button dash-button--gold h-7 px-3 text-[11.5px]">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

/* ============================================================================
   STEP 2: ORGANIZE THE WIDGETS PAGE (4x2 DRAGGABLE BOARD)
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

  function moveWidget(id: string, delta: -1 | 1) {
    const idx = placedIds.indexOf(id);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= placedIds.length) return;
    const copy = [...placedIds];
    const [item] = copy.splice(idx, 1);
    copy.splice(target, 0, item!);
    onChange(copy);
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13.5px] leading-relaxed text-[color:var(--land-muted)]">
          Drag tiles to reorder your 4×2 Command board, or pick widgets below.
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChange(computeSuggestedWidgets(connectedIds))}
            className="dash-button h-7 px-2.5 text-[11.5px]"
          >
            Suggested
          </button>
          <button
            type="button"
            onClick={() => onChange(placeWidgets(["gmail", "calendar", "tasks", "weather"]).map((p) => p.id))}
            className="dash-button h-7 px-2.5 text-[11.5px]"
          >
            Focus set
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="dash-button h-7 px-2.5 text-[11.5px]"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Live interactive 4x2 board preview */}
      <div className="setup-board" aria-label="4 by 2 Command widgets layout organizer">
        {placed.map((p, idx) => {
          const def = widgetDef(p.id);
          if (!def) return null;
          const isAppConnected = !def.needsConnection || connectedIds.has(def.connectorId);
          return (
            <div
              key={p.id}
              draggable
              onDragStart={(e) => {
                setDraggingId(p.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", p.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (draggingId && draggingId !== p.id) setDragOverId(p.id);
              }}
              onDragLeave={() => {
                if (dragOverId === p.id) setDragOverId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const src = draggingId ?? e.dataTransfer.getData("text/plain");
                if (src) swapOrReorder(src, p.id);
                setDraggingId(null);
                setDragOverId(null);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setDragOverId(null);
              }}
              style={{
                gridColumn: `${p.x + 1} / span ${p.w}`,
                gridRow: `${p.y + 1} / span ${p.h}`,
              }}
              className={`setup-board-tile ${draggingId === p.id ? "setup-board-tile--dragging" : ""} ${
                dragOverId === p.id ? "setup-board-tile--over" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <StatusDot tone={isAppConnected ? "ok" : "idle"} />
                  <span className="truncate text-[12px] font-semibold uppercase tracking-wider text-[color:var(--land-ink)]">
                    {def.name}
                  </span>
                </div>
                <span className="rounded-full border border-[color:var(--land-hair)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--land-faint)]">
                  {def.w}×{def.h}
                </span>
              </div>

              <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-[color:var(--land-muted)]">
                {def.blurb}
              </p>

              <div className="mt-auto flex items-center justify-between gap-1 pt-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveWidget(p.id, -1)}
                    aria-label={`Move ${def.name} earlier`}
                    className="setup-tile-ctrl"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    disabled={idx === placed.length - 1}
                    onClick={() => moveWidget(p.id, 1)}
                    aria-label={`Move ${def.name} later`}
                    className="setup-tile-ctrl"
                  >
                    →
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeWidget(p.id)}
                  aria-label={`Remove ${def.name}`}
                  className="setup-tile-ctrl"
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}

        {openCells.map((cell) => (
          <div
            key={`${cell.x}-${cell.y}`}
            style={{
              gridColumn: `${cell.x + 1} / span 1`,
              gridRow: `${cell.y + 1} / span 1`,
            }}
            className="setup-board-empty"
            aria-hidden
          >
            <span>Open slot</span>
          </div>
        ))}
      </div>

      {/* Widget picker list */}
      <div>
        <p className="dash-eyebrow mb-2.5">Available widgets</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {COMMAND_WIDGETS.map((w) => {
            const onBoard = placedIds.includes(w.id);
            const canFit = !onBoard && overviewAccepts(placedIds, w.id);
            const ready = !w.needsConnection || connectedIds.has(w.connectorId);
            return (
              <button
                key={w.id}
                type="button"
                disabled={!onBoard && !canFit}
                onClick={() => (onBoard ? removeWidget(w.id) : addWidget(w.id))}
                className={`setup-widget-pick ${onBoard ? "setup-widget-pick--on" : ""}`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 truncate text-[13px] font-medium text-[color:var(--land-ink)]">
                    <StatusDot tone={onBoard ? "ok" : ready ? "live" : "idle"} />
                    {w.name}
                  </span>
                  <span className="text-[10.5px] font-medium text-[color:var(--land-faint)]">
                    {w.w}×{w.h}
                  </span>
                </div>
                <span className="mt-0.5 line-clamp-1 w-full text-left text-[11px] text-[color:var(--land-faint)]">
                  {onBoard ? "On board · click to remove" : canFit ? w.blurb : "Board full for this size"}
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
   STEP 3: INSTALL SAMPLE NODES
   ============================================================================ */

function SetupNodesStep({
  selectedNodes,
  onChange,
}: {
  selectedNodes: ExtensionId[];
  onChange: (next: ExtensionId[]) => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const sampleMap = useMemo(
    () => new Map(SAMPLE_EXTENSIONS.map((e) => [e.manifest.id, e])),
    [],
  );

  function toggleNode(id: ExtensionId) {
    setNotice(null);
    if (selectedNodes.includes(id)) {
      onChange(selectedNodes.filter((item) => item !== id));
      return;
    }
    if (selectedNodes.length >= FREE_ACTIVE_EXTENSION_SLOTS) {
      setNotice(`Free plan includes ${FREE_ACTIVE_EXTENSION_SLOTS} active sockets. Deselect one to swap.`);
      return;
    }
    onChange([...selectedNodes, id]);
  }

  return (
    <div className="space-y-5">
      <p className="text-[13.5px] leading-relaxed text-[color:var(--land-muted)]">
        Pick up to {FREE_ACTIVE_EXTENSION_SLOTS} sample nodes to wire onto your Nexus network. Functional nodes will be added here soon.
      </p>

      {/* Visual socket bar mirroring Laniakea arms */}
      <div className="setup-socket-bar">
        {EXTENSION_SLOT_BLUEPRINT.map((slot, idx) => {
          const isFree = slot.tier === "free";
          const assignedId = isFree ? selectedNodes[idx] : undefined;
          const assigned = assignedId ? sampleMap.get(assignedId) : undefined;
          return (
            <div
              key={slot.id}
              className={`setup-socket-pill ${
                assigned
                  ? "setup-socket-pill--filled"
                  : isFree
                    ? "setup-socket-pill--open"
                    : "setup-socket-pill--locked"
              }`}
            >
              {assigned ? (
                <>
                  <span className="font-semibold text-[color:var(--land-gold-soft)]">
                    {assigned.manifest.monogram ?? assigned.manifest.name.slice(0, 2)}
                  </span>
                  <span className="truncate">{assigned.manifest.name}</span>
                </>
              ) : isFree ? (
                <>
                  <PlusIcon size={12} />
                  <span>Free socket</span>
                </>
              ) : (
                <>
                  <LockIcon size={11} />
                  <span className="capitalize">{slot.placeholderKey}</span>
                </>
              )}
            </div>
          );
        })}
      </div>

      {notice ? (
        <p className="text-[12.5px] font-medium text-[color:var(--land-gold-soft)]" role="status">
          {notice}
        </p>
      ) : null}

      <div>
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <p className="dash-eyebrow">Sample nodes · install now</p>
          <span className="text-[11.5px] text-[color:var(--land-faint)]">
            {selectedNodes.length} / {FREE_ACTIVE_EXTENSION_SLOTS} sockets filled
          </span>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {SAMPLE_EXTENSIONS.map((ext) => {
            const installed = selectedNodes.includes(ext.manifest.id);
            const atCap = !installed && selectedNodes.length >= FREE_ACTIVE_EXTENSION_SLOTS;
            return (
              <button
                key={ext.manifest.id}
                type="button"
                onClick={() => toggleNode(ext.manifest.id)}
                className={`setup-item-card text-left ${installed ? "setup-item-card--on" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <span className={`setup-node-glyph ${installed ? "setup-node-glyph--on" : ""}`}>
                    {ext.manifest.monogram ?? ext.manifest.name.slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14px] font-medium text-[color:var(--land-ink)]">
                        {ext.manifest.name}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                          installed
                            ? "bg-[color:var(--land-gold)] text-[#09090b]"
                            : atCap
                              ? "border border-[color:var(--land-hair)] text-[color:var(--land-faint)]"
                              : "border border-[color:var(--land-line)] text-[color:var(--land-muted)]"
                        }`}
                      >
                        {installed ? "Installed" : atCap ? "Full" : "Install"}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-snug text-[color:var(--land-muted)]">
                      {ext.manifest.description}
                    </p>
                    <p className="mt-1.5 text-[11px] text-[color:var(--land-faint)]">
                      Sample node · {ext.manifest.capabilities.join(", ")}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-[color:var(--land-hair)] pt-4">
        <p className="dash-eyebrow">Coming soon · functional nodes</p>
        <p className="mt-1 text-[12px] text-[color:var(--land-faint)]">
          Full first-party & community functional nodes will roll into these slots in future releases.
        </p>
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PLANNED_EXTENSIONS.map((p) => (
            <div
              key={p.key}
              className="rounded-xl border border-dashed border-[color:var(--land-line)] px-3 py-2"
            >
              <p className="text-[12.5px] font-medium text-[color:var(--land-muted)]">{p.name}</p>
              <p className="text-[11px] text-[color:var(--land-faint)]">{p.tagline}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
