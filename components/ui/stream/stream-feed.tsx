"use client"

import { Fragment, useMemo } from "react"
import { DEBUG_MODE } from "@/app/features/agents/constants"
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

const MESSAGE_DEDUPE_WHITESPACE_REGEX = /\s+/g
const MESSAGE_DEDUPE_WINDOW_MS = 10_000

function readMessageRole(item: StreamItem): string | undefined {
  const role = item.data.role
  if (typeof role === "string") {
    return role
  }
  const messageRole = item.data.messageRole
  if (typeof messageRole === "string") {
    return messageRole
  }
  const authorRole = item.data.authorRole
  if (typeof authorRole === "string") {
    return authorRole
  }
  return undefined
}

function readMessageText(item: StreamItem): string | undefined {
  const text = item.data.text
  if (typeof text === "string") {
    return text
  }
  return undefined
}

function normalizeMessageText(text: string): string {
  return text.replace(MESSAGE_DEDUPE_WHITESPACE_REGEX, " ").trim()
}

function areEquivalentUserMessageDuplicates(
  previous: StreamItem,
  current: StreamItem
): boolean {
  if (previous.type !== "message" || current.type !== "message") {
    return false
  }
  if (
    readMessageRole(previous) !== "user" ||
    readMessageRole(current) !== "user"
  ) {
    return false
  }
  const previousText = readMessageText(previous)
  const currentText = readMessageText(current)
  if (!(previousText && currentText)) {
    return false
  }
  if (
    normalizeMessageText(previousText) !== normalizeMessageText(currentText)
  ) {
    return false
  }
  if (
    previous.threadId &&
    current.threadId &&
    previous.threadId !== current.threadId
  ) {
    return false
  }
  if (previous.turnId && current.turnId && previous.turnId !== current.turnId) {
    return false
  }
  const oneHasItemId = Boolean(previous.itemId) !== Boolean(current.itemId)
  const nearInTime =
    Math.abs(previous.timestamp - current.timestamp) <= MESSAGE_DEDUPE_WINDOW_MS
  return oneHasItemId && nearInTime
}

export function dedupeUserMessageMirrors(
  items: readonly StreamItem[]
): StreamItem[] {
  const deduped: StreamItem[] = []
  for (const item of items) {
    const previous = deduped.at(-1)
    if (!(previous && areEquivalentUserMessageDuplicates(previous, item))) {
      deduped.push(item)
      continue
    }
    const shouldReplacePrevious =
      previous.status !== "complete" && item.status === "complete"
    if (shouldReplacePrevious) {
      deduped[deduped.length - 1] = item
    }
  }
  return deduped
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
      return DEBUG_MODE ? <StreamRawItem item={item} /> : null
    default:
      return DEBUG_MODE ? <StreamRawItem item={item} /> : null
  }
}

export function StreamFeed({
  items,
  className,
  onApprove,
  onDeny,
  onSubmitInput,
}: StreamFeedProps) {
  const visibleItems = useMemo(() => dedupeUserMessageMirrors(items), [items])

  if (visibleItems.length === 0) {
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
      className={cn("space-y-3 pl-1", className)}
      role="log"
    >
      {visibleItems.map((item, index) => {
        // const previous = index > 0 ? visibleItems[index - 1] : undefined
        const itemKey = item.id || `${item.type}-${index}`
        return (
          <Fragment key={itemKey}>
            {/* {shouldRenderTurnBoundary(previous, item) ? (
              <li aria-hidden className="list-none">
                <div className="relative flex items-center justify-center py-1.5">
                  <span className="h-px w-full bg-zinc-800" />
                  <span className="absolute rounded bg-zinc-950 px-2 font-mono text-[10px] text-zinc-500 uppercase tracking-wide">
                    {item.turnId}
                  </span>
                </div>
              </li>
            ) : null} */}
            <li className="marker:text-zinc-600">
              {renderStreamItem({ item, onApprove, onDeny, onSubmitInput })}
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}
