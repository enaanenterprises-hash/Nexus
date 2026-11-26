import localFont from "next/font/local";

export const generalSans = localFont({
  src: "../assets/fonts/GeneralSans-Variable.woff2",
  variable: "--font-general-sans",
  weight: "200 700",
  display: "swap",
});

export const cabinetGrotesk = localFont({
  src: "../assets/fonts/CabinetGrotesk-Variable.woff2",
  variable: "--font-cabinet-grotesk",
  weight: "100 900",
  display: "swap",
});

export const gambetta = localFont({
  src: [
    { path: "../assets/fonts/Gambetta-Variable.woff2", weight: "300 700", style: "normal" },
    { path: "../assets/fonts/Gambetta-VariableItalic.woff2", weight: "300 700", style: "italic" },
  ],
  variable: "--font-gambetta",
  display: "swap",
});

export const commitMono = localFont({
  src: "../assets/fonts/CommitMono-Variable.woff2",
  variable: "--font-commit-mono",
  weight: "200 700",
  display: "swap",
});

/** Resolves exact self-hosted `@font-face` strings for Canvas2D `ctx.font` and inline style consumers. */
export function resolveCanvasFontFamily(kind: "display" | "sans" | "serif" | "mono"): string {
  switch (kind) {
    case "display":
      return `${cabinetGrotesk.style.fontFamily}, -apple-system, sans-serif`;
    case "sans":
      return `${generalSans.style.fontFamily}, -apple-system, sans-serif`;
    case "serif":
      return `${gambetta.style.fontFamily}, "New York", Georgia, serif`;
    case "mono":
      return `${commitMono.style.fontFamily}, ui-monospace, monospace`;
  }
}
