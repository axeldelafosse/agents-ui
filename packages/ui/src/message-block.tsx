"use client"

import type { CompactMessageBlock } from "./compact-stream-items"
import { getMarkdown } from "./data"
import { Markdown } from "./markdown"
import { Shimmer } from "./shimmer"
import { useNewlineGatedText } from "./use-newline-gated-text"

interface MessageBlockProps {
  block: CompactMessageBlock
}

export function MessageBlock({ block }: MessageBlockProps) {
  const parts: string[] = []

  for (const item of block.items) {
    const text = getMarkdown(item.data, [
      "text",
      "content",
      "markdown",
      "message",
      "delta",
      "input",
      "prompt",
    ])
    if (text) {
      parts.push(text)
    }
  }

  const combined = parts.join("\n\n")
  const isStreaming = block.status === "streaming"
  const gatedText = useNewlineGatedText(combined || undefined, isStreaming)

  if (!gatedText) {
    if (isStreaming) {
      return (
        <div className="py-1">
          <div className="text-sm text-zinc-200">
            <Shimmer as="span" className="text-sm text-zinc-400" duration={2}>
              Thinking…
            </Shimmer>
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="py-1">
      <div className="text-sm text-zinc-200">
        <Markdown text={gatedText} />
      </div>
    </div>
  )
}
