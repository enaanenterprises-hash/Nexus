import "server-only"
import { ContentAccessError, type ContentProvider } from "@/lib/content/provider"
import type { ContentKindMap } from "@/lib/extensions/content"
import { getConnector } from "@/lib/connectors/catalog"
import { COMMAND_CORE_SOURCE, type CommandKind } from "./kinds"
import { getItem, itemCollections, listItems } from "./store"

/** One read-only provider per Command kind. Collections are the connectors that produced items. */
function provider<K extends CommandKind>(kind: K): ContentProvider<K> {
  return {
    kind,
    versions: [1],
    actions: ["read"],
    async collections({ userId }) {
      return (await itemCollections(userId, kind)).map((c) => ({
        id: c.connectorId,
        name: c.connectorId === COMMAND_CORE_SOURCE ? "Command automations" : (getConnector(c.connectorId)?.name ?? c.connectorId),
        description: null,
        itemCount: c.count,
        updatedAt: c.updatedAt,
      }))
    },
    async list({ userId }, { collectionId }) {
      return (await listItems(userId, kind, { connectorId: collectionId })) as ContentKindMap[K]["listItem"][]
    },
    async get({ userId }, id) {
      const item = await getItem(userId, id)
      if (!item || item.kind !== kind) throw new ContentAccessError("Item not found", "not_found")
      return item as ContentKindMap[K]["item"]
    },
  }
}

export const commandContentProviders = {
  "command.event": provider("command.event"),
  "command.task": provider("command.task"),
  "command.deadline": provider("command.deadline"),
  "command.activity": provider("command.activity"),
  "command.purchase": provider("command.purchase"),
  "command.shipment": provider("command.shipment"),
  "command.message": provider("command.message"),
  "command.signal": provider("command.signal"),
} satisfies { [K in CommandKind]: ContentProvider<K> }
