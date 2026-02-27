import type { StreamItem } from "@axel-delafosse/protocol/stream-items"
import { readString } from "./data"
import { ItemShell } from "./item-shell"

export function TurnDiff({ item }: { item: StreamItem }) {
  const diff = readString(item.data, "diff", "delta", "patch")
  const label = readString(item.data, "label", "title") ?? "Turn Diff"

  return (
    <ItemShell item={item} label={label}>
      {diff ? (
        <details
          className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3"
          open
        >
          <summary className="cursor-pointer font-medium text-zinc-200">
            Unified diff
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-zinc-950 p-2 font-mono text-xs text-zinc-200">
            {diff}
          </pre>
        </details>
      ) : (
        <p className="text-zinc-400 italic">Waiting for diff content.</p>
      )}
    </ItemShell>
  )
}
