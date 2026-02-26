import { getString, getValue, toDisplayText } from "./stream-data"
import type { StreamItem } from "./stream-types"

interface StreamRawItemProps {
  item: StreamItem
}

export function StreamRawItem({ item }: StreamRawItemProps) {
  const eventName = getString(item.data, ["method", "event", "type", "name"])
  const payload =
    getValue(item.data, ["payload", "raw", "data", "item"]) ?? item.data

  return (
    <details className="group my-0.5">
      <summary className="flex cursor-pointer items-center gap-2 py-0.5 text-[11px] text-zinc-600 hover:text-zinc-400">
        <span className="transition-transform group-open:rotate-90">
          &#9654;
        </span>
        {eventName ? (
          <code className="font-mono">{eventName}</code>
        ) : (
          <span>Raw event</span>
        )}
      </summary>
      <pre className="mt-1 ml-4 max-h-48 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/80 p-2 font-mono text-xs text-zinc-400">
        {toDisplayText(payload)}
      </pre>
    </details>
  )
}
