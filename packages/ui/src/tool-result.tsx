import { type ReactNode, useMemo } from "react"
import type { StreamItem } from "@axel-delafosse/protocol/stream-items"
import { readString, readValue, toPrettyJson } from "./data"
import { DiffView } from "./diff-view"
import { ItemShell } from "./item-shell"

const DIFF_PATTERN = /^(@@\s[+-]|diff\s|---\s[ab/]|\+\+\+\s[ab/])/m

/** Matches `cat -n` output: optional spaces, digits, then a tab (→) character. */
const LINE_NUMBER_PATTERN = /^\s*\d+\t/

function looksLikeDiff(text: string): boolean {
  return DIFF_PATTERN.test(text)
}

function looksLikeNumberedSource(text: string): boolean {
  const lines = text.split("\n", 4)
  if (lines.length < 2) return false
  return lines.every((l) => l.length === 0 || LINE_NUMBER_PATTERN.test(l))
}

function stripLineNumbers(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(LINE_NUMBER_PATTERN, ""))
    .join("\n")
}

function CodeBlock({ code, maxLines }: { code: string; maxLines?: number }) {
  const lines = code.split("\n")
  const truncated = maxLines && lines.length > maxLines
  const visible = truncated ? lines.slice(0, maxLines).join("\n") : code

  return (
    <div className="relative max-h-96 overflow-auto rounded-md border border-zinc-800 bg-zinc-950">
      <pre className="p-3 font-mono text-xs leading-relaxed text-zinc-200">
        {visible}
        {truncated && (
          <span className="text-zinc-500">
            {`\n… ${lines.length - maxLines!} more lines`}
          </span>
        )}
      </pre>
    </div>
  )
}

export function ToolResult({ item }: { item: StreamItem }) {
  const errorText =
    readString(item.data, "error", "errorMessage", "stderr") ??
    (item.status === "error" ? "Tool execution failed." : undefined)
  const result = readValue(item.data, "result", "output", "content", "data")
  const hasStringResult = typeof result === "string" && result.trim().length > 0
  const resultText = hasStringResult
    ? (result as string)
    : toPrettyJson(result ?? {})

  const isDiff = looksLikeDiff(resultText)
  const isNumberedSource = !isDiff && looksLikeNumberedSource(resultText)

  const cleanCode = useMemo(
    () => (isNumberedSource ? stripLineNumbers(resultText) : null),
    [isNumberedSource, resultText]
  )

  let resultContent: ReactNode
  if (isDiff) {
    resultContent = <DiffView patch={resultText} />
  } else if (isNumberedSource && cleanCode) {
    resultContent = <CodeBlock code={cleanCode} />
  } else {
    resultContent = (
      <details
        className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3"
        open
      >
        <summary className="cursor-pointer font-medium text-zinc-200">
          Output
        </summary>
        <pre className="mt-2 overflow-x-auto rounded bg-zinc-950 p-2 font-mono text-xs text-zinc-200">
          {resultText}
        </pre>
      </details>
    )
  }

  return (
    <ItemShell item={item} label="Tool Result">
      {errorText && (
        <p className="rounded-md border border-red-700/50 bg-red-950/40 px-3 py-2 text-red-200">
          {errorText}
        </p>
      )}

      {resultContent}
    </ItemShell>
  )
}
