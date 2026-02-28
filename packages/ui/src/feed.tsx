"use client"

import { useCallback, useMemo } from "react"
import { LegendList } from "@legendapp/list/react"
import { DEBUG_MODE } from "@axel-delafosse/agent-runtime"
import { cn } from "@axel-delafosse/ui/utils"
import { ApprovalRequest } from "./approval-request"
import { CollabAgent } from "./collab-agent"
import { CommandExecution } from "./command-execution"
import type { CompactGroup } from "./compact-stream-items"
import { compactStreamItems } from "./compact-stream-items"
import { AgentError } from "./error"
import { FileChange } from "./file-change"
import { AgentImage } from "./image"
import { McpToolCall } from "./mcp-tool-call"
import { Message } from "./message"
import { MessageBlock } from "./message-block"
import { Plan } from "./plan"
import { RawItem } from "./raw-item"
import { Reasoning, ReasoningBlock } from "./reasoning"
import { ReviewMode } from "./review-mode"
import { Status } from "./status"
import { StreamExploringGroup } from "./stream-exploring-group"
import { StreamToolPair } from "./stream-tool-pair"
import { Thinking, ThinkingBlock } from "./thinking"
import { ToolCall } from "./tool-call"
import { ToolResult } from "./tool-result"
import { TurnComplete } from "./turn-complete"
import { TurnDiff } from "./turn-diff"
import type { StreamApprovalCallbacks, StreamItem } from "./types"
import { useStreamPacing } from "./use-stream-pacing"
import { WebSearch } from "./web-search"

export interface FeedProps extends StreamApprovalCallbacks {
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
  onApproveForSession,
  onDeny,
  onSubmitInput,
}: StreamRendererProps): React.ReactNode => {
  switch (item.type) {
    case "message":
      return <Message item={item} />
    case "thinking":
      return <Thinking item={item} />
    case "tool_call":
      return <ToolCall item={item} />
    case "tool_result":
      return <ToolResult item={item} />
    case "command_execution":
      return <CommandExecution item={item} />
    case "file_change":
      return <FileChange item={item} />
    case "mcp_tool_call":
      return <McpToolCall item={item} />
    case "web_search":
      return <WebSearch item={item} />
    case "collab_agent":
      return <CollabAgent item={item} />
    case "image":
      return <AgentImage item={item} />
    case "plan":
      return <Plan item={item} />
    case "reasoning":
      return <Reasoning item={item} />
    case "approval_request":
      return (
        <ApprovalRequest
          item={item}
          onApprove={onApprove}
          onApproveForSession={onApproveForSession}
          onDeny={onDeny}
          onSubmitInput={onSubmitInput}
        />
      )
    case "review_mode":
      return <ReviewMode item={item} />
    case "turn_complete":
      return <TurnComplete item={item} />
    case "turn_diff":
      return <TurnDiff item={item} />
    case "error":
      return <AgentError item={item} />
    case "status":
      return <Status item={item} />
    case "raw_item":
      return DEBUG_MODE ? <RawItem item={item} /> : null
    default:
      return DEBUG_MODE ? <RawItem item={item} /> : null
  }
}

function compactGroupKey(group: CompactGroup, index: number): string {
  switch (group.kind) {
    case "single":
      return group.item.id || `single-${index}`
    case "exploring-group":
      return group.groupId
    case "tool-pair":
      return `pair-${group.call.id}`
    case "message-block":
      return `msg-block-${group.items[0]?.id ?? index}`
    case "thinking-block":
      return `thinking-block-${group.items[0]?.id ?? index}`
  }
}

export function Feed({
  items,
  className,
  onApprove,
  onApproveForSession,
  onDeny,
  onSubmitInput,
}: FeedProps) {
  const pacedItems = useStreamPacing(items)

  const compactedGroups = useMemo(() => {
    const deduped = dedupeUserMessageMirrors(pacedItems)
    return compactStreamItems(deduped)
  }, [pacedItems])

  const renderItem = useCallback(
    ({ item: group }: { item: CompactGroup }) => {
      let content: React.ReactNode

      switch (group.kind) {
        case "exploring-group":
          content = <StreamExploringGroup group={group} />
          break
        case "tool-pair":
          content = <StreamToolPair pair={group} />
          break
        case "message-block":
          content = <MessageBlock block={group} />
          break
        case "thinking-block": {
          // If all items are reasoning type, use ReasoningBlock;
          // otherwise use ThinkingBlock (superset with expand toggle)
          const allReasoning = group.items.every(
            (i) => i.type === "reasoning"
          )
          content = allReasoning ? (
            <ReasoningBlock block={group} />
          ) : (
            <ThinkingBlock block={group} />
          )
          break
        }
        case "single":
          content = renderStreamItem({
            item: group.item,
            onApprove,
            onApproveForSession,
            onDeny,
            onSubmitInput,
          })
          break
      }

      return (
        <div className="mb-3" role="listitem">
          {content}
        </div>
      )
    },
    [onApprove, onApproveForSession, onDeny, onSubmitInput]
  )

  return (
    <LegendList
      className={cn("pl-1", className)}
      data={compactedGroups}
      estimatedItemSize={80}
      keyExtractor={compactGroupKey}
      recycleItems={false}
      renderItem={renderItem}
      role="log"
      useWindowScroll
    />
  )
}
