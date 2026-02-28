"use client"

import { cn } from "@axel-delafosse/ui/utils"
import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props) {
  const mergedClassName = cn(
    "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
    className
  )

  return (
    <SeparatorPrimitive
      className={mergedClassName}
      data-slot="separator"
      orientation={orientation}
      {...props}
    />
  )
}

export { Separator }
