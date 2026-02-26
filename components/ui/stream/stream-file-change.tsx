import type { StreamItem } from "@/lib/stream-items"
import {
  asRecord,
  readArray,
  readString,
  StreamItemShell,
  toPrettyJson,
} from "./stream-item-shell"

function describeChange(change: unknown, index: number): string {
  if (typeof change === "string" && change.trim().length > 0) {
    return change
  }
  const record = asRecord(change)
  if (!record) {
    return `change ${index + 1}`
  }
  const path =
    readString(record, "path", "file", "newPath", "oldPath", "target") ??
    `change ${index + 1}`
  const type = readString(record, "type", "status", "operation", "op")
  return type ? `${type}: ${path}` : path
}

export function StreamFileChange({ item }: { item: StreamItem }) {
  const changes = readArray(item.data, "changes") ?? []
  const status = readString(item.data, "status")
  const diff = readString(item.data, "diff", "delta", "patch")

  return (
    <StreamItemShell item={item} label="File Change">
      {status ? (
        <p className="text-xs text-zinc-400">Status: {status}</p>
      ) : null}

      {changes.length > 0 ? (
        <ul aria-label="Changed files" className="space-y-1">
          {changes.map((change, index) => (
            <li
              className="rounded bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-200"
              key={`${index}-${describeChange(change, index)}`}
            >
              {describeChange(change, index)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-zinc-400 italic">Waiting for file change details.</p>
      )}

      {diff ? (
        <details className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
          <summary className="cursor-pointer font-medium text-zinc-200">
            Patch output
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-zinc-950 p-2 font-mono text-xs text-zinc-200">
            {diff}
          </pre>
        </details>
      ) : null}

      <details className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
        <summary className="cursor-pointer font-medium text-zinc-200">
          Raw change payload
        </summary>
        <pre className="mt-2 overflow-x-auto rounded bg-zinc-950 p-2 font-mono text-xs text-zinc-200">
          {toPrettyJson(changes)}
        </pre>
      </details>
    </StreamItemShell>
  )
}
