"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@axel-delafosse/ui/utils"
import type { CompactExploringGroup } from "./compact-stream-items"
import { CommandExecution } from "./command-execution"
import {
  type ExploringSummaryLine,
  mergeSummaryLines,
  summarizeExploringItem,
} from "./exploring-line-summary"
import { Shimmer } from "./shimmer"
import { ToolCall } from "./tool-call"
import { ToolResult } from "./tool-result"
import type { StreamItem } from "./types"

interface StreamExploringGroupProps {
  group: CompactExploringGroup
}

function renderExploringChild(item: StreamItem): React.ReactNode {
  switch (item.type) {
    case "command_execution":
      return <CommandExecution item={item} />
    case "tool_call":
      return <ToolCall item={item} />
    case "tool_result":
      return <ToolResult item={item} />
    default:
      return null
  }
}

export function StreamExploringGroup({ group }: StreamExploringGroupProps) {
  const isStreaming = group.status === "streaming"
  const isError = group.status === "error"
  const [detailsOpen, setDetailsOpen] = useState(isStreaming)
  const prevStreamingRef = useRef(isStreaming)

  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      // Auto-collapse when streaming ends
      setDetailsOpen(false)
    } else if (!prevStreamingRef.current && isStreaming) {
      // Auto-open when streaming resumes (same React key, new streaming state)
      setDetailsOpen(true)
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming])

  const rawLines: ExploringSummaryLine[] = []
  for (const item of group.items) {
    const summary = summarizeExploringItem(item)
    if (summary) {
      rawLines.push(summary)
    }
  }

  const mergedLines = mergeSummaryLines(rawLines)

  const headerLabel = isStreaming ? "Exploring" : isError ? "Failed" : "Explored"

  return (
    <article
      aria-label={`${headerLabel} group`}
      className={cn(
        "relative overflow-hidden rounded-lg border shadow-sm",
        isError
          ? "border-red-900/70 bg-red-950/10"
          : "border-zinc-800 bg-zinc-950/70",
        isStreaming && "ring-1 ring-blue-500/35"
      )}
      data-status={group.status}
    >
      {isStreaming ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px animate-pulse bg-gradient-to-r from-transparent via-blue-400 to-transparent"
        />
      ) : null}

      {/* Header - always visible, not clickable */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            isStreaming && "animate-pulse bg-blue-400",
            isError && "bg-red-400",
            !(isStreaming || isError) && "bg-emerald-500"
          )}
        />

        {isStreaming ? (
          <Shimmer as="span" className="font-medium text-sm" duration={2}>
            {`${headerLabel}\u2026`}
          </Shimmer>
        ) : (
          <span className="font-medium text-sm text-zinc-100">
            {headerLabel}
          </span>
        )}
      </div>

      {/* Summary lines - always visible */}
      {mergedLines.length > 0 ? (
        <div className="space-y-px px-3 pb-2">
          {mergedLines.map((line, index) => (
            <div
              className="flex items-baseline gap-2 py-0.5 font-mono text-xs"
              key={`${line.label}-${index}`}
            >
              <span
                className={cn(
                  "w-20 shrink-0 text-right",
                  line.label === "Error" ? "text-red-400" : "text-cyan-400"
                )}
              >
                {line.label}
                {line.count > 3 ? ` (${line.count})` : ""}
              </span>
              <span className="min-w-0 truncate text-zinc-300">
                {line.details.join(", ")}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Detail toggle - separate, for full child items */}
      <details
        open={detailsOpen}
        onToggle={(e) =>
          setDetailsOpen((e.currentTarget as HTMLDetailsElement).open)
        }
      >
        <summary className="cursor-pointer select-none list-none px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 [&::-webkit-details-marker]:hidden">
          {detailsOpen ? "Hide details" : "Show details"}
        </summary>

        <div className="space-y-2 border-zinc-800/50 border-t px-3 pt-2 pb-2">
          {group.items.map((item) => (
            <div key={item.id}>{renderExploringChild(item)}</div>
          ))}
        </div>
      </details>
    </article>
  )
}
