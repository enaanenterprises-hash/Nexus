import Link from "next/link";
import { NexusWordmark } from "./NexusLogo";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link href="/" aria-label="Nexus home" className="inline-flex">
        <NexusWordmark className="h-[14px] w-auto sm:h-[17px]" />
      </Link>
      <Link href="/waitlist" className="landing-signup">
        Join waitlist
      </Link>
    </header>
  );
}
