import "server-only"
import { contentCapability, type ContentAction, type KnownContentKind } from "@/lib/extensions/content"
import { commandContentProviders } from "@/lib/command/content-provider"
import { researchSourceProvider } from "@/lib/research/content-provider"
import { json, jsonError, libraryFailure, requireLibraryUser } from "@/lib/research/route-helpers"
import { ContentAccessError, type ContentProvider } from "./provider"

/** Server-side providers by kind. New kinds register here. */
const PROVIDERS: { [K in KnownContentKind]: ContentProvider<K> } = {
  "research.source": researchSourceProvider,
  ...commandContentProviders,
}

export const EXTENSION_HEADER = "x-nexus-extension"
export const CAPABILITIES_HEADER = "x-nexus-capabilities"
export const VERSION_HEADER = "x-nexus-content-version"

const ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/

export function listProviders() {
  return Object.values(PROVIDERS).map((p) => ({ kind: p.kind, versions: p.versions, actions: p.actions }))
}

/**
 * Resolves caller, kind, version and declared capabilities, then returns a
 * provider facade that refuses any action the extension did not declare.
 */
export async function contentAccessFor(request: Request, kind: string) {
  const user = await requireLibraryUser()
  if ("response" in user) return user
  const extensionId = request.headers.get(EXTENSION_HEADER)?.trim() ?? ""
  if (!ID_PATTERN.test(extensionId)) {
    return { response: jsonError(400, `Missing or invalid ${EXTENSION_HEADER} header.`, "bad_request") }
  }
  const provider = (PROVIDERS as Record<string, ContentProvider | undefined>)[kind]
  if (!provider) return { response: jsonError(404, `No provider for content kind "${kind}".`, "unknown_kind") }

  const requested = Number(request.headers.get(VERSION_HEADER) ?? provider.versions.at(-1))
  if (!(provider.versions as readonly number[]).includes(requested)) {
    return {
      response: jsonError(400, `"${kind}" v${requested} is not served; supported: ${provider.versions.join(", ")}.`, "unsupported_version"),
    }
  }

  const declared = new Set((request.headers.get(CAPABILITIES_HEADER) ?? "").split(",").map((s) => s.trim()))
  const ctx = { userId: user.userId, extensionId }
  const need = (action: ContentAction) => {
    const cap = contentCapability(provider.kind, action)
    if (!declared.has(cap)) throw new ContentAccessError(`${extensionId} did not declare "${cap}"`, "forbidden")
    if (action === "annotate" && !declared.has(contentCapability(provider.kind, "read"))) {
      throw new ContentAccessError(`"${cap}" requires "${contentCapability(provider.kind, "read")}"`, "forbidden")
    }
    if (!provider.actions.includes(action)) throw new ContentAccessError(`"${kind}" does not support ${action}`, "forbidden")
  }

  return {
    access: {
      collections: () => (need("read"), provider.collections(ctx)),
      list: (query: { collectionId?: string; tag?: string }) => (need("read"), provider.list(ctx, query)),
      get: (id: string) => (need("read"), provider.get(ctx, id)),
      annotate: (id: string, input: unknown) => {
        need("annotate")
        if (!provider.annotate) throw new ContentAccessError(`"${kind}" does not support annotate`, "forbidden")
        return provider.annotate(ctx, id, input)
      },
    },
  }
}

const STATUS = { forbidden: 403, not_found: 404, invalid: 400, unknown_kind: 404, unsupported_version: 400 } as const

export async function respond<T>(run: () => Promise<T>) {
  try {
    return json(await run())
  } catch (error) {
    if (error instanceof ContentAccessError) return jsonError(STATUS[error.code], error.message, error.code)
    return libraryFailure(error)
  }
}
