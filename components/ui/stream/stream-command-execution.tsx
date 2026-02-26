import {
  getNumber,
  getString,
  getValue,
  isStreaming,
  toDisplayText,
} from "./stream-data"
import type { StreamItem } from "./stream-types"

interface StreamCommandExecutionProps {
  item: StreamItem
}

export function StreamCommandExecution({ item }: StreamCommandExecutionProps) {
  const command =
    getString(item.data, ["command", "cmd", "input", "line"]) ??
    "<unknown command>"
  const stdout = getString(item.data, ["stdout", "output", "result"])
  const stderr = getString(item.data, ["stderr", "errorOutput"])
  const fallbackOutput = getValue(item.data, ["output", "result", "payload"])
  const exitCode = getNumber(item.data, ["exitCode", "code", "statusCode"])
  const streaming = isStreaming(item)

  const outputText = [stdout, stderr]
    .filter((chunk): chunk is string => Boolean(chunk && chunk.length > 0))
    .join("\n")
  let content = outputText
  if (outputText.length === 0 && fallbackOutput !== undefined) {
    content = toDisplayText(fallbackOutput)
  }

  return (
    <div className="my-1 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950/80">
      <div className="flex items-center gap-2 border-zinc-800 border-b px-3 py-1.5">
        <span className="font-mono text-[11px] text-zinc-500">$</span>
        <code className="flex-1 truncate font-mono text-xs text-zinc-200">
          {command}
        </code>
        <div className="flex items-center gap-2 text-[11px]">
          {streaming && (
            <span className="flex items-center gap-1 text-blue-400">
              <span className="size-1.5 animate-pulse rounded-full bg-blue-400" />
              Running
            </span>
          )}
          {exitCode !== undefined && (
            <span
              className={exitCode === 0 ? "text-emerald-500" : "text-red-400"}
            >
              exit {exitCode}
            </span>
          )}
        </div>
      </div>
      {content.length > 0 && (
        <pre className="max-h-72 overflow-auto p-3 font-mono text-xs text-zinc-300">
          {content}
        </pre>
      )}
    </div>
  )
}
