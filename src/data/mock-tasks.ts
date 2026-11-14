export type TaskPriority = "critical" | "high" | "steady";

export type NexusTask = {
  id: string;
  title: string;
  priority: TaskPriority;
  status: "active" | "done";
  note: string;
  /** Time block Nexus assigned when organizing the day, e.g. "9:00". */
  block?: string;
};

export type LifeContextThread = {
  id: string;
  label: string;
  detail: string;
};

export const INITIAL_TASKS: NexusTask[] = [
  {
    id: "t-1",
    title: "Finalize the Nexus pitch deck",
    priority: "critical",
    status: "active",
    note: "Investor call Thursday",
  },
  {
    id: "t-2",
    title: "Draft Pro pricing narrative",
    priority: "high",
    status: "active",
    note: "Two free nodes, the rest on Pro",
  },
  {
    id: "t-3",
    title: "Reply to Maya about the studio space",
    priority: "high",
    status: "active",
    note: "She needs an answer by Friday",
  },
  {
    id: "t-4",
    title: "Book a dentist appointment",
    priority: "steady",
    status: "active",
    note: "Overdue since October",
  },
  {
    id: "t-5",
    title: "Evening run",
    priority: "steady",
    status: "active",
    note: "30 minutes, easy pace",
  },
];

export const INITIAL_CONTEXT_THREADS: LifeContextThread[] = [
  { id: "c-1", label: "This week", detail: "Investor prep comes before everything else." },
  { id: "c-2", label: "Open loop", detail: "Decide when to wire real auth behind the Pro gate." },
  { id: "c-3", label: "Personal", detail: "Protect deep-work mornings; evenings are for review." },
];
