import type {
  StreamItem,
  StreamItemStatus,
} from "@axel-delafosse/protocol/stream-items"
import { isExploringItem } from "./stream-compaction-classify"

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single ungrouped item. */
export interface CompactSingle {
  item: StreamItem
  kind: "single"
}

/** A group of contiguous exploring items. */
export interface CompactExploringGroup {
  /** Stable key for React rendering (first item's id). */
  groupId: string
  items: StreamItem[]
  kind: "exploring-group"
  status: StreamItemStatus
}

/** A paired tool_call + tool_result rendered as one unit. */
export interface CompactToolPair {
  call: StreamItem
  kind: "tool-pair"
  result: StreamItem | null
  status: StreamItemStatus
}

/** Consecutive assistant messages grouped into a coherent block. */
export interface CompactMessageBlock {
  items: StreamItem[]
  kind: "message-block"
  status: StreamItemStatus
}

/** Consecutive thinking/reasoning items grouped into a single block. */
export interface CompactThinkingBlock {
  items: StreamItem[]
  kind: "thinking-block"
  status: StreamItemStatus
}

export type CompactGroup =
  | CompactSingle
  | CompactExploringGroup
  | CompactToolPair
  | CompactMessageBlock
  | CompactThinkingBlock

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a scope key that prevents items from different agents, threads,
 * or turns from being grouped together.
 */
function scopeKey(item: StreamItem): string {
  const agent = item.agentId ?? ""
  const thread = item.threadId ?? ""
  const turn = item.turnId ?? ""
  // If no scope dimensions are present, use a shared key so contiguous
  // items of the same type can still group. Contiguity itself provides
  // the grouping boundary.
  if (!(agent || thread || turn)) {
    return "__unscoped__"
  }
  return `${agent}|${thread}|${turn}`
}

/**
 * Derives the aggregate status for a group of items:
 * - `streaming` if any child is streaming
 * - `error` if any child has error (and none streaming)
 * - `complete` otherwise
 */
function deriveGroupStatus(items: readonly StreamItem[]): StreamItemStatus {
  let hasError = false
  for (const item of items) {
    if (item.status === "streaming") {
      return "streaming"
    }
    if (item.status === "error") {
      hasError = true
    }
  }
  return hasError ? "error" : "complete"
}

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

function extractToolCallId(item: StreamItem): string | undefined {
  const { data } = item
  const id = data.callId ?? data.call_id ?? data.toolCallId ?? data.tool_use_id
  if (typeof id === "string") {
    return id
  }
  return undefined
}

/** Types that should be hidden from the feed by default. */
const NOISE_TYPES = new Set(["turn_complete", "raw_item"])

/** Status values that are noise when rendered individually. */
const NOISE_STATUS_MESSAGES = new Set([
  "idle",
  "running",
  "connected",
  "reconnecting",
])

function isNoiseItem(item: StreamItem): boolean {
  if (NOISE_TYPES.has(item.type)) {
    return true
  }
  if (item.type === "status") {
    const msg = item.data.message ?? item.data.status ?? item.data.text
    if (typeof msg === "string" && NOISE_STATUS_MESSAGES.has(msg.toLowerCase())) {
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Main compaction function
// ---------------------------------------------------------------------------

/**
 * Groups contiguous exploring items into `CompactExploringGroup` entries,
 * pairs tool_call/tool_result, merges consecutive assistant messages,
 * and filters noise items.
 *
 * Rules:
 * 1. Noise items (turn_complete, raw_item, low-signal status) are dropped.
 * 2. Only items passing `isExploringItem()` are grouped into exploring groups.
 * 3. Groups never cross `agentId`, `threadId`, or `turnId` boundaries.
 * 4. "Transparent" items (thinking, reasoning, assistant messages) between
 *    exploring items do not break group continuity — they are deferred and
 *    emitted as singles after the group. All other non-eligible items break
 *    the group and stay as `CompactSingle`.
 * 5. tool_result items matching a pending exploring callId are absorbed into
 *    the group, even across transparent items.
 * 6. Group status is derived from children statuses.
 * 7. Non-exploring tool_call items are paired with their tool_result.
 * 8. Consecutive assistant messages in the same scope form message blocks.
 */
export function compactStreamItems(
  items: readonly StreamItem[]
): CompactGroup[] {
  // Phase 1: Filter noise
  const filtered = items.filter((item) => !isNoiseItem(item))

  // Phase 2: Group exploring items
  const afterExploring = groupExploringItems(filtered)

  // Phase 3: Group thinking/reasoning blocks
  const afterThinking = groupThinkingBlocks(afterExploring)

  // Phase 4: Pair tool calls with results
  const afterPairing = pairToolCalls(afterThinking)

  // Phase 5: Group consecutive assistant messages
  return groupMessageBlocks(afterPairing)
}

/** Returns true for item types that are "transparent" to exploring group boundaries. */
function isTransparentItem(item: StreamItem): boolean {
  if (item.type === "thinking" || item.type === "reasoning") {
    return true
  }
  // Only assistant messages are transparent; user messages and unknown roles are NOT
  if (item.type === "message") {
    const role = readMessageRole(item)
    return role === "assistant"
  }
  return false
}

function groupExploringItems(items: readonly StreamItem[]): CompactGroup[] {
  const result: CompactGroup[] = []
  let pendingGroup: StreamItem[] | null = null
  let pendingScope: string | null = null
  let pendingCallIds: Set<string> = new Set()
  let deferredItems: CompactGroup[] = []

  const flushGroup = () => {
    if (pendingGroup && pendingGroup.length > 0) {
      if (pendingGroup.length === 1) {
        result.push({ kind: "single", item: pendingGroup[0] })
      } else {
        result.push({
          kind: "exploring-group",
          groupId: pendingGroup[0].id,
          items: pendingGroup,
          status: deriveGroupStatus(pendingGroup),
        })
      }
    }
    // Emit deferred transparent items after the group
    for (const deferred of deferredItems) {
      result.push(deferred)
    }
    pendingGroup = null
    pendingScope = null
    pendingCallIds = new Set()
    deferredItems = []
  }

  for (const item of items) {
    if (isExploringItem(item)) {
      const itemScope = scopeKey(item)

      // If we have a pending group and the scope matches, extend it
      if (pendingGroup && pendingScope === itemScope) {
        pendingGroup.push(item)
        // Track callId if this is a tool_call
        if (item.type === "tool_call") {
          const callId = extractToolCallId(item)
          if (callId) {
            pendingCallIds.add(callId)
          }
        }
        continue
      }

      // Scope mismatch or no pending group — flush and start new
      flushGroup()
      pendingGroup = [item]
      pendingScope = itemScope
      // Track callId if this is a tool_call
      if (item.type === "tool_call") {
        const callId = extractToolCallId(item)
        if (callId) {
          pendingCallIds.add(callId)
        }
      }
      continue
    }

    // Non-exploring item: check if it's a tool_result matching a pending call (Phase 1)
    // Scope-guard: only absorb if the result shares the same scope as the group
    if (
      pendingGroup &&
      pendingScope !== null &&
      item.type === "tool_result"
    ) {
      const callId = extractToolCallId(item)
      const itemScope = scopeKey(item)
      if (callId && pendingCallIds.has(callId) && itemScope === pendingScope) {
        // Absorb the matching tool_result into the exploring group
        pendingGroup.push(item)
        // Clear the matched callId to prevent duplicate absorption
        pendingCallIds.delete(callId)
        continue
      }
    }

    // Check if this item is transparent (Phase 2)
    // Scope-guard: only defer transparent items that share the group's scope
    // to prevent cross-scope items from silently bridging group boundaries
    if (pendingGroup && pendingScope !== null && isTransparentItem(item)) {
      const itemScope = scopeKey(item)
      if (itemScope === pendingScope) {
        deferredItems.push({ kind: "single", item })
        continue
      }
    }

    // Non-exploring, non-transparent item: flush and emit as single
    flushGroup()
    result.push({ kind: "single", item })
  }

  flushGroup()
  return result
}

function isThinkingOrReasoning(item: StreamItem): boolean {
  return item.type === "thinking" || item.type === "reasoning"
}

function groupThinkingBlocks(groups: readonly CompactGroup[]): CompactGroup[] {
  const result: CompactGroup[] = []
  let pendingItems: StreamItem[] | null = null
  let pendingScope: string | null = null

  const flushThinking = () => {
    if (pendingItems && pendingItems.length > 0) {
      if (pendingItems.length === 1) {
        result.push({ kind: "single", item: pendingItems[0] })
      } else {
        result.push({
          kind: "thinking-block",
          items: pendingItems,
          status: deriveGroupStatus(pendingItems),
        })
      }
    }
    pendingItems = null
    pendingScope = null
  }

  for (const group of groups) {
    // Only process single items that are thinking/reasoning
    if (group.kind !== "single" || !isThinkingOrReasoning(group.item)) {
      flushThinking()
      result.push(group)
      continue
    }

    const { item } = group
    const itemScope = scopeKey(item)

    if (pendingItems && pendingScope === itemScope) {
      pendingItems.push(item)
      continue
    }

    // Scope mismatch or no pending group — flush and start new
    flushThinking()
    pendingItems = [item]
    pendingScope = itemScope
  }

  flushThinking()
  return result
}

function pairToolCalls(groups: readonly CompactGroup[]): CompactGroup[] {
  const result: CompactGroup[] = []
  // Map of (scope|callId) -> index in result array (for pending tool_call singles)
  // Keyed by scope to prevent cross-scope pairing when callIds collide
  const pendingCalls = new Map<string, number>()

  for (const group of groups) {
    // Only attempt pairing on singles
    if (group.kind !== "single") {
      result.push(group)
      continue
    }

    const { item } = group

    if (item.type === "tool_call") {
      const callId = extractToolCallId(item)
      if (callId) {
        const pairKey = `${scopeKey(item)}|${callId}`
        const pairIndex = result.length
        result.push({
          kind: "tool-pair",
          call: item,
          result: null,
          status: item.status,
        })
        if (!pendingCalls.has(pairKey)) {
          pendingCalls.set(pairKey, pairIndex)
        }
      } else {
        result.push(group)
      }
      continue
    }

    if (item.type === "tool_result") {
      const callId = extractToolCallId(item)
      if (callId) {
        const pairKey = `${scopeKey(item)}|${callId}`
        if (pendingCalls.has(pairKey)) {
          const pairIndex = pendingCalls.get(pairKey)!
          const existing = result[pairIndex]
          if (existing.kind === "tool-pair") {
            existing.result = item
            existing.status = deriveGroupStatus([existing.call, item])
            pendingCalls.delete(pairKey)
            continue
          }
        }
      }
      // Orphan result or no matching call — keep as single
      result.push(group)
      continue
    }

    result.push(group)
  }

  return result
}

function groupMessageBlocks(groups: readonly CompactGroup[]): CompactGroup[] {
  const result: CompactGroup[] = []
  let pendingMessages: StreamItem[] | null = null
  let pendingScope: string | null = null

  const flushMessages = () => {
    if (pendingMessages && pendingMessages.length > 0) {
      if (pendingMessages.length === 1) {
        result.push({ kind: "single", item: pendingMessages[0] })
      } else {
        result.push({
          kind: "message-block",
          items: pendingMessages,
          status: deriveGroupStatus(pendingMessages),
        })
      }
    }
    pendingMessages = null
    pendingScope = null
  }

  for (const group of groups) {
    if (group.kind !== "single") {
      flushMessages()
      result.push(group)
      continue
    }

    const { item } = group

    // Only group assistant messages
    if (item.type !== "message" || readMessageRole(item) !== "assistant") {
      flushMessages()
      result.push(group)
      continue
    }

    const msgScope = scopeKey(item)

    if (pendingMessages && pendingScope === msgScope) {
      pendingMessages.push(item)
      continue
    }

    flushMessages()
    pendingMessages = [item]
    pendingScope = msgScope
  }

  flushMessages()
  return result
}
