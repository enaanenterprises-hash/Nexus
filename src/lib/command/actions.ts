/**
 * Actions automations can take. Connector actions run on whichever active
 * connection declares them in its manifest; core actions run inside Command
 * and need no connector.
 */
export const ACTION_DEFINITIONS = {
  "calendar.block": { label: "Block time on the calendar", dispatch: "one", core: false },
  "music.play": { label: "Start a focus playlist", dispatch: "one", core: false },
  "music.pause": { label: "Pause music", dispatch: "one", core: false },
  "presence.dnd": { label: "Turn on Do Not Disturb", dispatch: "all", core: false },
  "presence.clear": { label: "Clear Do Not Disturb", dispatch: "all", core: false },
  "lights.scene": { label: "Set a lighting scene", dispatch: "all", core: false },
  "telemetry.track": { label: "Track coding time", dispatch: "one", core: false },
  "notify.send": { label: "Send an alert", dispatch: "one", core: false },
  "mail.send": { label: "Send an email", dispatch: "one", core: false },
  "purchase.record": { label: "Record the purchase on the network", dispatch: "core", core: true },
  "shipment.track": { label: "Pin a package tracker to the schedule", dispatch: "core", core: true },
  "goal.check": { label: "Check off a matching goal", dispatch: "core", core: true },
  "signal.update": { label: "Update a reading", dispatch: "core", core: true },
  "task.create": { label: "Create a task", dispatch: "core", core: true },
  "activity.log": { label: "Log an activity", dispatch: "core", core: true },
} as const;

export type ActionId = keyof typeof ACTION_DEFINITIONS;

/** `one`: first matching connection (live preferred). `all`: every matching connection. `core`: Command itself. */
export type ActionDispatch = (typeof ACTION_DEFINITIONS)[ActionId]["dispatch"];

export const CONNECTOR_ACTIONS = (Object.keys(ACTION_DEFINITIONS) as ActionId[]).filter((a) => !ACTION_DEFINITIONS[a].core);

export function isActionId(value: string): value is ActionId {
  return Object.hasOwn(ACTION_DEFINITIONS, value);
}
