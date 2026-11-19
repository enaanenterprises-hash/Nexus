"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ChevronDown, ExternalLink, Search, X } from "lucide-react";
import { cn } from "cn";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { connectGoogleService } from "@/lib/command/google-connect";
import { CONNECTOR_CATALOG } from "@/lib/connectors/catalog";
import {
  CONNECTOR_CATEGORIES,
  type ConnectionView,
  type ConnectorCategory,
  type ConnectorManifest,
  type SettingField,
} from "@/lib/connectors/types";
import { commandApi } from "./command-client";
import { relative } from "./format";
import { SourceGlyph, StatusDot, useNow } from "./parts";
import type { CommandController } from "./use-command";

const AUTH_LABEL = { none: "No key", api_key: "Token", oauth: "Sign-in" } as const;

export function ConnectionsView({
  command,
  focusId,
}: {
  command: CommandController;
  focusId: string | null;
}) {
  const state = command.state!;
  const [open, setOpen] = useState<string | null>(focusId);
  const [showPlanned, setShowPlanned] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "connected" | "available">("all");
  const now = useNow(30_000);
  const connections = useMemo(
    () => new Map(state.connections.map((c) => [c.connectorId, c])),
    [state.connections],
  );
  const available = CONNECTOR_CATALOG.filter((m) => m.live.status === "available");
  const planned = CONNECTOR_CATALOG.filter((m) => m.live.status === "planned");
  const categories = Object.keys(CONNECTOR_CATEGORIES) as ConnectorCategory[];

  const normalizedQuery = search.trim().toLowerCase();
  const filteredAvailable = useMemo(() => {
    return available.filter((m) => {
      const isConnected = connections.has(m.id);
      if (filter === "connected" && !isConnected) return false;
      if (filter === "available" && isConnected) return false;
      if (!normalizedQuery) return true;
      return (
        m.name.toLowerCase().includes(normalizedQuery) ||
        m.description.toLowerCase().includes(normalizedQuery) ||
        CONNECTOR_CATEGORIES[m.category].label.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [available, connections, filter, normalizedQuery]);

  const connectedCount = available.filter((m) => connections.has(m.id)).length;
  const unconnectedCount = available.length - connectedCount;

  return (
    <div className="cmd-connections mx-auto">
      <header className="space-y-4">
        <div className="max-w-[42rem]">
          <h2 className="font-editorial text-[1.75rem] leading-tight font-normal tracking-[-0.02em] text-foreground">
            Connected services
          </h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-[color:var(--land-muted)]">
            The APIs and accounts Nexus uses across Command, widgets, and modular nodes. Tokens are
            encrypted on the server and never sent back to the browser.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[210px] flex-1 max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search services or categories…"
              className="cmd-field h-9 w-full rounded-full pr-8 pl-9 text-[13px]"
              aria-label="Search connections"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5" role="group" aria-label="Filter services">
            {(
              [
                { id: "all", label: "All", count: available.length },
                { id: "connected", label: "Connected", count: connectedCount },
                { id: "available", label: "Available", count: unconnectedCount },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={filter === opt.id}
                onClick={() => setFilter(opt.id)}
                className={`cmd-preset-chip ${filter === opt.id ? "cmd-preset-chip--active" : ""}`}
              >
                <span>{opt.label}</span>
                <span className="text-[10.5px] tabular-nums opacity-70">{opt.count}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {filteredAvailable.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card/50 px-5 py-8 text-center">
          <p className="text-[14px] text-foreground">No services match your current filter.</p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setFilter("all");
            }}
            className="mt-2 text-[12.5px] font-medium text-[color:var(--land-gold-soft)] underline underline-offset-4"
          >
            Reset filter
          </button>
        </div>
      ) : (
        categories.map((cat) => {
          const list = filteredAvailable.filter((m) => m.category === cat);
          if (!list.length) return null;
          return (
            <section key={cat} className="mt-9">
              <h3 className="text-[12px] font-medium text-muted-foreground">
                {CONNECTOR_CATEGORIES[cat].label}
              </h3>
              <ul className="mt-2.5 rounded-2xl border border-border bg-card px-4">
                {list.map((m) => (
                  <ConnectorRow
                    key={m.id}
                    now={now}
                    manifest={m}
                    connection={connections.get(m.id) ?? null}
                    command={command}
                    open={open === m.id}
                    onToggle={(next) => setOpen(next ? m.id : null)}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}

      <Collapsible
        open={showPlanned}
        onOpenChange={setShowPlanned}
        className="mt-12 border-t border-[color:var(--land-hair)] pt-6"
      >
        <CollapsibleTrigger
          render={
            <button type="button" className="flex w-full items-center justify-between text-left" />
          }
        >
          <span className="dash-eyebrow">Planned · {planned.length} services</span>
          <span className="inline-flex items-center gap-1 text-[12px] text-[color:var(--land-faint)]">
            <span>{showPlanned ? "Hide" : "Show"}</span>
            <ChevronDown
              className={`size-3.5 transition-transform duration-150 ${showPlanned ? "rotate-180" : ""}`}
            />
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {planned.map((m) => (
              <li key={m.id} className="flex items-start gap-3">
                <SourceGlyph connectorId={m.id} />
                <div className="min-w-0">
                  <p className="text-[13.5px] text-[color:var(--land-muted)]">
                    {m.name}{" "}
                    <span className="text-[color:var(--land-faint)]">
                      · {CONNECTOR_CATEGORIES[m.category].short}
                    </span>
                  </p>
                  <p className="text-[12px] leading-snug text-[color:var(--land-faint)]">
                    {m.live.status === "planned" ? m.live.note : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function ConnectorRow({
  manifest: m,
  connection,
  command,
  open,
  onToggle,
  now,
}: {
  now: number;
  manifest: ConnectorManifest;
  connection: ConnectionView | null;
  command: CommandController;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  const availability = command.state!.availability[m.id];
  const tone = !connection
    ? "idle"
    : connection.status === "ok"
      ? "ok"
      : connection.status === "needs_auth"
        ? "alert"
        : "warn";
  const status = !connection
    ? availability?.connectable
      ? AUTH_LABEL[m.auth.type]
      : "Needs server setup"
    : connection.status === "ok"
      ? connection.lastSyncAt
        ? `Synced ${relative(connection.lastSyncAt, now)}`
        : "Connected"
      : connection.status === "needs_auth"
        ? "Reconnect"
        : "Error";

  return (
    <Collapsible
      open={open}
      onOpenChange={onToggle}
      render={<li className={`cmd-connector ${open ? "cmd-connector--open" : ""}`} />}
    >
      <CollapsibleTrigger render={<button type="button" className="cmd-connector-head" />}>
        <SourceGlyph connectorId={m.id} size="lg" />
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[14.5px] font-medium">{m.name}</span>
          <span className="block truncate text-[12.5px] text-[color:var(--land-faint)]">
            {m.description}
          </span>
        </span>
        <span
          className={`flex shrink-0 items-center gap-2 text-[12px] ${
            connection ? "text-[color:var(--land-muted)]" : "text-[color:var(--land-faint)]"
          }`}
        >
          <StatusDot tone={tone} />
          {status}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ConnectorForm manifest={m} connection={connection} command={command} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function ConnectorForm({
  manifest: m,
  connection,
  command,
}: {
  manifest: ConnectorManifest;
  connection: ConnectionView | null;
  command: CommandController;
}) {
  const formId = useId();
  const availability = command.state!.availability[m.id] ?? { connectable: false, missing: [] };
  const [settings, setSettings] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (m.settings ?? []).map((s) => [s.key, connection?.settings[s.key] ?? s.defaultValue ?? ""]),
    ),
  );
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const busy = command.pending === `connect:${m.id}` || command.pending === `disconnect:${m.id}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(
      await command.connect(m.id, {
        settings,
        credentials: m.auth.type === "api_key" ? credentials : undefined,
      }),
    );
    setCredentials({});
  }

  return (
    <div className="cmd-connector-body">
      {connection?.lastError ? (
        <Alert variant="destructive" className="mb-3 rounded-xl py-2">
          <AlertDescription className="text-xs">{connection.lastError}</AlertDescription>
        </Alert>
      ) : null}

      {!availability.connectable && !connection ? (
        <p className="text-[13px] leading-relaxed text-[color:var(--land-muted)]">
          The server needs{" "}
          <code className="dash-code text-[color:var(--land-ink)]">
            {availability.missing.join(", ")}
          </code>{" "}
          before {m.name} can connect. See the README for setup.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          {m.auth.type === "api_key"
            ? m.auth.fields.map((f) => {
                const fieldId = `${formId}-cred-${f.key}`;
                return (
                  <div key={f.key} className="space-y-1">
                    <Label htmlFor={fieldId} className="cmd-label">
                      {f.label}
                      {f.optional ? <span className="text-[color:var(--land-faint)]"> · optional</span> : null}
                    </Label>
                    <Input
                      id={fieldId}
                      className="cmd-field h-9 w-full rounded-lg border border-border bg-background/40"
                      type={f.secret ? "password" : "text"}
                      value={credentials[f.key] ?? ""}
                      onChange={(e) => setCredentials((c) => ({ ...c, [f.key]: e.target.value }))}
                      placeholder={
                        connection?.hasCredentials
                          ? f.secret
                            ? "Saved · type to replace"
                            : "Saved"
                          : f.placeholder
                      }
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {f.help ? (
                      <span className="block text-[11.5px] text-[color:var(--land-faint)]">
                        {f.help}
                      </span>
                    ) : null}
                  </div>
                );
              })
            : null}

          {(m.settings ?? []).map((s) => (
            <SettingInput
              key={s.key}
              field={s}
              value={settings[s.key] ?? ""}
              onChange={(v) => setSettings((x) => ({ ...x, [s.key]: v }))}
            />
          ))}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {m.auth.type === "oauth" && !connection ? (
              m.auth.provider === "google" ? (
                <Button
                  type="button"
                  size="sm"
                  className="border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
                  onClick={() => void connectGoogleService(m.id)}
                >
                  Continue with Google
                </Button>
              ) : (
                <a
                  href={`/api/command/oauth/${m.id}/start`}
                  className={cn(
                    buttonVariants({ size: "sm" }),
                    "border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28",
                  )}
                >
                  Continue with {m.name}
                </a>
              )
            ) : m.auth.type === "oauth" && !(m.settings ?? []).length ? null : (
              <Button
                type="submit"
                size="sm"
                className="border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
                disabled={busy}
              >
                {busy ? "Checking…" : connection ? "Save" : "Connect"}
              </Button>
            )}

            {connection ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={async () => setError(await command.disconnect(m.id))}
              >
                Disconnect
              </Button>
            ) : null}

            {m.auth.type !== "none" ? (
              <a
                href={m.auth.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-[12px] text-[color:var(--land-faint)] hover:text-[color:var(--land-muted)]"
              >
                {m.auth.type === "api_key" ? "Get a token" : "About access"}{" "}
                <ExternalLink className="size-3" />
              </a>
            ) : null}
          </div>

          {m.auth.type === "oauth" ? (
            <p className="text-[11.5px] leading-snug text-[color:var(--land-faint)]">
              Asks for:{" "}
              {m.auth.scopes
                .map((s) => s.replace("https://www.googleapis.com/auth/", ""))
                .join(", ")}
            </p>
          ) : null}

          <p className="text-[11.5px] text-[color:var(--land-faint)]">
            {m.live.status === "available" ? `Powered by ${m.live.api}.` : null}
          </p>
        </form>
      )}

      {error ? (
        <Alert variant="destructive" className="mt-3 rounded-xl py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function SettingInput({
  field,
  value,
  onChange,
}: {
  field: SettingField;
  value: string;
  onChange: (v: string) => void;
}) {
  const inputId = useId();
  if (field.type === "location") {
    return <LocationInput field={field} value={value} onChange={onChange} />;
  }
  return (
    <div className="space-y-1">
      <Label htmlFor={inputId} className="cmd-label">{field.label}</Label>
      <Input
        id={inputId}
        className="cmd-field h-9 w-full rounded-lg border border-border bg-background/40"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        autoComplete="off"
        spellCheck={false}
      />
      {field.help ? (
        <span className="block text-[11.5px] text-[color:var(--land-faint)]">{field.help}</span>
      ) : null}
    </div>
  );
}

export function LocationInput({
  field,
  value,
  onChange,
}: {
  field: Pick<SettingField, "label" | "help">;
  value: string;
  onChange: (v: string) => void;
}) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;
  const current = value.split("|")[0] ?? "";
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<{ label: string; value: string }[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);

  const open = query.trim().length >= 2 && places.length > 0;

  useEffect(() => {
    if (query.trim().length < 2) return;
    const t = window.setTimeout(() => {
      commandApi.geocode(query).then(
        (r) => {
          setPlaces(r.places);
          setActiveIndex(r.places.length > 0 ? 0 : -1);
        },
        () => {
          setPlaces([]);
          setActiveIndex(-1);
        },
      );
    }, 250);
    return () => window.clearTimeout(t);
  }, [query]);

  function commitPlace(place: { label: string; value: string }) {
    onChange(place.value);
    setQuery("");
    setPlaces([]);
    setActiveIndex(-1);
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((idx) => (idx + 1) % places.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((idx) => (idx - 1 + places.length) % places.length);
    } else if (e.key === "Enter" && activeIndex >= 0 && places[activeIndex]) {
      e.preventDefault();
      commitPlace(places[activeIndex]!);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setPlaces([]);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="relative">
      <div className="space-y-1">
        <Label htmlFor={inputId} className="cmd-label">{field.label}</Label>
        <Input
          id={inputId}
          ref={inputRef}
          className="cmd-field h-9 w-full rounded-lg border border-border bg-background/40"
          value={query}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
          aria-autocomplete="list"
          onKeyDown={onInputKeyDown}
          onBlur={(e) => {
            if (!listboxRef.current?.contains(e.relatedTarget as Node | null)) {
              setPlaces([]);
              setActiveIndex(-1);
            }
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim().length < 2) {
              setPlaces([]);
              setActiveIndex(-1);
            }
          }}
          placeholder={current ? `${current} · search to change` : "Search a city"}
          autoComplete="off"
        />
      </div>

      <Popover
        open={open}
        onOpenChange={(next, details) => {
          if (!next) {
            if (
              details?.reason === "outside-press" &&
              details.event?.target instanceof Node &&
              inputRef.current?.contains(details.event.target)
            ) {
              return;
            }
            setPlaces([]);
            setActiveIndex(-1);
          }
        }}
      >
        <PopoverContent
          anchor={inputRef}
          align="start"
          sideOffset={6}
          initialFocus={false}
          finalFocus={false}
          className="cmd-menu w-(--anchor-width) gap-0 overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl ring-0 backdrop-blur-xl"
        >
          <div ref={listboxRef} id={listboxId} role="listbox" className="max-h-56 overflow-y-auto">
            {places.map((p, idx) => (
              <button
                key={p.value}
                id={`${listboxId}-opt-${idx}`}
                type="button"
                role="option"
                aria-selected={idx === activeIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitPlace(p)}
                className={`block w-full truncate rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
                  idx === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {field.help ? (
        <span className="mt-1 block text-[11.5px] text-[color:var(--land-faint)]">
          {field.help}
        </span>
      ) : null}
    </div>
  );
}
