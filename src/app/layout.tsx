import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const displaySerif = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Nexus — Personal AI Network",
  description:
    "A personal AI operating environment with a modular extension network. One living brain — extensions share context instead of silos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("dark h-full antialiased", manrope.variable, displaySerif.variable, "font-sans")}
    >
      <body className="flex min-h-full flex-col">
        <TooltipProvider delay={240}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
