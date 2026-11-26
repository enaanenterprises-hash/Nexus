import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { cabinetGrotesk, commitMono, gambetta, generalSans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus",
  description:
    "Nexus is an architectural design built to connect your workflows into one continuous, unbroken flow, with modular components curated around you. Nexus is yours.",
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
      className={cn(
        "dark h-full antialiased",
        generalSans.variable,
        cabinetGrotesk.variable,
        gambetta.variable,
        commitMono.variable,
        "font-sans",
      )}
    >
      <body className="flex min-h-full flex-col">
        <TooltipProvider delay={240}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
