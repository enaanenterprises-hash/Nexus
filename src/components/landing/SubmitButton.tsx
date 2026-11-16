"use client"

import type { ReactNode } from "react"
import { useFormStatus } from "react-dom"
import { Button } from "@/components/ui/button"

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
    <Button
      type="submit"
      className={className}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? pendingLabel : children}
    </Button>
  )
}
