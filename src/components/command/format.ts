import { getConnector } from "@/lib/connectors/catalog";
import { COMMAND_CORE_SOURCE } from "@/lib/command/kinds";

export function clock(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** "in 42 min", "in 3 h", "in 5 d", "12 min ago". */
export function relative(iso: string, now: number): string {
  const diff = Date.parse(iso) - now;
  const abs = Math.abs(diff);
  if (abs < 60_000) return "just now";
  const unit = abs < 3_600_000 ? `${Math.max(1, Math.round(abs / 60_000))} min` : abs < 86_400_000 ? `${Math.round(abs / 3_600_000)} h` : `${Math.round(abs / 86_400_000)} d`;
  return diff >= 0 ? `in ${unit}` : `${unit} ago`;
}

export function countdown(iso: string, now: number): string {
  const s = Math.max(0, Math.round((Date.parse(iso) - now) / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function sourceName(connectorId: string): string {
  if (connectorId === COMMAND_CORE_SOURCE) return "Command";
  return getConnector(connectorId)?.name ?? connectorId;
}

export function sourceMonogram(connectorId: string): string {
  if (connectorId === COMMAND_CORE_SOURCE) return "Cm";
  return getConnector(connectorId)?.monogram ?? connectorId.slice(0, 2);
}

export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
