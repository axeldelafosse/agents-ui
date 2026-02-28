"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@axel-delafosse/ui/utils"
import type { CompactToolPair } from "./compact-stream-items"
import { getString } from "./data"
import { extractToolArgs, TOOL_ARG_KEYS } from "./exploring-line-summary"
import { Shimmer } from "./shimmer"
import { ToolCall } from "./tool-call"
import { ToolResult } from "./tool-result"
import { truncateMiddle } from "./truncate-output"

interface StreamToolPairProps {
  pair: CompactToolPair
}

// ---------------------------------------------------------------------------
// Argument extraction constants
// ---------------------------------------------------------------------------

const MAX_ARG_LENGTH = 60

const FALLBACK_ARG_KEYS = [
  "file_path",
  "path",
  "command",
  "cmd",
  "input",
] as const

const truncateArg = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}\u2026` : text

// ---------------------------------------------------------------------------
// Tool name extraction
// ---------------------------------------------------------------------------

function extractToolLabel(pair: CompactToolPair): string {
  const name = getString(pair.call.data, [
    "toolName",
    "tool_name",
    "tool",
    "name",
    "function",
  ])
  return name ?? "Tool"
}

// ---------------------------------------------------------------------------
// Primary argument extraction
// ---------------------------------------------------------------------------

function extractPrimaryArg(pair: CompactToolPair): string | undefined {
  const toolName = extractToolLabel(pair)
  const args = extractToolArgs(pair.call.data)
  if (!args) {
    return undefined
  }

  const specificKeys = TOOL_ARG_KEYS[toolName.toLowerCase()]
  if (specificKeys) {
    for (const key of specificKeys) {
      const value = args[key]
      if (typeof value === "string" && value.length > 0) {
        return truncateArg(value, MAX_ARG_LENGTH)
      }
    }
  }

  for (const key of FALLBACK_ARG_KEYS) {
    const value = args[key]
    if (typeof value === "string" && value.length > 0) {
      return truncateArg(value, MAX_ARG_LENGTH)
    }
  }

  for (const value of Object.values(args)) {
    if (typeof value === "string" && value.length > 0) {
      return truncateArg(value, MAX_ARG_LENGTH)
    }
  }

  return undefined
}

// ---------------------------------------------------------------------------
// Output preview extraction (middle-out truncation)
// ---------------------------------------------------------------------------

const OUTPUT_KEYS: readonly string[] = [
  "output",
  "result",
  "stdout",
  "content",
  "text",
]

/** Max visible output lines for collapsed tool preview. */
const COLLAPSED_PREVIEW_MAX_LINES = 3

/** Max visible output lines for expanded shell tool preview. */
const EXPANDED_SHELL_MAX_LINES = 50

/** Max visible output lines for expanded non-shell tool preview. */
const EXPANDED_DEFAULT_MAX_LINES = 20

/** Max characters per line in preview to prevent overflow. */
const PREVIEW_MAX_CHARS = 200

const SHELL_TOOLS = new Set(["bash", "shell", "terminal", "command", "exec"])

function capLineLength(line: string): string {
  return line.length > PREVIEW_MAX_CHARS
    ? `${line.slice(0, PREVIEW_MAX_CHARS)}\u2026`
    : line
}

function extractOutputPreview(
  pair: CompactToolPair,
  maxLines: number
): { head: string[]; tail: string[]; omitted: number } | undefined {
  if (!pair.result) {
    return undefined
  }

  const output = getString(pair.result.data, OUTPUT_KEYS)
  if (!output) {
    return undefined
  }

  const lines = output.split("\n")
  if (lines.length === 0) {
    return undefined
  }

  const truncated = truncateMiddle(lines, maxLines)
  return {
    head: truncated.head.map(capLineLength),
    tail: truncated.tail.map(capLineLength),
    omitted: truncated.omitted,
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StreamToolPair({ pair }: StreamToolPairProps) {
  const isStreaming = pair.status === "streaming"
  const isError = pair.status === "error"
  const [expanded, setExpanded] = useState(isStreaming)
  const [showAll, setShowAll] = useState(false)
  const prevStreamingRef = useRef(isStreaming)

  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      setExpanded(false)
      setShowAll(false)
    } else if (!prevStreamingRef.current && isStreaming) {
      setExpanded(true)
      setShowAll(false)
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming])

  const isOpen = expanded

  const label = extractToolLabel(pair)
  const hasResult = pair.result !== null
  const primaryArg = extractPrimaryArg(pair)
  const verb = isStreaming ? "Running" : isError ? "Failed" : "Ran"
  const isShell = SHELL_TOOLS.has(label.toLowerCase())

  const collapsedPreview = !isOpen && hasResult
    ? extractOutputPreview(pair, COLLAPSED_PREVIEW_MAX_LINES)
    : undefined

  const expandedMaxLines = isShell
    ? EXPANDED_SHELL_MAX_LINES
    : EXPANDED_DEFAULT_MAX_LINES
  const expandedPreview =
    isOpen && hasResult && !showAll
      ? extractOutputPreview(pair, expandedMaxLines)
      : undefined

  return (
    <article
      aria-label={`${label} tool call`}
      className={cn(
        "relative overflow-hidden rounded-lg border shadow-sm",
        isError
          ? "border-red-900/70 bg-red-950/10"
          : "border-zinc-800 bg-zinc-950/70",
        isStreaming && "ring-1 ring-blue-500/35"
      )}
      data-status={pair.status}
    >
      {isStreaming ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px animate-pulse bg-gradient-to-r from-transparent via-blue-400 to-transparent"
        />
      ) : null}

      <details
        onToggle={(e) =>
          setExpanded((e.currentTarget as HTMLDetailsElement).open)
        }
        open={isOpen}
      >
        <summary
          className={cn(
            "flex cursor-pointer items-center gap-2 px-3 py-2",
            "select-none list-none [&::-webkit-details-marker]:hidden"
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              isStreaming && "animate-pulse bg-blue-400",
              isError && "bg-red-400",
              !isStreaming && !isError && hasResult && "bg-emerald-500",
              !isStreaming && !isError && !hasResult && "bg-zinc-500"
            )}
          />

          <span className="min-w-0 flex-1 truncate font-medium text-sm text-zinc-100">
            {isStreaming ? (
              <Shimmer as="span" className="text-sm" duration={2}>
                {`${verb} ${label}${primaryArg ? ` ${primaryArg}` : ""}\u2026`}
              </Shimmer>
            ) : (
              <>
                <span className="text-zinc-400">{verb}</span>{" "}
                {label}
                {primaryArg ? (
                  <span className="ml-1 text-zinc-400">{primaryArg}</span>
                ) : null}
              </>
            )}
          </span>

          <svg
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 text-zinc-500 transition-transform",
              isOpen && "rotate-90"
            )}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <title>Toggle</title>
            <path
              d="M9 5l7 7-7 7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </summary>

        <div className="space-y-2 border-zinc-800/50 border-t px-3 pt-2 pb-2">
          <ToolCall item={pair.call} />
          {pair.result ? (
            showAll || !expandedPreview ? (
              <ToolResult item={pair.result} />
            ) : (
              <div>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-zinc-500">
                  {expandedPreview.head.join("\n")}
                  {expandedPreview.omitted > 0 ? (
                    <>
                      {expandedPreview.head.length > 0 ? "\n" : ""}
                      <span className="text-zinc-600">
                        {"\u2026"} +{expandedPreview.omitted} lines omitted
                      </span>
                      {expandedPreview.tail.length > 0 ? "\n" : ""}
                      {expandedPreview.tail.join("\n")}
                    </>
                  ) : null}
                </pre>
                {expandedPreview.omitted > 0 ? (
                  <button
                    className="mt-1 text-xs text-zinc-500 hover:text-zinc-300"
                    onClick={() => setShowAll(true)}
                    type="button"
                  >
                    Show all output
                  </button>
                ) : null}
              </div>
            )
          ) : null}
        </div>
      </details>

      {collapsedPreview ? (
        <div className="border-zinc-800/50 border-t px-3 pt-1 pb-2">
          <pre className="whitespace-pre-wrap font-mono text-xs text-zinc-500">
            <span className="text-zinc-600">{"\u2514"} </span>
            {collapsedPreview.head.join("\n")}
            {collapsedPreview.omitted > 0 ? (
              <>
                {collapsedPreview.head.length > 0 ? "\n    " : ""}
                <span className="text-zinc-600">
                  {"\u2026"} +{collapsedPreview.omitted} lines
                </span>
                {collapsedPreview.tail.length > 0 ? "\n    " : ""}
                {collapsedPreview.tail.join("\n")}
              </>
            ) : null}
          </pre>
        </div>
      ) : null}
    </article>
  )
}
