import type { ActionId } from "../command/actions";
import type { CommandKind } from "../command/kinds";

/**
 * Connector framework: one typed manifest per external service. A manifest
 * says what the service is, how a user authorizes it, what normalized
 * content it produces, and which automation actions it can carry out.
 */

export const CONNECTOR_CATEGORIES = {
  comms: { label: "Communications & scheduling", short: "Schedule" },
  social: { label: "Social publishing", short: "Social" },
  dev: { label: "Engineering & DevOps", short: "DevOps" },
  academics: { label: "Academics & projects", short: "Projects" },
  fitness: { label: "Fitness & recovery", short: "Body" },
  environment: { label: "Weather, sky & logistics", short: "World" },
  media: { label: "Media, focus & environment", short: "Focus" },
  markets: { label: "Markets & sports", short: "Markets" },
} as const;

export type ConnectorCategory = keyof typeof CONNECTOR_CATEGORIES;

export type OAuthProvider = "google" | "microsoft" | "strava" | "whoop" | "fitbit" | "garmin" | "spotify" | "slack" | "discord" | "hue" | "notion";

export interface CredentialField {
  key: string;
  label: string;
  /** Secret fields are encrypted at rest and never sent back to the browser. */
  secret: boolean;
  placeholder?: string;
  help?: string;
  optional?: boolean;
}

export type ConnectorAuth =
  | { type: "none" }
  | { type: "api_key"; fields: CredentialField[]; docsUrl: string }
  | { type: "oauth"; provider: OAuthProvider; scopes: string[]; docsUrl: string };

export type ConnectorAuthType = ConnectorAuth["type"];

export interface SettingField {
  key: string;
  label: string;
  type: "text" | "location" | "list";
  placeholder?: string;
  help?: string;
  defaultValue?: string;
}

export type ConnectorLive =
  | {
      status: "available";
      /** Upstream API that backs the live mode. */
      api: string;
      /** Server environment variables the live mode needs, if any. */
      env?: string[];
    }
  | { status: "planned"; note: string };

export interface ConnectorManifest {
  /** Lowercase kebab-case, unique in the catalog. */
  id: string;
  name: string;
  category: ConnectorCategory;
  description: string;
  /** One or two characters for the connector glyph. */
  monogram: string;
  auth: ConnectorAuth;
  /** Normalized content kinds this connector publishes. */
  produces: CommandKind[];
  /** Automation actions this connector can execute. */
  actions: ActionId[];
  settings?: SettingField[];
  live: ConnectorLive;
}

export type ConnectionStatus = "ok" | "error" | "needs_auth";

/** What the browser sees about a user's connection. Secrets never leave the server. */
export interface ConnectionView {
  connectorId: string;
  status: ConnectionStatus;
  hasCredentials: boolean;
  settings: Record<string, string>;
  lastSyncAt: string | null;
  lastError: string | null;
}
