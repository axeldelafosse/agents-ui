import { getMarkdown } from "./data"
import { ItemShell } from "./item-shell"
import { Markdown } from "./markdown"
import type { StreamItem } from "./types"

interface ThinkingProps {
  item: StreamItem
}

export function Thinking({ item }: ThinkingProps) {
  const text = getMarkdown(item.data, [
    "text",
    "content",
    "thinking",
    "summary",
    "reasoning",
  ])

  return (
    <ItemShell item={item} label="Thinking" tone="muted">
      <div className="mt-2 border-zinc-800 border-l pl-3 text-zinc-300">
        {text && <Markdown text={text} />}
      </div>
    </ItemShell>
  )
}
