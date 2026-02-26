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
    "Agent"
  // const state =
  //   getString(item.data, ["status", "state", "phase", "mode"]) ??
  //   getString(sourceItem, ["status", "state", "phase", "mode"]) ??
  //   "active"
  const prompt =
    getMarkdown(item.data, ["prompt", "instruction", "task"]) ??
    getMarkdown(sourceItem, ["prompt", "instruction", "task"])
  const note =
    getMarkdown(item.data, ["summary", "message", "description", "text"]) ??
    getMarkdown(sourceItem, ["summary", "message", "description", "text"])

  return (
    <StreamItemShell
      item={item}
      label={agentName}
      // meta={
      //   <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-300 normal-case">
      //     {state}
      //   </span>
      // }
      tone="muted"
    >
      {/* <p className="font-medium text-zinc-200">{agentName}</p> */}
      {prompt && <p className="font-medium text-zinc-200">{prompt}</p>}
      {note && <StreamMarkdown className="mt-2" text={note} />}
    </StreamItemShell>
  )
}
