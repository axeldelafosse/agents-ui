"use client"

import { Fragment, useCallback } from "react"
import { cn } from "@/lib/utils"
import { StreamApprovalRequest } from "./stream-approval-request"
import { StreamCollabAgent } from "./stream-collab-agent"
import { StreamCommandExecution } from "./stream-command-execution"
import { StreamError } from "./stream-error"
import { StreamFileChange } from "./stream-file-change"
import { StreamImage } from "./stream-image"
import { StreamMcpToolCall } from "./stream-mcp-tool-call"
import { StreamMessage } from "./stream-message"
import { StreamPlan } from "./stream-plan"
import { StreamRawItem } from "./stream-raw-item"
import { StreamReasoning } from "./stream-reasoning"
import { StreamReviewMode } from "./stream-review-mode"
import { StreamStatus } from "./stream-status"
import { StreamThinking } from "./stream-thinking"
import { StreamToolCall } from "./stream-tool-call"
import { StreamToolResult } from "./stream-tool-result"
import { StreamTurnComplete } from "./stream-turn-complete"
import type { StreamApprovalCallbacks, StreamItem } from "./stream-types"
import { StreamWebSearch } from "./stream-web-search"

export interface StreamFeedProps extends StreamApprovalCallbacks {
  className?: string
  items: readonly StreamItem[]
}

interface StreamRendererProps extends StreamApprovalCallbacks {
  item: StreamItem
}

const renderStreamItem = ({
  item,
  onApprove,
  onDeny,
  onSubmitInput,
}: StreamRendererProps): React.ReactNode => {
  switch (item.type) {
    case "message":
      return <StreamMessage item={item} />
    case "thinking":
      return <StreamThinking item={item} />
    case "tool_call":
      return <StreamToolCall item={item} />
    case "tool_result":
      return <StreamToolResult item={item} />
    case "command_execution":
      return <StreamCommandExecution item={item} />
    case "file_change":
      return <StreamFileChange item={item} />
    case "mcp_tool_call":
      return <StreamMcpToolCall item={item} />
    case "web_search":
      return <StreamWebSearch item={item} />
    case "collab_agent":
      return <StreamCollabAgent item={item} />
    case "image":
      return <StreamImage item={item} />
    case "plan":
      return <StreamPlan item={item} />
    case "reasoning":
      return <StreamReasoning item={item} />
    case "approval_request":
      return (
        <StreamApprovalRequest
          item={item}
          onApprove={onApprove}
          onDeny={onDeny}
          onSubmitInput={onSubmitInput}
        />
      )
    case "review_mode":
      return <StreamReviewMode item={item} />
    case "turn_complete":
      return <StreamTurnComplete item={item} />
    case "error":
      return <StreamError item={item} />
    case "status":
      return <StreamStatus item={item} />
    case "raw_item":
      return <StreamRawItem item={item} />
    default:
      return <StreamRawItem item={item} />
  }
}

const shouldRenderTurnBoundary = (
  previous: StreamItem | undefined,
  current: StreamItem
): boolean => {
  if (!(previous?.turnId && current.turnId)) {
    return false
  }
  return previous.turnId !== current.turnId
}

export function StreamFeed({
  items,
  className,
  onApprove,
  onDeny,
  onSubmitInput,
}: StreamFeedProps) {
  const scrollToEnd = useCallback((node: HTMLLIElement | null) => {
    node?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    })
  }, [])

  if (items.length === 0) {
    return (
      <output className="block text-sm text-zinc-400">
        No stream items yet.
      </output>
    )
  }

  return (
    <ol
      aria-atomic={false}
      aria-label="Structured stream transcript"
      aria-live="polite"
      aria-relevant="additions text"
      className={cn("space-y-3 pl-5", className)}
      role="log"
    >
      {items.map((item, index) => {
        const previous = index > 0 ? items[index - 1] : undefined
        const itemKey = item.id || `${item.type}-${index}`
        return (
          <Fragment key={itemKey}>
            {shouldRenderTurnBoundary(previous, item) ? (
              <li aria-hidden className="list-none">
                <div className="relative flex items-center justify-center py-1.5">
                  <span className="h-px w-full bg-zinc-800" />
                  <span className="absolute rounded bg-zinc-950 px-2 font-mono text-[10px] text-zinc-500 uppercase tracking-wide">
                    {item.turnId}
                  </span>
                </div>
              </li>
            ) : null}
            <li className="marker:text-zinc-600">
              {renderStreamItem({ item, onApprove, onDeny, onSubmitInput })}
            </li>
          </Fragment>
        )
      })}
      <li
        aria-hidden
        className="list-none"
        key={`tail-${items.length}`}
        ref={scrollToEnd}
      />
    </ol>
  )
}
