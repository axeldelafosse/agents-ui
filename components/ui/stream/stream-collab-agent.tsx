import { asRecord, getMarkdown, getString, getValue } from "./stream-data"
import { StreamItemShell } from "./stream-item-shell"
import { StreamMarkdown } from "./stream-markdown"
import type { StreamItem } from "./stream-types"

interface StreamCollabAgentProps {
  item: StreamItem
}

export function StreamCollabAgent({ item }: StreamCollabAgentProps) {
  const sourceItem = asRecord(getValue(item.data, ["item"]))
  const agentName =
    getString(item.data, ["agent", "name", "agentName", "worker"]) ??
    getString(sourceItem, ["agent", "name", "agentName", "worker"]) ??
    "collab-agent"
  const state =
    getString(item.data, ["status", "state", "phase", "mode"]) ??
    getString(sourceItem, ["status", "state", "phase", "mode"]) ??
    "active"
  const note =
    getMarkdown(item.data, ["summary", "message", "description", "text"]) ??
    getMarkdown(sourceItem, ["summary", "message", "description", "text"])

  return (
    <StreamItemShell
      item={item}
      label="Collab Agent"
      meta={
        <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-300 normal-case">
          {state}
        </span>
      }
      tone="muted"
    >
      <p className="font-medium text-zinc-200">{agentName}</p>
      {note && <StreamMarkdown className="mt-2" text={note} />}
    </StreamItemShell>
  )
}
