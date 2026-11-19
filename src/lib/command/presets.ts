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
    tagline: "Schedule, inbox, forecast, and tasks",
    widgets: ["calendar", "gmail", "weather", "tasks"],
  },
  {
    id: "builder-desk",
    name: "Builder Desk",
    tagline: "GitHub, mail, deploys, tasks, and uptime",
    widgets: ["github", "gmail", "vercel", "tasks", "uptime"],
  },
  {
    id: "live-telemetry",
    name: "Live Telemetry",
    tagline: "F1, markets, weather, sky, and Strava",
    widgets: ["f1", "crypto", "weather", "sky", "strava"],
  },
  {
    id: "minimal-focus",
    name: "Minimal Focus",
    tagline: "Calendar, weather, and tasks with room to breathe",
    widgets: ["calendar", "weather", "tasks"],
  },
];

export function matchesPreset(current: readonly string[], preset: CommandBoardPreset): boolean {
  if (current.length !== preset.widgets.length) return false;
  return preset.widgets.every((id) => current.includes(id));
}
