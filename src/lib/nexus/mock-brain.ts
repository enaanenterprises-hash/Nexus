const PROACTIVE_LINES = [
  "Your focus window looks open for the next 40 minutes — want me to protect it?",
  "Two high-priority threads are converging. I can sequence them for you.",
  "I noticed Calendar and Call slots are still dark. Pro unlocks those nodes when you're ready.",
  "Context sync is quiet. Tell me what you're carrying and I'll hold it on the network.",
];

const RESPONSE_TEMPLATES: Array<(input: string) => string> = [
  (input) =>
    `Holding “${trim(input)}” on the network. I've tagged it against your active priorities and will surface it when related nodes wake.`,
  (input) =>
    `Mapped that signal. Next move: break “${trim(input)}” into one decisive action, then park the rest in Ongoing Context.`,
  (input) =>
    `Understood. I'm treating “${trim(input)}” as live context — ask me to prioritize, defer, or hand it to an extension slot when one snaps in.`,
  (input) =>
    `Received. No extension is active yet, so I'll keep “${trim(input)}” in the core brain until Studio or Study comes online.`,
];

function trim(input: string, max = 48): string {
  const clean = input.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

export function pickProactiveSuggestion(seed = 0): string {
  const index = Math.abs(seed) % PROACTIVE_LINES.length;
  return PROACTIVE_LINES[index]!;
}

export function mockNexusReply(input: string, seed = 0): string {
  const index = Math.abs(seed) % RESPONSE_TEMPLATES.length;
  const template = RESPONSE_TEMPLATES[index]!;
  return template(input || "an empty pulse");
}

export type PulseMessage = {
  id: string;
  role: "user" | "nexus" | "system";
  text: string;
  at: string;
};

export function createPulseId(): string {
  return `pulse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
