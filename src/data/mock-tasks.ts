export type TaskPriority = "critical" | "high" | "steady";

export type NexusTask = {
  id: string;
  title: string;
  priority: TaskPriority;
  status: "active" | "waiting" | "done";
  context: string;
};

export type LifeContextThread = {
  id: string;
  label: string;
  detail: string;
};

export const INITIAL_TASKS: NexusTask[] = [
  {
    id: "t-1",
    title: "Ship Nexus Step 1 dashboard",
    priority: "critical",
    status: "active",
    context: "Core interaction + extension socket",
  },
  {
    id: "t-2",
    title: "Draft Pro pricing narrative",
    priority: "high",
    status: "active",
    context: "Freemium: 2 free nodes, rest on Pro",
  },
  {
    id: "t-3",
    title: "Sketch Studio extension contract",
    priority: "steady",
    status: "waiting",
    context: "Placeholder slot only — not built yet",
  },
  {
    id: "t-4",
    title: "Review Study node UX notes",
    priority: "steady",
    status: "waiting",
    context: "Future learning companion",
  },
];

export const INITIAL_CONTEXT_THREADS: LifeContextThread[] = [
  {
    id: "c-1",
    label: "Focus arc",
    detail: "Build the living network before any real extensions.",
  },
  {
    id: "c-2",
    label: "Open loop",
    detail: "Decide when to stub auth for the Pro gate.",
  },
  {
    id: "c-3",
    label: "Personal",
    detail: "Protect deep-work mornings; keep evenings for review.",
  },
];
