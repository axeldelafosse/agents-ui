import {
  asRecord,
  getBoolean,
  getMarkdown,
  getString,
  getValue,
} from "./data"
import { ItemShell } from "./item-shell"
import { Markdown } from "./markdown"
import type { StreamItem } from "./types"

const REVIEW_INACTIVE_PATTERN = /exit|off|disabled|ended/i

interface ReviewModeProps {
  item: StreamItem
}

const inferActiveState = (item: StreamItem): boolean => {
  const explicit = getBoolean(item.data, ["active", "enabled", "inReviewMode"])
  if (explicit !== undefined) {
    return explicit
  }

  const sourceItem = asRecord(getValue(item.data, ["item"]))
  const mode =
    getString(item.data, ["mode", "state", "status", "event", "title"]) ??
    getString(sourceItem, ["mode", "state", "status", "event", "type"])
  if (!mode) {
    return true
  }

  if (REVIEW_INACTIVE_PATTERN.test(mode)) {
    return false
  }

  return true
}

export function ReviewMode({ item }: ReviewModeProps) {
  const active = inferActiveState(item)
  const sourceItem = asRecord(getValue(item.data, ["item"]))
  const text =
    getMarkdown(item.data, ["message", "summary", "description", "text"]) ??
    getMarkdown(sourceItem, ["message", "summary", "description", "text"])

  return (
    <ItemShell
      item={item}
      label="Review Mode"
      tone={active ? "warning" : "muted"}
    >
      <p className="font-medium text-zinc-200">
        {active ? "Review mode enabled" : "Review mode disabled"}
      </p>
      {text && <Markdown className="mt-2" text={text} />}
    </ItemShell>
  )
}
