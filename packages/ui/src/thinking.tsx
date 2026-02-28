"use client"

import { useMemo, useState } from "react"
import { cn } from "@axel-delafosse/ui/utils"
import type { CompactThinkingBlock } from "./compact-stream-items"
import { getMarkdown } from "./data"
import { Markdown } from "./markdown"
import { Shimmer } from "./shimmer"
import type { StreamItem } from "./types"

interface ThinkingProps {
  item: StreamItem
}

const BOLD_TOKEN_RE = /\*\*(.+?)\*\*/

function extractBoldToken(text: string): string | null {
  const match = BOLD_TOKEN_RE.exec(text)
  return match ? match[1] : null
}

/** Threshold for showing expand toggle on complete thinking blocks. */
const LONG_THINKING_LENGTH = 200

export function Thinking({ item }: ThinkingProps) {
  const text = getMarkdown(item.data, [
    "text",
    "content",
    "thinking",
    "summary",
    "reasoning",
  ])

  const isStreaming = item.status === "streaming"
  const [expanded, setExpanded] = useState(false)

  const statusHeader = useMemo(() => {
    if (!isStreaming) {
      return null
    }
    if (text) {
      return extractBoldToken(text)
    }
    return null
  }, [isStreaming, text])

  // While streaming: dynamic status header
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
  if (!text) {
    return null
  }

  const isLong = text.length > LONG_THINKING_LENGTH

  return (
    <div className="py-1">
      <div
        className={cn(
          "border-zinc-800 border-l pl-3 text-sm text-zinc-400 italic",
          !expanded && isLong && "line-clamp-3"
        )}
      >
        <Markdown text={text} />
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

// ---------------------------------------------------------------------------
// Block component: accumulated thinking/reasoning items
// ---------------------------------------------------------------------------

const THINKING_MARKDOWN_KEYS = [
  "text",
  "content",
  "thinking",
  "summary",
  "reasoning",
] as const

interface ThinkingBlockProps {
  block: CompactThinkingBlock
}

export function ThinkingBlock({ block }: ThinkingBlockProps) {
  const text = useMemo(() => {
    const pieces: string[] = []
    for (const item of block.items) {
      const md = getMarkdown(item.data, THINKING_MARKDOWN_KEYS)
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
    if (text) {
      return extractBoldToken(text)
    }
    return null
  }, [isStreaming, text])

  // While streaming: dynamic status header
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
  if (!text) {
    return null
  }

  const isLong = text.length > LONG_THINKING_LENGTH

  return (
    <div className="py-1">
      <div
        className={cn(
          "border-zinc-800 border-l pl-3 text-sm text-zinc-400 italic",
          !expanded && isLong && "line-clamp-3"
        )}
      >
        <Markdown text={text} />
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
