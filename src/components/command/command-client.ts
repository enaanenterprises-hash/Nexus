import type { AutomationRun, FocusSession, Recipe } from "@/lib/command/automation/types";
import type { CommandItem } from "@/lib/command/kinds";
import type { ConnectionView } from "@/lib/connectors/types";

export interface CommandSnapshot {
  connections: ConnectionView[];
  items: CommandItem[];
  runs: AutomationRun[];
  recipes: (Recipe & { enabled: boolean })[];
  focus: FocusSession | null;
  availability: Record<string, { connectable: boolean; missing: string[] }>;
  /** Items and runs this request produced; published on the bus. */
  created: CommandItem[];
  newRuns: AutomationRun[];
  errors: { connectorId: string; message: string }[];
}

export class CommandRequestError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
    this.name = "CommandRequestError";
  }
}

export const viewerTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/command${path}`, {
    method,
    cache: "no-store",
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (!response.ok) throw new CommandRequestError(data?.error ?? `Command request failed (${response.status})`, data?.code);
  return data as T;
}

const withZone = (body: Record<string, unknown> = {}) => ({ ...body, timeZone: viewerTimeZone() });

export const commandApi = {
  state: () => call<CommandSnapshot>("/state"),
  sync: () => call<CommandSnapshot>("/sync", "POST", withZone()),
  connect: (connectorId: string, input: { settings?: Record<string, string>; credentials?: Record<string, string> }) =>
    call<CommandSnapshot>("/connections", "POST", withZone({ connectorId, ...input })),
  disconnect: (connectorId: string) => call<CommandSnapshot>(`/connections/${encodeURIComponent(connectorId)}`, "DELETE"),
  startFocus: (input: { title: string; minutes: number; targetItemId: string | null }) => call<CommandSnapshot>("/focus", "POST", withZone(input)),
  endFocus: () => call<CommandSnapshot>("/focus", "DELETE", withZone()),
  setRecipe: (id: string, enabled: boolean) => call<CommandSnapshot>(`/recipes/${encodeURIComponent(id)}`, "PUT", { enabled }),
  addGoal: (type: "run", target: number) => call<CommandSnapshot>("/goals", "POST", withZone({ type, target })),
  geocode: (q: string) => call<{ places: { label: string; value: string }[] }>(`/geocode?q=${encodeURIComponent(q)}`),
  /** Keyless forecast. Works with no connection. */
  weather: () => call<{ signal: LiveWeather | null; location: string }>(`/weather?timeZone=${encodeURIComponent(viewerTimeZone())}`),
  sendMail: (message: { to: string; cc?: string; subject: string; body: string; threadId?: string | null; inReplyTo?: string | null }) =>
    call<{ detail: string; sentId: string | null }>("/mail", "POST", withZone(message)),
};

/** The forecast Today shows. Comes straight from Open-Meteo, not from stored items. */
export interface LiveWeather {
  title: string;
  data: {
    value: number | null;
    display: string;
    status: "good" | "fair" | "poor" | "neutral";
    details: Record<string, string | number | null>;
  };
}
