/** Curated 4×2 Command board layouts built strictly from registered widgets. */
export interface CommandBoardPreset {
  id: string;
  name: string;
  tagline: string;
  widgets: readonly string[];
}

export const COMMAND_BOARD_PRESETS: readonly CommandBoardPreset[] = [
  {
    id: "daily-atelier",
    name: "Daily Atelier",
    tagline: "Storage, schedule, forecast, and tasks",
    widgets: ["storage", "calendar", "weather", "tasks"],
  },
  {
    id: "creator-desk",
    name: "Creator Desk",
    tagline: "Storage Vault, inbox, and studio calendar",
    widgets: ["storage", "gmail", "calendar"],
  },
  {
    id: "builder-desk",
    name: "Builder Desk",
    tagline: "Storage, GitHub, mail, deploys, and tasks",
    widgets: ["storage", "github", "gmail", "vercel", "tasks"],
  },
  {
    id: "minimal-focus",
    name: "Minimal Focus",
    tagline: "Storage, calendar, and tasks with room to breathe",
    widgets: ["storage", "calendar", "tasks"],
  },
];

export function matchesPreset(current: readonly string[], preset: CommandBoardPreset): boolean {
  if (current.length !== preset.widgets.length) return false;
  return preset.widgets.every((id) => current.includes(id));
}
