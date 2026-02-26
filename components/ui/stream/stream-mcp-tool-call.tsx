import {
  getMarkdown,
  getString,
  getValue,
  isStreaming,
  toDisplayText,
} from "./stream-data"
import { StreamItemShell } from "./stream-item-shell"
import { StreamMarkdown } from "./stream-markdown"
import type { StreamItem } from "./stream-types"

interface StreamMcpToolCallProps {
  item: StreamItem
}

export function StreamMcpToolCall({ item }: StreamMcpToolCallProps) {
  const server =
    getString(item.data, ["server", "serverName", "host", "endpoint"]) ?? "mcp"
  const toolName =
    getString(item.data, ["name", "toolName", "tool", "id"]) ?? "unknown_tool"
  const progress = getMarkdown(item.data, ["progress", "message", "status"])
  const args = getValue(item.data, ["arguments", "args", "input"])
  const result = getValue(item.data, ["result", "output", "response"])

  return (
    <StreamItemShell
      item={item}
      label="MCP Tool"
      meta={
        <code className="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-200 normal-case">
          {server}:{toolName}
        </code>
      }
    >
      {progress ? (
        <StreamMarkdown text={progress} />
      ) : (
        <p className="text-xs text-zinc-300">
          {isStreaming(item) ? "Running MCP tool..." : "MCP tool completed."}
        </p>
      )}
      {args !== undefined && (
        <details className="mt-2" open={isStreaming(item)}>
          <summary className="cursor-pointer text-zinc-300 hover:text-zinc-100">
            Arguments
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/80 p-3 font-mono text-xs text-zinc-200">
            {toDisplayText(args)}
          </pre>
        </details>
      )}
      {result !== undefined && (
        <details className="mt-2" open={!isStreaming(item)}>
          <summary className="cursor-pointer text-zinc-300 hover:text-zinc-100">
            Result
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/80 p-3 font-mono text-xs text-zinc-200">
            {toDisplayText(result)}
          </pre>
        </details>
      )}
    </StreamItemShell>
  )
}
