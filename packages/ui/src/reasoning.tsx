import { getMarkdown } from "./data"
import { Markdown } from "./markdown"
import type { StreamItem } from "./types"

interface ReasoningProps {
  item: StreamItem
}

export function Reasoning({ item }: ReasoningProps) {
  const summary = getMarkdown(item.data, [
    "summary",
    "text",
    "reasoning",
    "content",
    "message",
  ])

  if (summary) {
    return <Markdown shimmer={true} text={summary} />
  }

  return <Markdown shimmer={true} text="**Thinking**" />
}
