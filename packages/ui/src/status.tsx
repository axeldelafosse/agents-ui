import { asRecord, getMarkdown, getValue } from "./data"
import type { StreamItem } from "./types"

interface StatusProps {
  item: StreamItem
}

export function Status({ item }: StatusProps) {
  const sourceItem = asRecord(getValue(item.data, ["item"]))
  const message =
    getMarkdown(item.data, ["message", "text", "status", "description"]) ??
    getMarkdown(sourceItem, ["message", "text", "status", "description"]) ??
    getMarkdown(item.data, ["title"]) ??
    "Status update"

  return (
    <div className="flex items-center gap-2 py-1 text-xs text-zinc-500">
      <span className="size-1.5 rounded-full bg-zinc-600" />
      <span>{message}</span>
    </div>
  )
}
