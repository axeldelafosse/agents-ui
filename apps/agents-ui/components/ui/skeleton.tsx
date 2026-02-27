import { cn } from "@axel-delafosse/ui/utils"
import type * as React from "react"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-muted", className)}
      data-slot="skeleton"
      {...props}
    />
  )
}

export { Skeleton }
