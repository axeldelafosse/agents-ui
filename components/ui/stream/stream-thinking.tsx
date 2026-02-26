import { getMarkdown } from "./stream-data"
import { StreamItemShell } from "./stream-item-shell"
import { StreamMarkdown } from "./stream-markdown"
import type { StreamItem } from "./stream-types"

interface StreamThinkingProps {
  item: StreamItem
}

export function StreamThinking({ item }: StreamThinkingProps) {
  const text = getMarkdown(item.data, [
    "text",
    "content",
    "thinking",
    "summary",
    "reasoning",
  ])

  return (
    <StreamItemShell item={item} label="Thinking" tone="muted">
      <div className="mt-2 border-zinc-800 border-l pl-3 text-zinc-300">
        {text && <StreamMarkdown text={text} />}
      </div>
    </StreamItemShell>
  )
}
