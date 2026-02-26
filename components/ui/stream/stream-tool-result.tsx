import type { StreamItem } from "@/lib/stream-items"
import { readString, readValue, toPrettyJson } from "./stream-data"
import { StreamItemShell } from "./stream-item-shell"

export function StreamToolResult({ item }: { item: StreamItem }) {
  const errorText =
    readString(item.data, "error", "errorMessage", "stderr") ??
    (item.status === "error" ? "Tool execution failed." : undefined)
  const result = readValue(item.data, "result", "output", "content", "data")
  const hasStringResult = typeof result === "string" && result.trim().length > 0

  return (
    <StreamItemShell item={item} label="Tool Result">
      {errorText ? (
        <p className="rounded-md border border-red-700/50 bg-red-950/40 px-3 py-2 text-red-200">
          {errorText}
        </p>
      ) : (
        <p className="text-zinc-300">Tool execution completed.</p>
      )}

      <details
        className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3"
        open
      >
        <summary className="cursor-pointer font-medium text-zinc-200">
          Output
        </summary>
        <pre className="mt-2 overflow-x-auto rounded bg-zinc-950 p-2 font-mono text-xs text-zinc-200">
          {hasStringResult ? (result as string) : toPrettyJson(result ?? {})}
        </pre>
      </details>
    </StreamItemShell>
  )
}
