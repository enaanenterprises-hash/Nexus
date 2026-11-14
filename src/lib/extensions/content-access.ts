import {
  CONTENT_KIND_VERSIONS,
  contentCapability,
  type ContentAction,
  type ContentCollection,
  type ContentKindMap,
  type KnownContentKind,
} from "./content";
import type { ExtensionCapability, ExtensionId } from "./types";

/** Typed access to shared content, scoped to what the manifest declared. */
export interface ContentClient {
  /** True when the manifest declared `content:<kind>:<action>`. */
  can(kind: KnownContentKind, action: ContentAction): boolean;
  collections(kind: KnownContentKind): Promise<ContentCollection[]>;
  list<K extends KnownContentKind>(
    kind: K,
    query?: { collectionId?: string; tag?: string },
  ): Promise<ContentKindMap[K]["listItem"][]>;
  get<K extends KnownContentKind>(kind: K, id: string): Promise<ContentKindMap[K]["item"]>;
  annotate<K extends KnownContentKind>(kind: K, id: string, input: ContentKindMap[K]["annotation"]): Promise<ContentKindMap[K]["item"]>;
}

export class ContentClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ContentClientError";
  }
}

const BASE = "/api/extensions/content";

/** Calls fail fast for undeclared capabilities and while the extension is not in a socket. */
export function createContentClient(options: {
  extensionId: ExtensionId;
  capabilities: readonly ExtensionCapability[];
  isActive: () => boolean;
  fetch?: typeof fetch;
}): ContentClient {
  const { extensionId, isActive } = options;
  const declared = options.capabilities.filter((c) => c.startsWith("content:"));
  const can = (kind: KnownContentKind, action: ContentAction) => declared.includes(contentCapability(kind, action));

  async function call<T>(kind: KnownContentKind, action: ContentAction, path: string, body?: unknown): Promise<T> {
    if (!can(kind, action)) {
      throw new ContentClientError(`${extensionId} did not declare "${contentCapability(kind, action)}"`, 403, "forbidden");
    }
    if (!isActive()) throw new ContentClientError(`${extensionId} must be active to use shared content.`, 403, "inactive");
    const doFetch = options.fetch ?? globalThis.fetch;
    const response = await doFetch(`${BASE}/${kind}${path}`, {
      method: body === undefined ? "GET" : "PUT",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "x-nexus-extension": extensionId,
        "x-nexus-capabilities": declared.join(","),
        "x-nexus-content-version": String(CONTENT_KIND_VERSIONS[kind]),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await response.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
    if (!response.ok) throw new ContentClientError(data?.error ?? `Content request failed (${response.status})`, response.status, data?.code);
    return data as T;
  }

  return {
    can,
    collections: async (kind) => (await call<{ collections: ContentCollection[] }>(kind, "read", "/collections")).collections,
    list: async (kind, query = {}) => {
      const params = new URLSearchParams();
      if (query.collectionId) params.set("collectionId", query.collectionId);
      if (query.tag) params.set("tag", query.tag);
      const qs = params.size ? `?${params}` : "";
      return (await call<{ items: ContentKindMap[typeof kind]["listItem"][] }>(kind, "read", `/items${qs}`)).items;
    },
    get: async (kind, id) => (await call<{ item: ContentKindMap[typeof kind]["item"] }>(kind, "read", `/items/${encodeURIComponent(id)}`)).item,
    annotate: async (kind, id, input) =>
      (await call<{ item: ContentKindMap[typeof kind]["item"] }>(kind, "annotate", `/items/${encodeURIComponent(id)}/annotations`, input)).item,
  };
}
