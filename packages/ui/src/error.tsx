import {
  getMarkdown,
  getString,
  getValue,
  isStreaming,
  toDisplayText,
} from "./data"
import { ItemShell } from "./item-shell"
import { Markdown } from "./markdown"
import type { StreamItem } from "./types"

interface ErrorProps {
  item: StreamItem
}

export function Error({ item }: ErrorProps) {
  const message =
    getMarkdown(item.data, ["message", "text", "summary", "error"]) ??
    "An error occurred."
  const code = getString(item.data, ["code", "errorCode", "name"])
  const details = getValue(item.data, ["details", "raw", "cause", "stack"])

  return (
    <ItemShell
      item={item}
      label="Error"
      meta={
        code ? (
          <code className="rounded bg-red-950/40 px-1.5 py-0.5 font-mono text-[10px] text-red-200 normal-case">
            {code}
          </code>
        ) : undefined
      }
      tone="danger"
    >
      <Markdown text={message} />
      {details !== undefined && (
        <details className="mt-2" open={isStreaming(item)}>
          <summary className="cursor-pointer text-zinc-300 hover:text-zinc-100">
            Error details
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-red-900/50 bg-zinc-950/90 p-3 font-mono text-xs text-zinc-200">
            {toDisplayText(details)}
          </pre>
        </details>
      )}
    </ItemShell>
  )
}
