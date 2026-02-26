import type { StreamItem } from "@/lib/stream-items"
import {
  readString,
  readStringArray,
  readValue,
  StreamItemShell,
  toPrettyJson,
} from "./stream-item-shell"

export function StreamWebSearch({ item }: { item: StreamItem }) {
  const sourceItem = readValue(item.data, "item")
  const action =
    readValue(item.data, "action") ?? readValue(sourceItem, "action")
  const actionType =
    readString(action, "type") ??
    readString(item.data, "actionType", "status") ??
    readString(sourceItem, "status", "type")
  const query =
    readString(item.data, "query", "text") ??
    readString(action, "query", "text") ??
    readString(sourceItem, "query", "text")
  const queries = Array.from(
    new Set([
      ...readStringArray(action, "queries"),
      ...readStringArray(sourceItem, "queries", "searches"),
    ])
  )

  return (
    <StreamItemShell item={item} label="Web Search">
      <div className="space-y-2">
        <p className="text-zinc-300">
          Query:{" "}
          <span className="font-mono text-zinc-100">
            {query ?? "(not provided)"}
          </span>
        </p>
        {actionType ? (
          <p className="text-zinc-300">
            Action:{" "}
            <span className="font-mono text-zinc-100">{actionType}</span>
          </p>
        ) : null}
      </div>

      {queries.length > 0 ? (
        <ul aria-label="Search queries" className="space-y-1">
          {queries.map((entry) => (
            <li
              className="rounded bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-200"
              key={entry}
            >
              {entry}
            </li>
          ))}
        </ul>
      ) : null}

      <details className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
        <summary className="cursor-pointer font-medium text-zinc-200">
          Action payload
        </summary>
        <pre className="mt-2 overflow-x-auto rounded bg-zinc-950 p-2 font-mono text-xs text-zinc-200">
          {toPrettyJson(action ?? item.data)}
        </pre>
      </details>
    </StreamItemShell>
  )
}
