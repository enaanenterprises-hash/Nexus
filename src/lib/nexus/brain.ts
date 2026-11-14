import type { LifeContextThread, NexusTask, TaskPriority } from "@/data/mock-tasks";

/**
 * Mock brain. Recognises a few intents so the dashboard can show Nexus acting
 * on your tasks; everything else is held as ongoing context. Swap for a real
 * model behind the same `think()` signature.
 */

export type BrainAction =
  | { type: "organize" }
  | { type: "add-task"; title: string; priority: TaskPriority }
  | { type: "complete-task"; id: string }
  | { type: "add-context"; label: string; detail: string };

export type BrainReply = {
  text: string;
  actions: BrainAction[];
  followUps: string[];
};

export type BrainInput = {
  tasks: NexusTask[];
  threads: LifeContextThread[];
  activeExtensions: string[];
};

const PRIORITY_ORDER: Record<TaskPriority, number> = { critical: 0, high: 1, steady: 2 };
const DAY_BLOCKS = ["9:00", "11:00", "13:30", "15:30", "18:00", "19:30"];

export const DEFAULT_FOLLOW_UPS = ["Organize my day", "What should I focus on?", "Add a task"];

export function greeting(hour: number): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function openingLine(hour: number, tasks: NexusTask[]): string {
  const open = tasks.filter((t) => t.status === "active");
  const critical = open.find((t) => t.priority === "critical");
  const lead = `${greeting(hour)}. ${open.length} things are open`;
  return critical
    ? `${lead}, and “${critical.title}” matters most. Want me to organize your day around it?`
    : `${lead}. Want me to organize your day?`;
}

export function organizeTasks(tasks: NexusTask[]): NexusTask[] {
  const open = tasks
    .filter((t) => t.status === "active")
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const done = tasks.filter((t) => t.status === "done");
  return [
    ...open.map((t, i) => ({ ...t, block: DAY_BLOCKS[Math.min(i, DAY_BLOCKS.length - 1)] })),
    ...done.map((t) => ({ ...t, block: undefined })),
  ];
}

function clip(input: string, max = 56): string {
  const clean = input.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function think(raw: string, { tasks, activeExtensions }: BrainInput): BrainReply {
  const input = raw.trim();
  const lower = input.toLowerCase();
  const open = tasks
    .filter((t) => t.status === "active")
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  const addMatch = input.match(/^(?:add(?: a task)?|remind me to|todo|i need to|i have to)\s*:?\s+(.+)/i);
  if (addMatch) {
    const title = capitalize(clip(addMatch[1]!.replace(/[.!]+$/, ""), 64));
    const priority: TaskPriority = /\b(urgent|asap|today|critical)\b/i.test(input) ? "critical" : "high";
    return {
      text: `Added “${title}” to your list as ${priority === "critical" ? "critical" : "a priority"}. I'll fit it into today's plan.`,
      actions: [{ type: "add-task", title, priority }],
      followUps: ["Organize my day", "What should I focus on?"],
    };
  }

  if (/^add(?: a task)?$/i.test(input)) {
    return {
      text: "Sure — tell me what it is, like “add call the bank tomorrow”.",
      actions: [],
      followUps: ["Add review the deck notes", "Add book flights for May"],
    };
  }

  if (/\b(organi[sz]e|plan|schedule|my day|my week)\b/.test(lower)) {
    const first = open[0];
    return {
      text: first
        ? `Done. I've laid out your day: “${first.title}” takes the 9:00 deep-work block, the replies sit before lunch, and the personal items land after 6. I'll shuffle things if anything slips.`
        : "Your list is clear. I've kept the day open; tell me what you want to protect.",
      actions: [{ type: "organize" }],
      followUps: ["What should I focus on?", "Move my run to tomorrow", "Add a task"],
    };
  }

  const doneMatch = lower.match(/^(?:done|finished|completed|i did|i finished)\s+(?:with\s+)?(.+)/);
  if (doneMatch) {
    const needle = doneMatch[1]!.replace(/^the\s+/, "");
    const hit = open.find((t) => t.title.toLowerCase().includes(needle));
    if (hit) {
      return {
        text: `Nice. “${hit.title}” is checked off. ${open.length - 1} left.`,
        actions: [{ type: "complete-task", id: hit.id }],
        followUps: ["What should I focus on?", "Organize my day"],
      };
    }
  }

  if (/\b(focus|next|first|priority|priorities|important)\b/.test(lower)) {
    const [first, second] = open;
    return {
      text: first
        ? `Start with “${first.title}”: ${first.note.toLowerCase()}. ${second ? `After that, “${second.title}”.` : "That's everything urgent."}`
        : "Nothing is pressing. A good moment to think ahead.",
      actions: [],
      followUps: first ? [`Done with ${first.title.toLowerCase()}`, "Organize my day"] : DEFAULT_FOLLOW_UPS,
    };
  }

  if (/\b(move|reschedule|tomorrow|later|postpone)\b/.test(lower)) {
    return {
      text: "Moved. I've noted it for tomorrow and freed that time in today's plan.",
      actions: [{ type: "add-context", label: "Moved", detail: capitalize(clip(input)) }],
      followUps: ["Organize my day", "What should I focus on?"],
    };
  }

  if (/\b(extension|studio|study|calendar|call|plugin|node)\b/.test(lower)) {
    return {
      text: activeExtensions.length
        ? `${activeExtensions.join(" and ")} ${activeExtensions.length > 1 ? "are" : "is"} wired in. Free plans run two at once; Pro opens the rest of the sockets.`
        : "No extensions are wired in yet. Pick one from the hub and it snaps into an open socket on the network. Studio, Study, Call, and Calendar are coming soon.",
      actions: [],
      followUps: ["Organize my day", "What should I focus on?"],
    };
  }

  return {
    text: `Got it. I'm keeping “${clip(input, 48)}” in your ongoing context so it can shape what I suggest next.`,
    actions: [{ type: "add-context", label: "Noted", detail: capitalize(clip(input)) }],
    followUps: DEFAULT_FOLLOW_UPS,
  };
}
