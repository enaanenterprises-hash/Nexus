"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { connectGoogleService } from "@/lib/command/google-connect";
import { CONNECTOR_CATALOG } from "@/lib/connectors/catalog";
import { CONNECTOR_CATEGORIES, type ConnectionView, type ConnectorCategory, type ConnectorManifest, type SettingField } from "@/lib/connectors/types";
import { ExternalIcon } from "@/components/dashboard/icons";
import { commandApi } from "./command-client";
import { relative } from "./format";
import { SourceGlyph, StatusDot, useNow } from "./parts";
import type { CommandController } from "./use-command";

const AUTH_LABEL = { none: "No key", api_key: "Token", oauth: "Sign-in" } as const;

export function ConnectionsView({ command, focusId }: { command: CommandController; focusId: string | null }) {
  const state = command.state!;
  const [open, setOpen] = useState<string | null>(focusId);
  const [showPlanned, setShowPlanned] = useState(false);
  const now = useNow(30_000);
  const connections = useMemo(() => new Map(state.connections.map((c) => [c.connectorId, c])), [state.connections]);
  const available = CONNECTOR_CATALOG.filter((m) => m.live.status === "available");
  const planned = CONNECTOR_CATALOG.filter((m) => m.live.status === "planned");
  const categories = Object.keys(CONNECTOR_CATEGORIES) as ConnectorCategory[];

  return (
    <div className="cmd-connections">
      <header className="max-w-[40rem]">
        <p className="text-[14px] leading-relaxed text-[color:var(--land-muted)]">
          Connect the services you use. Command keeps only what you connect, normalizes it into shared content, and lets other extensions read it with your permission.
          Tokens are encrypted on the server and never sent back to the browser.
        </p>
      </header>
      {categories.map((cat) => {
        const list = available.filter((m) => m.category === cat);
        if (!list.length) return null;
        return (
          <section key={cat} className="mt-9">
            <h3 className="dash-eyebrow">{CONNECTOR_CATEGORIES[cat].label}</h3>
            <ul className="mt-2">
              {list.map((m) => (
                <ConnectorRow key={m.id} now={now} manifest={m} connection={connections.get(m.id) ?? null} command={command} open={open === m.id} onToggle={() => setOpen((o) => (o === m.id ? null : m.id))} />
              ))}
            </ul>
          </section>
        );
      })}
      <section className="mt-12 border-t border-[color:var(--land-hair)] pt-6">
        <button type="button" className="flex w-full items-baseline justify-between text-left" onClick={() => setShowPlanned((v) => !v)} aria-expanded={showPlanned}>
          <span className="dash-eyebrow">Planned · {planned.length} services</span>
          <span className="text-[12px] text-[color:var(--land-faint)]">{showPlanned ? "Hide" : "Show"}</span>
        </button>
        {showPlanned ? (
          <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {planned.map((m) => (
              <li key={m.id} className="flex items-start gap-3">
                <SourceGlyph connectorId={m.id} />
                <div className="min-w-0">
                  <p className="text-[13.5px] text-[color:var(--land-muted)]">
                    {m.name} <span className="text-[color:var(--land-faint)]">· {CONNECTOR_CATEGORIES[m.category].short}</span>
                  </p>
                  <p className="text-[12px] leading-snug text-[color:var(--land-faint)]">{m.live.status === "planned" ? m.live.note : ""}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
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
  onToggle: () => void;
}) {
  const availability = command.state!.availability[m.id];
  const tone = !connection ? "idle" : connection.status === "ok" ? "ok" : connection.status === "needs_auth" ? "alert" : "warn";
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
    <li className={`cmd-connector ${open ? "cmd-connector--open" : ""}`}>
      <button type="button" className="cmd-connector-head" onClick={onToggle} aria-expanded={open}>
        <SourceGlyph connectorId={m.id} size="lg" />
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[14.5px] font-medium">{m.name}</span>
          <span className="block truncate text-[12.5px] text-[color:var(--land-faint)]">{m.description}</span>
        </span>
        <span className={`flex shrink-0 items-center gap-2 text-[12px] ${connection ? "text-[color:var(--land-muted)]" : "text-[color:var(--land-faint)]"}`}>
          <StatusDot tone={tone} />
          {status}
        </span>
      </button>
      {open ? <ConnectorForm manifest={m} connection={connection} command={command} /> : null}
    </li>
  );
}

function ConnectorForm({ manifest: m, connection, command }: { manifest: ConnectorManifest; connection: ConnectionView | null; command: CommandController }) {
  const availability = command.state!.availability[m.id] ?? { connectable: false, missing: [] };
  const [settings, setSettings] = useState<Record<string, string>>(() =>
    Object.fromEntries((m.settings ?? []).map((s) => [s.key, connection?.settings[s.key] ?? s.defaultValue ?? ""])),
  );
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const busy = command.pending === `connect:${m.id}` || command.pending === `disconnect:${m.id}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(await command.connect(m.id, { settings, credentials: m.auth.type === "api_key" ? credentials : undefined }));
    setCredentials({});
  }

  return (
    <div className="cmd-connector-body">
      {connection?.lastError ? <p className="cmd-error mb-3">{connection.lastError}</p> : null}
      {!availability.connectable && !connection ? (
        <p className="text-[13px] leading-relaxed text-[color:var(--land-muted)]">
          The server needs <code className="dash-code text-[color:var(--land-ink)]">{availability.missing.join(", ")}</code> before {m.name} can connect. See the README for setup.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          {m.auth.type === "api_key"
            ? m.auth.fields.map((f) => (
                <label key={f.key} className="block">
                  <span className="cmd-label">
                    {f.label}
                    {f.optional ? <span className="text-[color:var(--land-faint)]"> · optional</span> : null}
                  </span>
                  <input
                    className="cmd-field mt-1 w-full"
                    type={f.secret ? "password" : "text"}
                    value={credentials[f.key] ?? ""}
                    onChange={(e) => setCredentials((c) => ({ ...c, [f.key]: e.target.value }))}
                    placeholder={connection?.hasCredentials ? (f.secret ? "Saved · type to replace" : "Saved") : f.placeholder}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {f.help ? <span className="mt-1 block text-[11.5px] text-[color:var(--land-faint)]">{f.help}</span> : null}
                </label>
              ))
            : null}
          {(m.settings ?? []).map((s) => (
            <SettingInput key={s.key} field={s} value={settings[s.key] ?? ""} onChange={(v) => setSettings((x) => ({ ...x, [s.key]: v }))} />
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {m.auth.type === "oauth" && !connection ? (
              m.auth.provider === "google" ? (
                <button type="button" className="dash-button dash-button--gold" onClick={() => void connectGoogleService(m.id)}>
                  Continue with Google
                </button>
              ) : (
                <a className="dash-button dash-button--gold inline-flex items-center" href={`/api/command/oauth/${m.id}/start`}>
                  Continue with {m.name}
                </a>
              )
            ) : m.auth.type === "oauth" && !(m.settings ?? []).length ? null : (
              <button type="submit" className="dash-button dash-button--gold" disabled={busy}>
                {busy ? "Checking…" : connection ? "Save" : "Connect"}
              </button>
            )}
            {connection ? (
              <button
                type="button"
                className="dash-button"
                disabled={busy}
                onClick={async () => setError(await command.disconnect(m.id))}
              >
                Disconnect
              </button>
            ) : null}
            {m.auth.type !== "none" ? (
              <a href={m.auth.docsUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-[12px] text-[color:var(--land-faint)] hover:text-[color:var(--land-muted)]">
                {m.auth.type === "api_key" ? "Get a token" : "About access"} <ExternalIcon size={11} />
              </a>
            ) : null}
          </div>
          {m.auth.type === "oauth" ? (
            <p className="text-[11.5px] leading-snug text-[color:var(--land-faint)]">Asks for: {m.auth.scopes.map((s) => s.replace("https://www.googleapis.com/auth/", "")).join(", ")}</p>
          ) : null}
          <p className="text-[11.5px] text-[color:var(--land-faint)]">{m.live.status === "available" ? `Powered by ${m.live.api}.` : null}</p>
        </form>
      )}
      {error ? <p className="cmd-error mt-3">{error}</p> : null}
    </div>
  );
}

function SettingInput({ field, value, onChange }: { field: SettingField; value: string; onChange: (v: string) => void }) {
  if (field.type === "location") return <LocationInput field={field} value={value} onChange={onChange} />;
  return (
    <label className="block">
      <span className="cmd-label">{field.label}</span>
      <input className="cmd-field mt-1 w-full" value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} autoComplete="off" spellCheck={false} />
      {field.help ? <span className="mt-1 block text-[11.5px] text-[color:var(--land-faint)]">{field.help}</span> : null}
    </label>
  );
}

export function LocationInput({ field, value, onChange }: { field: Pick<SettingField, "label" | "help">; value: string; onChange: (v: string) => void }) {
  const current = value.split("|")[0] ?? "";
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<{ label: string; value: string }[]>([]);
  useEffect(() => {
    if (query.trim().length < 2) return;
    const t = window.setTimeout(() => {
      commandApi.geocode(query).then((r) => setPlaces(r.places), () => setPlaces([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [query]);
  return (
    <div className="relative">
      <label className="block">
        <span className="cmd-label">{field.label}</span>
        <input className="cmd-field mt-1 w-full" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={current ? `${current} · search to change` : "Search a city"} autoComplete="off" />
      </label>
      {query.trim().length >= 2 && places.length ? (
        <ul className="cmd-menu" role="listbox">
          {places.map((p) => (
            <li key={p.value}>
              <button
                type="button"
                className="block w-full truncate px-3 py-2 text-left text-[13px] hover:bg-white/5"
                onClick={() => {
                  onChange(p.value);
                  setQuery("");
                  setPlaces([]);
                }}
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {field.help ? <span className="mt-1 block text-[11.5px] text-[color:var(--land-faint)]">{field.help}</span> : null}
    </div>
  );
}
