import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope, Source_Serif_4 } from "next/font/google";
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

const editorialSerif = Source_Serif_4({
  variable: "--font-editorial",
  subsets: ["latin"],
  weight: ["400", "500"],
});

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
        manrope.variable,
        displaySerif.variable,
        editorialSerif.variable,
        "font-sans",
      )}
    >
      <body className="flex min-h-full flex-col">
        <TooltipProvider delay={240}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
