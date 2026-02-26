import { getMarkdown } from "./stream-data"
import { StreamMarkdown } from "./stream-markdown"
import type { StreamItem } from "./stream-types"

interface StreamReasoningProps {
  item: StreamItem
}

export function StreamReasoning({ item }: StreamReasoningProps) {
  const summary = getMarkdown(item.data, [
    "summary",
    "text",
    "reasoning",
    "content",
    "message",
  ])

  if (summary) {
    return <StreamMarkdown shimmer={true} text={summary} />
  }

  return <StreamMarkdown shimmer={true} text="**Thinking**" />
}
