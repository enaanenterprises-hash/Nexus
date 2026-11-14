import "server-only"
import type { ContentAction, ContentCollection, ContentKindMap, KnownContentKind } from "@/lib/extensions/content"

export class ContentAccessError extends Error {
  constructor(
    message: string,
    readonly code: "forbidden" | "not_found" | "invalid" | "unknown_kind" | "unsupported_version",
  ) {
    super(message)
    this.name = "ContentAccessError"
  }
}

export interface ContentContext {
  userId: string
  extensionId: string
}

/**
 * Server side of one content kind. Providers only scope by user and shape
 * data; capability checks happen once, in `contentAccessFor`.
 */
export interface ContentProvider<K extends KnownContentKind = KnownContentKind> {
  kind: K
  /** Schema versions this provider can serve; the newest is the default. */
  versions: readonly ContentKindMap[K]["version"][]
  actions: readonly ContentAction[]
  collections(ctx: ContentContext): Promise<ContentCollection[]>
  list(ctx: ContentContext, query: { collectionId?: string; tag?: string }): Promise<ContentKindMap[K]["listItem"][]>
  get(ctx: ContentContext, id: string): Promise<ContentKindMap[K]["item"]>
  /** Validates untrusted input itself and writes only annotation fields. */
  annotate?(ctx: ContentContext, id: string, input: unknown): Promise<ContentKindMap[K]["item"]>
}
