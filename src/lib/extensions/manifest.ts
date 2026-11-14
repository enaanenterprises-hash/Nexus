import { validateContentDeclarations } from "./content";
import {
  NEXUS_EXTENSION_API_VERSION,
  type ExtensionCapability,
  type ExtensionManifest,
  type NexusExtension,
} from "./types";

const KNOWN_CAPABILITIES: readonly ExtensionCapability[] = [
  "tasks",
  "context",
  "media",
  "calendar",
  "voice",
  "research",
  "custom",
];

const ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export class ManifestError extends Error {
  constructor(
    readonly extensionId: string,
    readonly problems: string[],
  ) {
    super(`Invalid manifest for "${extensionId}": ${problems.join("; ")}`);
    this.name = "ManifestError";
  }
}

/** Returns human-readable problems; an empty array means the manifest is valid. */
export function validateManifest(manifest: ExtensionManifest): string[] {
  const problems: string[] = [];
  if (!ID_PATTERN.test(manifest.id)) {
    problems.push("id must be reverse-DNS style, e.g. com.acme.notes");
  }
  if (manifest.apiVersion !== NEXUS_EXTENSION_API_VERSION) {
    problems.push(`apiVersion must be ${NEXUS_EXTENSION_API_VERSION}`);
  }
  if (!manifest.name.trim()) problems.push("name is required");
  if (!SEMVER_PATTERN.test(manifest.version)) problems.push("version must be semver");
  if (manifest.capabilities.length === 0) problems.push("declare at least one capability");
  for (const capability of manifest.capabilities) {
    if (capability.startsWith("content:")) continue;
    if (!KNOWN_CAPABILITIES.includes(capability)) {
      problems.push(`unknown capability "${capability}"`);
    }
  }
  problems.push(...validateContentDeclarations(manifest.capabilities, manifest.provides));
  if (manifest.monogram && manifest.monogram.length > 2) {
    problems.push("monogram must be at most 2 characters");
  }
  return problems;
}

/** Typed authoring helper; validates eagerly so mistakes surface at import time. */
export function defineExtension(extension: NexusExtension): NexusExtension {
  const problems = validateManifest(extension.manifest);
  if (problems.length > 0) throw new ManifestError(extension.manifest.id, problems);
  return extension;
}
