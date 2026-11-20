import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import { readViewer } from "@/lib/auth/viewer"
import { isAdminEmail } from "@/lib/auth/signups"
import { databaseUrl, ensureWaitlistSchema, getSql } from "@/lib/db/client"

export const metadata: Metadata = {
  title: "Waitlist — Nexus admin",
  robots: { index: false, follow: false },
}

type Row = { id: string; email: string; createdAt: Date }

async function WaitlistTable() {
  const viewer = await readViewer()
  if (!viewer || !isAdminEmail(viewer.email)) notFound()

  let rows: Row[] = []
  let problem: string | null = null
  if (!databaseUrl()) {
    problem = "DATABASE_URL is not set, so no signups are being stored."
  } else {
    try {
      await ensureWaitlistSchema()
      rows = await getSql()<Row[]>`SELECT "id", "email", "createdAt" FROM "waitlist" ORDER BY "createdAt" DESC`
    } catch (error) {
      console.error("Waitlist admin error:", error instanceof Error ? error.message : error)
      problem = "Could not read the waitlist."
    }
  }

  return (
    <main className="mx-auto max-w-[720px] px-6 py-16 text-[15px] text-[#0e0f12]">
      <h1 className="font-editorial text-[2rem] tracking-[-0.03em]">Waitlist</h1>
      <p className="mt-2 text-[#636570]">{problem ?? `${rows.length} signup${rows.length === 1 ? "" : "s"}, newest first.`}</p>
      {rows.length > 0 ? (
        <table className="mt-8 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[#0e0f12]/15 text-[13px] text-[#636570]">
              <th className="py-2 pr-4 font-medium">Email</th>
              <th className="py-2 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[#0e0f12]/[0.07]">
                <td className="py-2.5 pr-4">{row.email}</td>
                <td className="py-2.5 tabular-nums text-[#636570]">
                  {new Date(row.createdAt).toISOString().slice(0, 16).replace("T", " ")} UTC
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </main>
  )
}

export default function WaitlistAdminPage() {
  return (
    <Suspense fallback={null}>
      <WaitlistTable />
    </Suspense>
  )
}

