import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export const POLICY_DATE = "14 November 2026";

export function SiteDocument({
  kicker,
  title,
  lede,
  children,
}: {
  kicker: string;
  title: string;
  lede: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="landing flex min-h-[100svh] flex-1 flex-col">
      <SiteHeader />
      <main className="site-document">
        <p className="site-kicker">{kicker}</p>
        <h1 className="site-display">{title}</h1>
        <div className="site-lede">{lede}</div>
        <div className="site-prose">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
