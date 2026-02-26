import { getMarkdown } from "./stream-data"
import { StreamMarkdown } from "./stream-markdown"
import type { StreamItem } from "./stream-types"

interface StreamMessageProps {
  item: StreamItem
}

export function StreamMessage({ item }: StreamMessageProps) {
  const text = getMarkdown(item.data, [
    "text",
    "content",
    "markdown",
    "message",
    "delta",
  ])

  return (
    <div className="py-1 text-sm text-zinc-200">
      {text ? (
        <StreamMarkdown text={text} />
      ) : (
        <p className="text-zinc-500 italic">Waiting for message content...</p>
      )}
    </div>
  )
}
