import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import { NexusWordmark } from "./NexusLogo";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link href="/" aria-label="Nexus home" className="inline-flex">
        <NexusWordmark className="h-[14px] w-auto sm:h-[17px]" />
      </Link>
      <Link
        href="/waitlist"
        className={cn(buttonVariants({ variant: "outline" }), "landing-signup h-auto rounded-full")}
      >
        Join waitlist
      </Link>
    </header>
  );
}
