import type { ShipmentCarrier } from "../kinds";

export interface ParsedReceipt {
  isReceipt: boolean;
  merchant: string | null;
  total: number | null;
  currency: string | null;
  orderNumber: string | null;
  items: { name: string; quantity: number; price: number | null }[];
  tracking: { carrier: ShipmentCarrier; number: string } | null;
}

const CURRENCY: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "¥": "JPY" };

const TOTAL = /(?:order total|grand total|total charged|amount charged|amount paid|total)\s*:?\s*(?:(USD|EUR|GBP|CAD|AUD)\s*)?([$€£¥])?\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2})/i;
const ORDER = /order\s*(?:#|number|no\.?|id)\s*:?\s*#?\s*([A-Z0-9][A-Z0-9-]{4,24})/i;
const LINE_ITEM = /^\s*(\d{1,2})\s*[x×]\s+(.{2,80}?)\s+[$€£¥]?(\d+(?:\.\d{2}))\s*$/gim;

const TRACKERS: { carrier: ShipmentCarrier; pattern: RegExp; keyword?: RegExp }[] = [
  { carrier: "ups", pattern: /\b1Z[0-9A-Z]{16}\b/ },
  { carrier: "amazon", pattern: /\bTBA\d{12}\b/ },
  { carrier: "usps", pattern: /\b9[2-5]\d{20}\b/ },
  { carrier: "fedex", pattern: /\b\d{12}(?:\d{3})?\b/, keyword: /fedex/i },
  { carrier: "dhl", pattern: /\b\d{10}\b/, keyword: /\bdhl\b/i },
];

const RECEIPT_WORDS = /\b(receipt|order confirm|your order|order #|thanks for your (?:order|purchase)|invoice|payment received|has shipped|shipped)\b/i;

function merchantFrom(from: string): string | null {
  const display = /^\s*"?([^"<]+?)"?\s*</.exec(from)?.[1]?.trim();
  if (display && !/^(no-?reply|orders?|receipts?|info)$/i.test(display)) return display;
  const domain = /@([a-z0-9.-]+)/i.exec(from)?.[1];
  if (!domain) return null;
  const parts = domain.split(".");
  const name = parts.length > 2 ? parts[parts.length - 2] : parts[0];
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : null;
}

/**
 * Deterministic receipt and tracking-number detection for an email. No AI:
 * just carrier formats and the phrases receipts actually use.
 */
export function parseReceipt(message: { from: string; subject: string; body: string }): ParsedReceipt {
  const text = `${message.subject}\n${message.body}`;
  const totalMatch = TOTAL.exec(text);
  const symbol = totalMatch?.[2];
  const code = totalMatch?.[1]?.toUpperCase();
  const total = totalMatch ? Number(totalMatch[3]!.replace(/,/g, "")) : null;

  let tracking: ParsedReceipt["tracking"] = null;
  for (const t of TRACKERS) {
    if (t.keyword && !t.keyword.test(text)) continue;
    const match = t.pattern.exec(text);
    if (match) {
      tracking = { carrier: t.carrier, number: match[0] };
      break;
    }
  }

  const items: ParsedReceipt["items"] = [];
  for (const m of text.matchAll(LINE_ITEM)) items.push({ quantity: Number(m[1]), name: m[2]!.trim(), price: Number(m[3]) });

  const orderNumber = ORDER.exec(text)?.[1] ?? null;
  const isReceipt = RECEIPT_WORDS.test(text) && (total !== null || orderNumber !== null || tracking !== null);
  return {
    isReceipt,
    merchant: merchantFrom(message.from),
    total,
    currency: total === null ? null : (code ?? (symbol ? CURRENCY[symbol] : undefined) ?? "USD"),
    orderNumber,
    items,
    tracking,
  };
}
