"use client"

import { useState } from "react"
import {
  getArray,
  getNumber,
  getString,
  getValue,
  isStreaming,
  toDisplayText,
} from "./data"
import { truncateMiddle } from "./truncate-output"
import type { StreamItem } from "./types"

interface CommandExecutionProps {
  item: StreamItem
}

/** Max visible output lines for tool-originated commands. */
const TOOL_CALL_MAX_LINES = 5
/** Max visible output lines for user shell commands. */
const USER_SHELL_MAX_LINES = 50

export function CommandExecution({ item }: CommandExecutionProps) {
  const commandActions = getArray(item.data.item, ["commandActions"])
    .map((action) => getString(action, ["command"]))
    .filter((cmd): cmd is string => Boolean(cmd))
  const command =
    (commandActions.length > 0 && commandActions.join(" && ")) ||
    getString(item.data, ["command", "cmd", "input", "line"]) ||
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

  // Determine if this is a user shell command (higher truncation limit)
  const isUserShell = item.data.source === "user" || item.data.isUserShell === true
  const maxLines = isUserShell ? USER_SHELL_MAX_LINES : TOOL_CALL_MAX_LINES

  const lines = content.length > 0 ? content.split("\n") : []
  const needsTruncation = lines.length > maxLines
  const [expanded, setExpanded] = useState(false)

  const truncated = needsTruncation ? truncateMiddle(lines, maxLines) : null

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
      {lines.length > 0 && (
        <pre className="max-h-72 overflow-auto p-3 font-mono text-xs text-zinc-300">
          {needsTruncation && !expanded && truncated ? (
            <>
              {truncated.head.join("\n")}
              {truncated.head.length > 0 ? "\n" : ""}
              <span className="text-zinc-500">
                {"\u2026"} +{truncated.omitted} lines
              </span>
              {truncated.tail.length > 0 ? "\n" : ""}
              {truncated.tail.join("\n")}
            </>
          ) : (
            content
          )}
        </pre>
      )}
      {needsTruncation ? (
        <button
          className="w-full border-zinc-800 border-t px-3 py-1.5 text-left text-xs text-zinc-500 hover:text-zinc-300"
          onClick={() => setExpanded((prev) => !prev)}
          type="button"
        >
          {expanded ? "Collapse" : `Show all ${lines.length} lines`}
        </button>
      ) : null}
    </div>
  )
}
