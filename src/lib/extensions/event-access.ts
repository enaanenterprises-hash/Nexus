import { contentCapability } from "./content";
import type { ExtensionCapability, NexusEvent } from "./types";

/**
 * Some bus events carry user content. An extension only receives them when
 * its manifest declares the matching capability, so subscribing to the bus
 * never grants more than `runtime.content` would.
 */
export function requiredCapability(event: NexusEvent): ExtensionCapability | null {
  switch (event.type) {
    case "command:item-published":
      return contentCapability((event as NexusEvent<"command:item-published">).payload.kind, "read");
    case "command:automation-ran":
      return "automations";
    case "studio:recording-saved":
    case "studio:take-routed":
    case "studio:smart-cuts":
    case "studio:rhythm-grid":
      return contentCapability("studio.recording", "read");
    case "cinema:project-saved":
    case "cinema:project-routed":
      return contentCapability("cinema.project", "read");
    case "optics:project-saved":
    case "optics:photo-routed":
      return contentCapability("optics.project", "read");
    default:
      return null;
  }
}

export function canReceive(event: NexusEvent, capabilities: readonly ExtensionCapability[]): boolean {
  const needed = requiredCapability(event);
  return needed === null || capabilities.includes(needed);
}
