"use client"

import { cn } from "@axel-delafosse/ui/utils"
import { getMarkdown, getString, getValue } from "./data"
import { Markdown } from "./markdown"
import { Shimmer } from "./shimmer"
import type { StreamItem } from "./types"
import { useNewlineGatedText } from "./use-newline-gated-text"

interface MessageProps {
  item: StreamItem
}

export function Message({ item }: MessageProps) {
  const directText = getMarkdown(item.data, [
    "text",
    "content",
    "markdown",
    "message",
    "delta",
    "input",
    "prompt",
  ])
  const nestedMessage = getValue(item.data, ["item", "msg", "raw"])
  const nestedText = getMarkdown(nestedMessage, [
    "text",
    "content",
    "markdown",
    "message",
    "delta",
    "input",
    "prompt",
  ])
  const rawText = directText ?? nestedText
  const role = getString(item.data, ["role", "messageRole", "authorRole"])
  const isUserMessage = role === "user"
  const isStreaming = item.status === "streaming"
  const gatedText = useNewlineGatedText(rawText, isStreaming)
  const text = gatedText

  return (
    <div className={cn("py-1", isUserMessage && "flex w-full justify-end")}>
      <div
        className={cn(
          "text-sm",
          isUserMessage
            ? "max-w-[85%] rounded-2xl rounded-br-md border border-blue-400/35 bg-blue-950/40 px-3 py-2 text-zinc-50 shadow-sm"
            : "text-zinc-200"
        )}
      >
        {text ? (
          <Markdown
            className={cn(isUserMessage && "[&_a]:text-zinc-100")}
            text={text}
          />
        ) : isStreaming ? (
          <Shimmer as="span" className="text-sm text-zinc-400" duration={2}>
            Thinking…
          </Shimmer>
        ) : null}
      </div>
    </div>
  )
}
