import { ACTION_DEFINITIONS, isActionId } from "../command/actions";
import { isCommandKind } from "../command/kinds";
import { CONNECTOR_CATEGORIES, type ConnectorManifest } from "./types";

const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;

export class ConnectorManifestError extends Error {
  constructor(
    readonly connectorId: string,
    readonly problems: string[],
  ) {
    super(`Invalid connector manifest "${connectorId}": ${problems.join("; ")}`);
    this.name = "ConnectorManifestError";
  }
}

/** Human-readable problems; an empty array means the manifest is valid. */
export function validateConnectorManifest(m: ConnectorManifest): string[] {
  const problems: string[] = [];
  if (!ID_PATTERN.test(m.id)) problems.push("id must be lowercase kebab-case");
  if (!m.name.trim()) problems.push("name is required");
  if (!Object.hasOwn(CONNECTOR_CATEGORIES, m.category)) problems.push(`unknown category "${m.category}"`);
  if (!m.monogram || m.monogram.length > 2) problems.push("monogram must be 1–2 characters");
  if (m.produces.length === 0 && m.actions.length === 0) problems.push("a connector must produce content or offer an action");
  for (const kind of m.produces) if (!isCommandKind(kind)) problems.push(`unknown content kind "${kind}"`);
  for (const action of m.actions) {
    if (!isActionId(action)) problems.push(`unknown action "${action}"`);
    else if (ACTION_DEFINITIONS[action].core) problems.push(`"${action}" is a core action and cannot be provided by a connector`);
  }
  if (m.auth.type === "api_key") {
    if (m.auth.fields.length === 0) problems.push("api_key auth needs at least one field");
    if (!m.auth.fields.some((f) => f.secret)) problems.push("api_key auth needs a secret field");
    for (const f of m.auth.fields) if (!KEY_PATTERN.test(f.key)) problems.push(`credential field "${f.key}" must be camelCase`);
  }
  if (m.auth.type === "oauth" && m.auth.scopes.length === 0) problems.push("oauth auth must list scopes");
  for (const s of m.settings ?? []) if (!KEY_PATTERN.test(s.key)) problems.push(`setting "${s.key}" must be camelCase`);
  return problems;
}

export function defineConnector(m: ConnectorManifest): ConnectorManifest {
  const problems = validateConnectorManifest(m);
  if (problems.length > 0) throw new ConnectorManifestError(m.id, problems);
  return m;
}
