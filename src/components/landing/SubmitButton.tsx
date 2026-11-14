"use client"

import type { ReactNode } from "react"
import { useFormStatus } from "react-dom"

export function SubmitButton({
  className,
  pendingLabel,
  children,
}: {
  className: string
  pendingLabel: string
  children: ReactNode
}) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  )
}
