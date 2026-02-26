import { getMarkdown, getNumber } from "./stream-data"
import type { StreamItem } from "./stream-types"

interface StreamTurnCompleteProps {
  item: StreamItem
}

const formatDuration = (durationMs: number): string => {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`
  }

  return `${(durationMs / 1000).toFixed(2)} s`
}

export function StreamTurnComplete({ item }: StreamTurnCompleteProps) {
  const summary = getMarkdown(item.data, [
    "summary",
    "message",
    "text",
    "result",
  ])
  const durationMs = getNumber(item.data, [
    "durationMs",
    "elapsedMs",
    "duration",
    "latency",
  ])
  const cost = getNumber(item.data, ["cost", "costUsd", "usdCost", "totalCost"])

  const metaParts: string[] = []
  if (summary) {
    metaParts.push(summary)
  }
  if (durationMs !== undefined) {
    metaParts.push(formatDuration(durationMs))
  }
  if (cost !== undefined) {
    metaParts.push(`$${cost.toFixed(4)}`)
  }

  return (
    <div className="relative flex items-center gap-3 py-2">
      <span className="h-px grow bg-emerald-900/50" />
      <span className="flex items-center gap-2 text-emerald-600 text-xs">
        <span>Task complete</span>
        {metaParts.length > 0 && (
          <span className="text-zinc-600">{metaParts.join(" \u00b7 ")}</span>
        )}
      </span>
      <span className="h-px grow bg-emerald-900/50" />
    </div>
  )
}
