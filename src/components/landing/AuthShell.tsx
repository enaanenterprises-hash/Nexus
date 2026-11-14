import Link from "next/link"
import type { ReactNode } from "react"
import { GoldenNetwork } from "./GoldenNetwork"
import { NexusLogo } from "./NexusLogo"

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="landing relative flex min-h-[100svh] flex-1 flex-col overflow-hidden">
      <div className="absolute inset-0 opacity-40">
        <GoldenNetwork />
      </div>
      <header className="relative z-10 flex items-center px-6 pt-6 sm:px-10 sm:pt-8 lg:px-14">
        <Link href="/" aria-label="Nexus home" className="inline-flex">
          <NexusLogo className="h-[13px] w-auto sm:h-[15px]" />
        </Link>
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 pb-16">
        {children}
      </main>
    </div>
  )
}
