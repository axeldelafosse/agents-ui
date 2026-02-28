import type { StreamItem } from "@axel-delafosse/protocol/stream-items"
import {
  asRecord,
  readString,
  readValue,
  toInlineText,
  toPrettyJson,
} from "./data"
import { DiffView } from "./diff-view"
import { ItemShell } from "./item-shell"

function parsePartialJson(input: string): unknown {
  try {
    return JSON.parse(input)
  } catch {
    return input
  }
}

function buildEditDiff(
  filePath: string,
  oldStr: string,
  newStr: string
): string {
  const oldLines = oldStr.split("\n")
  const newLines = newStr.split("\n")
  const hunk = [
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ...oldLines.map((l) => `-${l}`),
    ...newLines.map((l) => `+${l}`),
  ].join("\n")
  return `--- a/${filePath}\n+++ b/${filePath}\n${hunk}`
}

function resolveInput(item: StreamItem) {
  const partialJson = readString(item.data, "partialJson", "partial_json")
  const directInput = readValue(
    item.data,
    "arguments",
    "input",
    "args",
    "parameters",
    "payload"
  )
  return (
    directInput ??
    (partialJson && partialJson.trim().length > 0
      ? parsePartialJson(partialJson)
      : undefined)
  )
}

function EditToolCall({
  filePath,
  inputRecord,
  item,
  toolName,
}: {
  filePath: string
  inputRecord: Record<string, unknown>
  item: StreamItem
  toolName: string
}) {
  const oldStr = readString(inputRecord, "old_string", "oldString") ?? ""
  const newStr = readString(inputRecord, "new_string", "newString") ?? ""
  const shortPath = filePath.split("/").slice(-3).join("/")

  return (
    <ItemShell
      item={item}
      label={toolName}
      meta={
        <span className="truncate font-mono text-[11px] text-zinc-400">
          {shortPath}
        </span>
      }
    >
      <DiffView patch={buildEditDiff(filePath, oldStr, newStr)} />
    </ItemShell>
  )
}

export function ToolCall({ item }: { item: StreamItem }) {
  const toolName = readString(item.data, "toolName", "tool", "name") ?? "tool"
  const input = resolveInput(item)
  const inputRecord = asRecord(input)

  const isEdit =
    toolName.toLowerCase() === "edit" ||
    (inputRecord &&
      ("old_string" in inputRecord || "oldString" in inputRecord) &&
      ("new_string" in inputRecord || "newString" in inputRecord))

  if (isEdit && inputRecord) {
    const filePath =
      readString(inputRecord, "file_path", "filePath", "path") ?? "file"
    return (
      <EditToolCall
        filePath={filePath}
        inputRecord={inputRecord as Record<string, unknown>}
        item={item}
        toolName={toolName}
      />
    )
  }

  const summary =
    readString(inputRecord, "description") ??
    toInlineText(inputRecord ? Object.values(inputRecord)[0] : input)

  return (
    <ItemShell item={item} label={toolName}>
      <details
        className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3"
      >
        <summary className="cursor-pointer font-medium text-zinc-200">
          {summary ?? "Tool input"}
        </summary>
        <pre className="mt-2 overflow-x-auto rounded bg-zinc-950 p-2 font-mono text-xs text-zinc-200">
          {toPrettyJson(input ?? {})}
        </pre>
      </details>
    </ItemShell>
  )
}
