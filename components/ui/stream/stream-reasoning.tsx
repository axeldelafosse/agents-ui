import {
  getMarkdown,
  getValue,
  isStreaming,
  toDisplayText,
} from "./stream-data"
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
  const rawReasoning = getValue(item.data, [
    "raw",
    "rawReasoning",
    "chainOfThought",
    "trace",
    "details",
  ])
  const streaming = isStreaming(item)

  return (
    <details className="group my-1" open={streaming}>
      <summary className="flex cursor-pointer items-center gap-2 py-1 text-xs text-zinc-500 hover:text-zinc-300">
        <span className="transition-transform group-open:rotate-90">
          &#9654;
        </span>
        <span>Reasoning</span>
        {streaming && (
          <span className="size-1.5 animate-pulse rounded-full bg-blue-400" />
        )}
      </summary>
      <div className="ml-4 border-zinc-800 border-l pl-3 text-sm text-zinc-400">
        {summary ? (
          <StreamMarkdown text={summary} />
        ) : (
          <p className="italic">
            {streaming ? "Reasoning in progress..." : "No reasoning summary."}
          </p>
        )}
        {rawReasoning !== undefined && (
          <details className="mt-2" open={false}>
            <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
              Raw reasoning
            </summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/80 p-2 font-mono text-xs text-zinc-400">
              {toDisplayText(rawReasoning)}
            </pre>
          </details>
        )}
      </div>
    </details>
  )
}
