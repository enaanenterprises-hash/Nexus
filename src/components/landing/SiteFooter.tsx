import Link from "next/link";
import { NexusWordmark } from "./NexusLogo";

const LINKS = [
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-bar">
        <Link href="/" aria-label="Nexus home" className="inline-flex">
          <NexusWordmark className="h-[14px] w-auto sm:h-[17px]" preload={false} />
        </Link>
        <nav aria-label="Site" className="site-footer-nav">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="site-love">
        Made with love from <span className="site-love-end">Toronto <Heart /></span>
      </p>
    </footer>
  );
}

function Heart() {
  return (
    <svg className="site-heart" viewBox="0 0 24 24" role="img" aria-label="heart">
      <path
        fill="currentColor"
        d="M12 20.35 4.05 12.7C1.85 10.6 1.95 7.05 4.45 5.15c1.95-1.5 4.7-1.1 6.2.85L12 7.7l1.35-1.7c1.5-1.95 4.25-2.35 6.2-.85 2.5 1.9 2.6 5.45.4 7.55L12 20.35Z"
      />
    </svg>
  );
}
