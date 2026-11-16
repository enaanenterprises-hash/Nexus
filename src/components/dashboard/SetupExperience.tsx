"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { ArrowRight, Check, ChevronLeft, Moon, Sun, X } from "lucide-react";
import { LocationInput } from "@/components/command/ConnectionsView";
import { SourceGlyph } from "@/components/command/parts";
import { useCommand, type CommandController } from "@/components/command/use-command";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { SetupCanvas, type SetupStagePhase } from "./SetupCanvas";

export type SetupStep = "name" | "theme" | "apps" | "widgets" | "nodes";

export const SETUP_RESUME_KEY = "nexus:setup-resume.v1";

const STEPS: { id: SetupStep; label: string; title: string; subtitle: string }[] = [
  {
    id: "name",
    label: "Name",
    title: "What should Nexus call you?",
    subtitle: "Your workspace greets you by this name across every view.",
  },
  {
    id: "theme",
    label: "Theme",
    title: "Choose your appearance",
    subtitle: "Sets both the neural canvas backdrop and monochrome surfaces.",
  },
  {
    id: "apps",
    label: "Apps",
    title: "Connect apps",
    subtitle: "Enable live feeds or link accounts to power Command.",
  },
  {
    id: "widgets",
    label: "Widgets",
    title: "Organize widgets",
    subtitle: "Drag tiles on the 4×2 board, use arrow keys when focused, or toggle below.",
  },
  {
    id: "nodes",
    label: "Nodes",
    title: "Install starter nodes",
    subtitle: `Activate up to ${FREE_ACTIVE_EXTENSION_SLOTS} starter nodes to share context in your network.`,
  },
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

type ConnectionRecord = NonNullable<CommandController["state"]>["connections"][number];

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
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const shouldFocusNameOnModalOpen = useRef(true);
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

  useEffect(() => {
    if (stage !== "modal") return;
    if (shouldFocusNameOnModalOpen.current) {
      shouldFocusNameOnModalOpen.current = false;
      if (step === "name") {
        nameInputRef.current?.focus();
      }
    }
    const idx = STEPS.findIndex((s) => s.id === step);
    if (idx >= 0) {
      tabRefs.current[idx]?.scrollIntoView({ inline: "nearest", block: "nearest" });
    }
  }, [stage, step]);

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

  function navigateToStep(next: SetupStep) {
    if (next === step) return;
    if (step === "name" && next !== "name") {
      const trimmed = nameInput.trim();
      if (trimmed && trimmed !== initialName.trim()) {
        void saveNameAndContinue(next);
        return;
      }
    }
    goToStep(next);
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
      reduceMotion ? 260 : 5000,
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
  const stepMeta = STEPS[currentStepIndex]!;

  return (
    <div
      ref={rootRef}
      className={`dash setup-root ${theme === "dark" ? "dark" : "light"} relative h-[100svh] w-full flex-1 overflow-hidden`}
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

      <Dialog open={stage === "modal"} onOpenChange={() => {}}>
        <DialogContent
          overlayClassName="setup-modal-backdrop"
          showCloseButton={false}
          data-theme={theme}
          aria-label="Workspace setup"
          className="setup-card flex max-h-[88svh] w-[calc(100%-1.25rem)] max-w-[720px] flex-col gap-0 overflow-hidden p-0 ring-0 sm:max-w-[720px]"
        >
          <Tabs
            value={step}
            onValueChange={(next) => navigateToStep(next as SetupStep)}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <header className="setup-card-head flex items-stretch justify-between gap-2 px-4 sm:gap-4 sm:px-8">
              <TabsList
                variant="line"
                aria-label="Setup steps"
                className="setup-tabs flex h-auto min-w-0 items-stretch justify-start gap-3.5 rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-auto sm:gap-7"
              >
                {STEPS.map((s, idx) => {
                  const active = s.id === step;
                  return (
                    <TabsTrigger
                      key={s.id}
                      ref={(el) => {
                        tabRefs.current[idx] = el;
                      }}
                      value={s.id}
                      className="setup-tab flex-none rounded-none border-0 bg-transparent shadow-none after:hidden"
                      data-active={active ? "true" : "false"}
                    >
                      {s.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              <button
                type="button"
                onClick={() => void handleSkip()}
                disabled={finishing}
                className="setup-skip-link shrink-0 self-center"
              >
                <span className="hidden sm:inline">Skip setup</span>
                <span className="sm:hidden">Skip</span>
              </button>
            </header>

            <DialogHeader className="gap-1.5 px-4 pt-5 pb-3 text-left sm:px-8 sm:pt-7">
              <DialogTitle className="setup-title font-normal">{stepMeta.title}</DialogTitle>
              <DialogDescription className="setup-subtitle">{stepMeta.subtitle}</DialogDescription>
            </DialogHeader>

            {oauthNotice ? (
              <div className="mx-4 mb-2 sm:mx-8">
                <Alert
                  role="status"
                  className="setup-notice rounded-xl px-3.5 py-2 text-[12.5px]"
                  data-ok={oauthNotice.ok ? "true" : "false"}
                >
                  <AlertDescription className="text-[12.5px] text-current">
                    {oauthNotice.text}
                  </AlertDescription>
                  <AlertAction>
                    <button
                      type="button"
                      onClick={onDismissNotice}
                      className="setup-icon-btn shrink-0"
                      aria-label="Dismiss notice"
                    >
                      <X className="size-3.5" />
                    </button>
                  </AlertAction>
                </Alert>
              </div>
            ) : null}

            <ScrollArea className="setup-card-body min-h-0 flex-1">
              <div className="px-4 pt-2 pb-5 sm:px-8">
                {step === "name" ? (
                  <SetupNameStep
                    inputRef={nameInputRef}
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
                    connections={connections}
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
            </ScrollArea>

            <footer className="setup-card-foot flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
              <div>
                {currentStepIndex > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => goToStep(STEPS[currentStepIndex - 1]!.id)}
                    className="setup-btn setup-btn--ghost shadow-none"
                  >
                    <ChevronLeft className="size-3.5" />
                    <span>Back</span>
                  </Button>
                ) : (
                  <span className="setup-step-meta">1 of {STEPS.length}</span>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                {step === "name" ? (
                  <Button
                    type="button"
                    disabled={nameSaving}
                    onClick={() => void saveNameAndContinue("theme")}
                    className="setup-btn setup-btn--primary shadow-none"
                  >
                    <span>{nameSaving ? "Saving…" : "Continue"}</span>
                    <ArrowRight className="size-3.5" />
                  </Button>
                ) : currentStepIndex < STEPS.length - 1 ? (
                  <Button
                    type="button"
                    onClick={() => goToStep(STEPS[currentStepIndex + 1]!.id)}
                    className="setup-btn setup-btn--primary shadow-none"
                  >
                    <span>Continue</span>
                    <ArrowRight className="size-3.5" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={finishing}
                    onClick={() => void handleFinish()}
                    className="setup-btn setup-btn--primary shadow-none"
                  >
                    <span>{finishing ? "Preparing workspace…" : "Enter Nexus"}</span>
                    <ArrowRight className="size-3.5" />
                  </Button>
                )}
              </div>
            </footer>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================================================================
   STEP 1: NAME
   ============================================================================ */

function SetupNameStep({
  inputRef,
  value,
  error,
  busy,
  onChange,
  onSubmit,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
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

  const trimmed = value.trim();

  return (
    <form onSubmit={handleFormSubmit} className="space-y-6 pt-3 pb-2">
      <div>
        <Label htmlFor="setup-name-input" className="setup-label block">
          Display name
        </Label>
        <div className="setup-name-field mt-2">
          <Input
            ref={inputRef}
            id="setup-name-input"
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Your name"
            maxLength={80}
            disabled={busy}
            autoComplete="given-name"
            className="setup-name-input rounded-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          />
          <Kbd className="setup-kbd hidden h-auto shadow-none sm:inline-flex" aria-hidden>
            Enter
          </Kbd>
        </div>
        {error ? (
          <p className="setup-error mt-2.5" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="setup-name-preview" aria-live="polite">
        <span className="setup-name-preview-label">Preview</span>
        <p className="setup-name-specimen">
          {trimmed ? (
            <>
              Welcome to Nexus, <span className="setup-name-specimen-val">{trimmed}</span>.
            </>
          ) : (
            <span className="setup-name-specimen-empty">Your workspace will greet you here.</span>
          )}
        </p>
      </div>
    </form>
  );
}

/* ============================================================================
   STEP 2: THEME
   ============================================================================ */

const THEME_OPTIONS: {
  id: ThemeMode;
  title: string;
  note: string;
  surface: string;
  border: string;
  orb: string;
  barStrong: string;
  barSoft: string;
  tileBg: string;
  tileBorder: string;
}[] = [
  {
    id: "dark",
    title: "Obsidian Dark",
    note: "Deep obsidian canvas",
    surface: "#070709",
    border: "rgba(255, 255, 255, 0.12)",
    orb: "#f0b54a",
    barStrong: "rgba(255, 255, 255, 0.78)",
    barSoft: "rgba(255, 255, 255, 0.2)",
    tileBg: "rgba(255, 255, 255, 0.055)",
    tileBorder: "rgba(255, 255, 255, 0.11)",
  },
  {
    id: "light",
    title: "Gallery Light",
    note: "Warm paper white",
    surface: "#f7f6f2",
    border: "rgba(9, 9, 11, 0.11)",
    orb: "#b87810",
    barStrong: "rgba(17, 17, 19, 0.84)",
    barSoft: "rgba(17, 17, 19, 0.2)",
    tileBg: "#ffffff",
    tileBorder: "rgba(9, 9, 11, 0.09)",
  },
];

function SetupThemeStep({
  theme,
  onSelect,
}: {
  theme: ThemeMode;
  onSelect: (next: ThemeMode) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
      {THEME_OPTIONS.map((opt) => {
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
                background: opt.surface,
                borderColor: opt.border,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="h-1.5 w-11 rounded-full" style={{ background: opt.barSoft }} />
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    background: opt.orb,
                    boxShadow: `0 0 10px ${opt.orb}`,
                  }}
                />
              </div>

              <div className="mt-5 space-y-2">
                <div className="h-2.5 w-3/4 rounded-full" style={{ background: opt.barStrong }} />
                <div className="h-2 w-1/2 rounded-full" style={{ background: opt.barSoft }} />
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                <div
                  className="col-span-2 h-8 rounded-[6px]"
                  style={{ background: opt.tileBg, border: `1px solid ${opt.tileBorder}` }}
                />
                <div
                  className="h-8 rounded-[6px]"
                  style={{ background: opt.tileBg, border: `1px solid ${opt.tileBorder}` }}
                />
              </div>
            </div>

            <div className="mt-3.5 flex items-center justify-between gap-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="setup-theme-icon" aria-hidden>
                  {isDark ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
                </span>
                <div className="min-w-0">
                  <div className="setup-row-title">{opt.title}</div>
                  <div className="setup-row-sub">{opt.note}</div>
                </div>
              </div>
              <span className="setup-check-ring shrink-0" data-checked={active ? "true" : "false"}>
                {active ? <Check className="size-3" strokeWidth={2.5} /> : null}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================================
   STEP 3: CONNECT APPS (HAIRLINE ARCHITECTURAL LIST + COLLAPSIBLE FORMS)
   ============================================================================ */

function SetupAppsStep({
  command,
  connections,
  connectedIds,
  onPulse,
}: {
  command: CommandController;
  connections: Map<string, ConnectionRecord>;
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
  const activeInstantCount = instantApps.filter((m) => connectedIds.has(m.id)).length;

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
    <div className="space-y-6 py-1">
      {formError ? (
        <Alert variant="destructive" className="rounded-xl py-2" role="alert">
          <AlertDescription className="text-xs">{formError}</AlertDescription>
        </Alert>
      ) : null}

      <section aria-label="Instant feeds">
        <div className="setup-section-head mb-1 flex items-center justify-between gap-2 pb-2">
          <span className="setup-label">Instant feeds</span>
          <span className="setup-count-meta">
            {activeInstantCount} / {instantApps.length} active
          </span>
        </div>

        <div className="setup-hairline-list">
          {instantApps.map((m) => {
            const isConnected = connectedIds.has(m.id);
            const isExpanded = expandedId === m.id;
            const busy =
              command.pending === `connect:${m.id}` ||
              command.pending === `disconnect:${m.id}`;
            const hasSettings = (m.settings?.length ?? 0) > 0;

            return (
              <Collapsible
                key={m.id}
                open={isExpanded}
                onOpenChange={(open) => setExpandedId(open ? m.id : null)}
                className="setup-row"
                data-selected={isConnected ? "true" : "false"}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <SourceGlyph connectorId={m.id} />
                    <div className="min-w-0">
                      <div className="setup-row-title truncate">{m.name}</div>
                      <div className="setup-row-sub truncate">{m.description}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
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

                <CollapsibleContent>
                  <SetupConnectorInlineForm
                    manifest={m}
                    connection={connections.get(m.id) ?? null}
                    command={command}
                    onSaved={() => {
                      setExpandedId(null);
                      onPulse();
                    }}
                  />
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </section>

      <section aria-label="Accounts and APIs">
        <div className="setup-section-head mb-1 flex items-center justify-between gap-2 pb-2">
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

        <div className="setup-hairline-list">
          {accountApps.map((m) => {
            const isConnected = connectedIds.has(m.id);
            const isExpanded = expandedId === m.id;
            const busy =
              command.pending === `connect:${m.id}` ||
              command.pending === `disconnect:${m.id}`;
            const connectable = availability[m.id]?.connectable ?? false;
            const conn = connections.get(m.id) ?? null;
            const authMeta =
              m.auth.type === "oauth"
                ? m.auth.provider === "google"
                  ? "Google OAuth"
                  : "OAuth"
                : "API token";

            return (
              <Collapsible
                key={m.id}
                open={isExpanded}
                onOpenChange={(open) => setExpandedId(open ? m.id : null)}
                className="setup-row"
                data-selected={isConnected ? "true" : "false"}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <SourceGlyph connectorId={m.id} />
                    <div className="min-w-0">
                      <div className="setup-row-title truncate">{m.name}</div>
                      <div className="setup-row-sub truncate">
                        {authMeta} · {m.description}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!command.state ? (
                      <span className="setup-status-note">Loading…</span>
                    ) : !connectable && !isConnected ? (
                      <span className="setup-status-note">Unconfigured</span>
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

                <CollapsibleContent>
                  <SetupConnectorInlineForm
                    manifest={m}
                    connection={conn}
                    command={command}
                    onSaved={() => {
                      setExpandedId(null);
                      onPulse();
                    }}
                  />
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </section>
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
  const formId = useId();
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
    <form onSubmit={onSubmit} className="setup-inline-form mt-3 space-y-2.5 pt-3">
      {m.auth.type === "api_key"
        ? m.auth.fields.map((f) => {
            const fieldId = `${formId}-cred-${f.key}`;
            return (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={fieldId} className="setup-label">{f.label}</Label>
                <Input
                  id={fieldId}
                  type={f.secret ? "password" : "text"}
                  value={credentials[f.key] ?? ""}
                  onChange={(e) => setCredentials((c) => ({ ...c, [f.key]: e.target.value }))}
                  placeholder={connection?.hasCredentials ? "Saved · enter to replace" : f.placeholder}
                  className="setup-input setup-input--sm"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            );
          })
        : null}
      {(m.settings ?? []).map((s) => {
        if (s.type === "location") {
          return (
            <LocationInput
              key={s.key}
              field={s}
              value={settings[s.key] ?? ""}
              onChange={(v) => setSettings((prev) => ({ ...prev, [s.key]: v }))}
            />
          );
        }
        const settingId = `${formId}-set-${s.key}`;
        return (
          <div key={s.key} className="space-y-1">
            <Label htmlFor={settingId} className="setup-label">{s.label}</Label>
            <Input
              id={settingId}
              type="text"
              value={settings[s.key] ?? ""}
              onChange={(e) => setSettings((prev) => ({ ...prev, [s.key]: e.target.value }))}
              placeholder={s.placeholder}
              className="setup-input setup-input--sm"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        );
      })}
      {error ? <p className="setup-error">{error}</p> : null}
      <div className="flex justify-end pt-0.5">
        <button type="submit" disabled={busy} className="setup-pill-btn" data-active="true">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

/* ============================================================================
   STEP 4: ORGANIZE WIDGETS (INTERACTIVE 4x2 BOARD + TOGGLE CHIPS)
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
  const stablePlaced = useMemo(
    () => [...placed].sort((a, b) => a.id.localeCompare(b.id)),
    [placed],
  );
  const openCells = useMemo(() => buildEmptyGridCells(placed), [placed]);
  const placedIds = placed.map((p) => p.id);
  const totalSlots = OVERVIEW_COLUMNS * OVERVIEW_ROWS;
  const usedSlots = totalSlots - openCells.length;

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

  function moveByOffset(id: string, delta: number) {
    const idx = placedIds.indexOf(id);
    if (idx < 0) return;
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= placedIds.length) return;
    swapOrReorder(id, placedIds[targetIdx]!);
  }

  function handleTileKeyDown(e: KeyboardEvent<HTMLDivElement>, id: string) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      moveByOffset(id, -1);
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      moveByOffset(id, 1);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeWidget(id);
    }
  }

  return (
    <div className="space-y-5 py-1">
      <div className="setup-section-head flex items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-3">
          <span className="setup-label">Board layout (4×2)</span>
          <span className="setup-count-meta">
            {usedSlots}/{totalSlots} slots
          </span>
        </div>
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={() => onChange(computeSuggestedWidgets(connectedIds))}
            className="setup-text-btn"
          >
            Suggested
          </button>
          <button type="button" onClick={() => onChange([])} className="setup-text-btn">
            Clear
          </button>
        </div>
      </div>

      <div className="setup-board" role="region" aria-label="4 by 2 Command widget board">
        {stablePlaced.map((p) => {
          const def = widgetDef(p.id);
          return (
            <div
              key={p.id}
              role="group"
              draggable
              tabIndex={0}
              aria-label={`${def?.name ?? p.id} widget (${p.w} by ${p.h}). Use arrow keys to reorder or Delete to remove.`}
              onKeyDown={(e) => handleTileKeyDown(e, p.id)}
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
              <div className="flex items-center justify-between gap-1 sm:gap-2">
                <span className="setup-row-title truncate">{def?.name ?? p.id}</span>
                <button
                  type="button"
                  onClick={() => removeWidget(p.id)}
                  className="setup-icon-btn"
                  aria-label={`Remove ${def?.name ?? p.id}`}
                >
                  <X className="size-3" />
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
        <div className="setup-section-head mb-2.5 flex items-center justify-between gap-2 pb-2">
          <span className="setup-label">Widgets</span>
          <span className="setup-count-meta">Click to place or remove</span>
        </div>
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
                {onBoard ? <Check className="size-3" strokeWidth={2.5} /> : null}
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
   STEP 5: INSTALL NODES (UNIFIED 2x2 HAIRLINE MATRIX)
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
    <div className="space-y-4 py-1">
      <div className="setup-section-head flex items-center justify-between gap-2 pb-2">
        <span className="setup-label">Starter nodes</span>
        <span className="setup-count-meta">
          {selectedNodes.length} of {FREE_ACTIVE_EXTENSION_SLOTS} active
        </span>
      </div>

      <div className="setup-node-matrix">
        {SAMPLE_EXTENSIONS.map((ext) => {
          const { id, name, monogram, description } = ext.manifest;
          const active = selectedNodes.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggleNode(id)}
              className="setup-node-cell text-left"
              data-selected={active ? "true" : "false"}
              aria-pressed={active}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="setup-node-monogram" data-active={active ? "true" : "false"}>
                    {monogram ?? name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="setup-row-title">{name}</div>
                    <div className="setup-row-sub mt-0.5 line-clamp-2">{description}</div>
                  </div>
                </div>
                <span className="setup-check-ring mt-0.5 shrink-0" data-checked={active ? "true" : "false"}>
                  {active ? <Check className="size-3" strokeWidth={2.5} /> : null}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <p className="setup-footer-note">
        Showing sample starter nodes for preview. Functional nodes will be added here in later updates.
      </p>
    </div>
  );
}
