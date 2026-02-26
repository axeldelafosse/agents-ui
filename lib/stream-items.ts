export const STREAM_ITEM_LIMIT = 1000 as const

export const STREAM_ITEM_TYPES = [
  "message",
  "thinking",
  "tool_call",
  "tool_result",
  "command_execution",
  "file_change",
  "mcp_tool_call",
  "web_search",
  "collab_agent",
  "image",
  "plan",
  "reasoning",
  "approval_request",
  "review_mode",
  "turn_complete",
  "error",
  "status",
  "raw_item",
] as const

export type StreamItemType = (typeof STREAM_ITEM_TYPES)[number]

export const STREAM_ITEM_STATUSES = ["streaming", "complete", "error"] as const

export type StreamItemStatus = (typeof STREAM_ITEM_STATUSES)[number]

export type StreamItemData = Record<string, unknown>

export interface StreamPlanStep {
  description: string
  id?: string
  status?: string
}

export interface StreamItem {
  agentId?: string
  data: StreamItemData
  id: string
  itemId?: string
  status: StreamItemStatus
  threadId?: string
  timestamp: number
  turnId?: string
  type: StreamItemType
}

export interface StreamItemPatch {
  agentId?: string
  data?: StreamItemData
  itemId?: string
  status?: StreamItemStatus
  threadId?: string
  timestamp?: number
  turnId?: string
  type?: StreamItemType
}

type StreamItemCompletionStatus = Extract<
  StreamItemStatus,
  "complete" | "error"
>

export type StreamItemAction =
  | {
      type: "create"
      item: StreamItem
    }
  | {
      type: "update"
      id: string
      patch: StreamItemPatch
    }
  | {
      type: "complete"
      id: string
      status?: StreamItemCompletionStatus
      patch?: Omit<StreamItemPatch, "status">
    }
  | {
      type: "upsert"
      item: StreamItem
    }
  | {
      type: "append_text"
      id: string
      text: string
    }

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) {
    return STREAM_ITEM_LIMIT
  }
  return Math.floor(limit)
}

function mergeItemData(
  current: StreamItemData,
  patch?: StreamItemData
): StreamItemData {
  if (!patch) {
    return current
  }
  return {
    ...current,
    ...patch,
  }
}

function mergeItem(current: StreamItem, patch: StreamItemPatch): StreamItem {
  return {
    ...current,
    ...patch,
    data: mergeItemData(current.data, patch.data),
  }
}

function capStreamItems(items: StreamItem[], limit: number): StreamItem[] {
  if (items.length <= limit) {
    return items
  }
  return items.slice(items.length - limit)
}

export function applyStreamItemAction(
  items: readonly StreamItem[],
  action: StreamItemAction,
  limit = STREAM_ITEM_LIMIT
): StreamItem[] {
  const normalizedLimit = normalizeLimit(limit)

  if (action.type === "create") {
    if (items.some((item) => item.id === action.item.id)) {
      return [...items]
    }
    return capStreamItems([...items, action.item], normalizedLimit)
  }

  if (action.type === "upsert") {
    const index = items.findIndex((item) => item.id === action.item.id)
    if (index === -1) {
      return capStreamItems([...items, action.item], normalizedLimit)
    }

    const next = [...items]
    next[index] = mergeItem(next[index], action.item)
    return next
  }

  if (action.type === "update") {
    const index = items.findIndex((item) => item.id === action.id)
    if (index === -1) {
      return [...items]
    }

    const next = [...items]
    next[index] = mergeItem(next[index], action.patch)
    return next
  }

  if (action.type === "append_text") {
    const index = items.findIndex((item) => item.id === action.id)
    if (index === -1) {
      return [...items]
    }
    const current = items[index]
    const currentText =
      typeof current.data.text === "string" ? current.data.text : ""
    const next = [...items]
    next[index] = {
      ...current,
      data: { ...current.data, text: `${currentText}${action.text}` },
    }
    return next
  }

  const index = items.findIndex((item) => item.id === action.id)
  if (index === -1) {
    return [...items]
  }

  const completionPatch: StreamItemPatch = {
    ...action.patch,
    status: action.status ?? "complete",
  }
  const next = [...items]
  next[index] = mergeItem(next[index], completionPatch)
  return next
}

export function applyStreamItemActions(
  items: readonly StreamItem[],
  actions: readonly StreamItemAction[],
  limit = STREAM_ITEM_LIMIT
): StreamItem[] {
  let nextItems = [...items]
  for (const action of actions) {
    nextItems = applyStreamItemAction(nextItems, action, limit)
  }
  return nextItems
}

export const applyStreamActions = applyStreamItemActions
