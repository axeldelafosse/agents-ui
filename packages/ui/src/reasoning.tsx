"use client"

import { useMemo, useState } from "react"
import { cn } from "@axel-delafosse/ui/utils"
import type { CompactThinkingBlock } from "./compact-stream-items"
import { getMarkdown } from "./data"
import { Markdown } from "./markdown"
import { Shimmer } from "./shimmer"
import type { StreamItem } from "./types"

interface ReasoningProps {
  item: StreamItem
}

const BOLD_TOKEN_RE = /\*\*(.+?)\*\*/

/**
 * Extract the first **bold** token from reasoning text for use as a
 * dynamic status header while streaming.
 */
function extractBoldToken(text: string): string | null {
  const match = BOLD_TOKEN_RE.exec(text)
  return match ? match[1] : null
}

export function Reasoning({ item }: ReasoningProps) {
  const summary = getMarkdown(item.data, [
    "summary",
    "text",
    "reasoning",
    "content",
    "message",
  ])

  const isStreaming = item.status === "streaming"

  const statusHeader = useMemo(() => {
    if (!isStreaming) {
      return null
    }
    if (summary) {
      return extractBoldToken(summary)
    }
    return null
  }, [isStreaming, summary])

  // While streaming: show compact status header
  if (isStreaming) {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="size-1.5 animate-pulse rounded-full bg-blue-400" />
        <Shimmer as="span" className="text-sm" duration={2}>
          {statusHeader ?? "Thinking\u2026"}
        </Shimmer>
      </div>
    )
  }

  // Complete: show compact summary
  if (summary) {
    return (
      <div className={cn("py-1 text-sm text-zinc-400 italic")}>
        <Markdown text={summary} />
      </div>
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// Block component: accumulated reasoning items
// ---------------------------------------------------------------------------

const REASONING_MARKDOWN_KEYS = [
  "summary",
  "text",
  "reasoning",
  "content",
  "message",
] as const

/** Threshold for showing expand toggle on complete reasoning blocks. */
const LONG_REASONING_LENGTH = 200

interface ReasoningBlockProps {
  block: CompactThinkingBlock
}

export function ReasoningBlock({ block }: ReasoningBlockProps) {
  const summary = useMemo(() => {
    const pieces: string[] = []
    for (const item of block.items) {
      const md = getMarkdown(item.data, REASONING_MARKDOWN_KEYS)
      if (md) {
        pieces.push(md)
      }
    }
    return pieces.join("\n\n") || undefined
  }, [block.items])

  const isStreaming = block.status === "streaming"
  const [expanded, setExpanded] = useState(false)

  const statusHeader = useMemo(() => {
    if (!isStreaming) {
      return null
    }
    if (summary) {
      return extractBoldToken(summary)
    }
    return null
  }, [isStreaming, summary])

  // While streaming: show compact status header
  if (isStreaming) {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="size-1.5 animate-pulse rounded-full bg-blue-400" />
        <Shimmer as="span" className="text-sm" duration={2}>
          {statusHeader ?? "Thinking\u2026"}
        </Shimmer>
      </div>
    )
  }

  // Complete: compact summary with optional expand
  if (!summary) {
    return null
  }

  const isLong = summary.length > LONG_REASONING_LENGTH

  return (
    <div className="py-1">
      <div
        className={cn(
          "border-zinc-800 border-l pl-3 text-sm text-zinc-400 italic",
          !expanded && isLong && "line-clamp-3"
        )}
      >
        <Markdown text={summary} />
      </div>
      {isLong ? (
        <button
          className="mt-1 text-xs text-zinc-500 hover:text-zinc-300"
          onClick={() => setExpanded((prev) => !prev)}
          type="button"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  )
}
