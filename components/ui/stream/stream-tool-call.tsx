import type { StreamItem } from "@/lib/stream-items"
import {
  readString,
  readValue,
  StreamItemShell,
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
  const callId = readString(item.data, "callId", "id", "itemId")
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

  return (
    <StreamItemShell item={item} label="Tool Call">
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-zinc-400">Tool</dt>
          <dd className="font-mono text-zinc-100">{toolName}</dd>
        </div>
        {callId ? (
          <div>
            <dt className="text-xs text-zinc-400">Call ID</dt>
            <dd className="font-mono text-zinc-200">{callId}</dd>
          </div>
        ) : null}
      </dl>
      <details
        className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3"
        open={item.status === "streaming"}
      >
        <summary className="cursor-pointer font-medium text-zinc-200">
          Arguments
        </summary>
        <pre className="mt-2 overflow-x-auto rounded bg-zinc-950 p-2 font-mono text-xs text-zinc-200">
          {toPrettyJson(input ?? {})}
        </pre>
      </details>
    </StreamItemShell>
  )
}
