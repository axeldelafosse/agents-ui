"use client"

import { motion } from "motion/react"
import type { CSSProperties } from "react"
import { useMemo } from "react"
import { Streamdown } from "streamdown"
import {
  computeShimmerSpread,
  DEFAULT_SHIMMER_SPREAD_MULTIPLIER,
} from "@/components/ui/shimmer-utils"
import { cn } from "@/lib/utils"

interface StreamMarkdownProps {
  className?: string
  shimmer?: boolean
  text: string
}

const streamdownClassName =
  "text-sm leading-relaxed [&_a]:text-zinc-200 [&_code]:font-mono [&_code]:text-xs"

export function StreamMarkdown({
  text,
  className,
  shimmer = false,
}: StreamMarkdownProps) {
  const spread = useMemo(
    () => computeShimmerSpread(text.length, DEFAULT_SHIMMER_SPREAD_MULTIPLIER),
    [text]
  )

  if (shimmer) {
    return (
      <motion.div
        animate={{ backgroundPosition: "0% center" }}
        className="w-fit bg-size-[250%_100%,auto] bg-clip-text [-webkit-text-fill-color:transparent] [background-repeat:no-repeat,padding-box]"
        initial={{ backgroundPosition: "100% center" }}
        style={
          {
            "--spread": `${spread}px`,
            backgroundImage:
              "linear-gradient(90deg, #0000 calc(50% - var(--spread)), var(--color-foreground), #0000 calc(50% + var(--spread))), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
          } as CSSProperties
        }
        transition={{
          duration: 2,
          ease: "linear",
          repeat: Number.POSITIVE_INFINITY,
        }}
      >
        <Streamdown className={cn(streamdownClassName, className)}>
          {text}
        </Streamdown>
      </motion.div>
    )
  }

  return (
    <Streamdown className={cn(streamdownClassName, className)}>
      {text}
    </Streamdown>
  )
}
