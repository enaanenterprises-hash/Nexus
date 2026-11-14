import type { ActionId } from "../actions";
import type { CommandItemInput } from "../kinds";

export interface DriverContext {
  userId: string;
  connectorId: string;
  /** Decrypted credentials, or null for keyless connectors. */
  credentials: Record<string, string> | null;
  /** User settings merged over the manifest defaults. */
  settings: Record<string, string>;
  now: Date;
  timeZone: string;
  /** Persist refreshed tokens. */
  saveCredentials: (next: Record<string, string>) => Promise<void>;
}

export interface ActionOutcome {
  detail: string;
  items?: CommandItemInput[];
}

/** Server-side implementation of one connector manifest. */
export interface ConnectorDriver {
  id: string;
  /** Called when a user connects; throw `DriverError` with a message they can act on. */
  verify?: (ctx: DriverContext) => Promise<void>;
  /** Snapshot of what the service has now. Items missing from the next snapshot are pruned. */
  fetch?: (ctx: DriverContext) => Promise<CommandItemInput[]>;
  actions?: Partial<Record<ActionId, (ctx: DriverContext, params: Record<string, unknown>) => Promise<ActionOutcome>>>;
}

export type DriverRegistry = Readonly<Record<string, ConnectorDriver>>;

export class DriverError extends Error {
  constructor(
    message: string,
    readonly code: "auth" | "config" | "upstream",
  ) {
    super(message);
    this.name = "DriverError";
  }
}
