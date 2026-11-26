export type NexusFontRole = "display" | "sans" | "serif" | "mono";

const CSS_VAR_BY_ROLE: Record<NexusFontRole, { cssVar: string; fallback: string }> = {
  display: {
    cssVar: "--font-cabinet-grotesk",
    fallback: "'Cabinet Grotesk', -apple-system, 'SF Pro Display', sans-serif",
  },
  sans: {
    cssVar: "--font-general-sans",
    fallback: "'General Sans', -apple-system, 'SF Pro Text', sans-serif",
  },
  serif: {
    cssVar: "--font-gambetta",
    fallback: "'Gambetta', 'New York', Georgia, serif",
  },
  mono: {
    cssVar: "--font-commit-mono",
    fallback: "'Commit Mono', ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace",
  },
};

/**
 * Resolves the live `@font-face` family registered by `next/font/local` on `<html>`
 * for Canvas2D (`ctx.font`), where CSS `var(--...)` custom properties are ignored.
 * Safe under SSR and Node (`scripts/smoke-extensions.mjs`).
 */
export function resolveRuntimeFontFamily(role: NexusFontRole): string {
  const spec = CSS_VAR_BY_ROLE[role];
  if (typeof document !== "undefined") {
    const resolved = getComputedStyle(document.documentElement)
      .getPropertyValue(spec.cssVar)
      .trim();
    if (resolved) return `${resolved}, ${spec.fallback}`;
  }
  return spec.fallback;
}
