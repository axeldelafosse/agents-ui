import type { StreamItem } from "@axel-delafosse/protocol/stream-items"
import { readString } from "./data"
import { DiffView } from "./diff-view"
import { ItemShell } from "./item-shell"

export function TurnDiff({ item }: { item: StreamItem }) {
  const diff = readString(item.data, "diff", "delta", "patch")
  const label = readString(item.data, "label", "title") ?? "Turn Diff"

  return (
    <ItemShell item={item} label={label}>
      {diff ? (
        <DiffView patch={diff} />
      ) : (
        <p className="text-zinc-400 italic">Waiting for diff content.</p>
      )}
    </ItemShell>
  )
}
