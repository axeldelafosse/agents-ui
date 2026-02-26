import { getMarkdown, isStreaming } from "./stream-data"
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
      <details className="group" open={isStreaming(item)}>
        <summary className="cursor-pointer text-zinc-300 hover:text-zinc-100">
          Model reasoning
        </summary>
        <div className="mt-2 border-zinc-800 border-l pl-3 text-zinc-300 italic">
          {text ? (
            <StreamMarkdown className="italic" text={text} />
          ) : (
            <p className="text-zinc-400">No thinking details yet.</p>
          )}
        </div>
      </details>
    </StreamItemShell>
  )
}
