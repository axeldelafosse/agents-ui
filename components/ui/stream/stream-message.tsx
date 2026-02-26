import { cn } from "@/lib/utils"
import { getMarkdown, getString, getValue } from "./stream-data"
import { StreamMarkdown } from "./stream-markdown"
import type { StreamItem } from "./stream-types"

interface StreamMessageProps {
  item: StreamItem
}

export function StreamMessage({ item }: StreamMessageProps) {
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
  const text = directText ?? nestedText
  const role = getString(item.data, ["role", "messageRole", "authorRole"])
  const isUserMessage = role === "user"

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
          <StreamMarkdown
            className={cn(isUserMessage && "[&_a]:text-zinc-100")}
            text={text}
          />
        ) : (
          <p className="text-zinc-500 italic">Waiting for message content...</p>
        )}
      </div>
    </div>
  )
}
