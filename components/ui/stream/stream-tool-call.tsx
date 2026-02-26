import type { StreamItem } from "@/lib/stream-items"
import {
  asRecord,
  readString,
  readValue,
  StreamItemShell,
  toInlineText,
  toPrettyJson,
} from "./stream-item-shell"

function parsePartialJson(input: string): unknown {
  try {
    return JSON.parse(input)
  } catch {
    return input
  }
}

export function StreamToolCall({ item }: { item: StreamItem }) {
  const toolName = readString(item.data, "toolName", "tool", "name") ?? "tool"
  const partialJson = readString(item.data, "partialJson", "partial_json")
  const directInput = readValue(
    item.data,
    "arguments",
    "input",
    "args",
    "parameters",
    "payload"
  )
  const input =
    directInput ??
    (partialJson && partialJson.trim().length > 0
      ? parsePartialJson(partialJson)
      : undefined)
  const inputRecord = asRecord(input)
  const summary =
    readString(inputRecord, "description") ??
    toInlineText(inputRecord ? Object.values(inputRecord)[0] : input)

  return (
    <StreamItemShell item={item} label={toolName}>
      <details
        className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3"
        open={item.status === "streaming"}
      >
        <summary className="cursor-pointer font-medium text-zinc-200">
          {summary ?? "Tool input"}
        </summary>
        <pre className="mt-2 overflow-x-auto rounded bg-zinc-950 p-2 font-mono text-xs text-zinc-200">
          {toPrettyJson(input ?? {})}
        </pre>
      </details>
    </StreamItemShell>
  )
}
