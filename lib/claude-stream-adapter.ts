import type {
  StreamItem,
  StreamItemAction,
  StreamItemData,
  StreamItemStatus,
  StreamItemType,
} from "@/lib/stream-items"
import {
  type ClaudeMessageContentBlock,
  type ClaudeSessionMessage,
  type ClaudeStreamEvent,
  type ClaudeStreamMessage,
  claudeBlockIndex,
  claudeDeltaText,
  claudeSessionId,
  toClaudeStreamEvent,
  unwrapClaudeRawMessage,
} from "@/lib/stream-parsing"

interface ClaudeContentEnvelope {
  content?: ClaudeMessageContentBlock[]
}

interface ClaudeControlRequest {
  input?: unknown
  subtype?: string
  tool_name?: string
}

export interface ClaudeStreamAdapterMessage
  extends ClaudeSessionMessage,
    ClaudeStreamMessage {
  content?: string
  cost_usd?: number
  duration_ms?: number
  is_error?: boolean
  message?: ClaudeContentEnvelope
  request?: ClaudeControlRequest
  request_id?: string
  result?: unknown
  text?: string
}

interface ClaudeBufferState {
  partialJson: string
  text: string
  thinking: string
}

export interface ClaudeStreamAdapterState {
  activeBlockIds: Record<number, string>
  blockBuffers: Record<string, ClaudeBufferState>
  blockTypes: Record<string, StreamItemType>
  nextSyntheticId: number
  turnIndex: number
  turnOpen: boolean
}

export interface ClaudeStreamAdapterOptions {
  agentId?: string
  now?: number
}

interface ItemContext {
  agentId?: string
  id: string
  itemId?: string
  sessionId?: string
  status: StreamItemStatus
  timestamp: number
  turnIndex?: number
  type: StreamItemType
}

interface ClaudeAdaptResult {
  actions: StreamItemAction[]
  state: ClaudeStreamAdapterState
}

const EMPTY_BUFFER: Readonly<ClaudeBufferState> = {
  partialJson: "",
  text: "",
  thinking: "",
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined
  }
  return value as Record<string, unknown>
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed || undefined
}

function isClaudeSystemInitMessage(
  message: ClaudeStreamAdapterMessage
): boolean {
  if (message.type === "system/init" || message.type === "init") {
    return true
  }
  return message.type === "system" && readString(message.subtype) === "init"
}

function buildPrefix(sessionId: string | undefined): string {
  return sessionId ? `claude:${sessionId}` : "claude"
}

function createSyntheticId(
  state: ClaudeStreamAdapterState,
  prefix: string
): string {
  const id = `${prefix}:${state.nextSyntheticId}`
  state.nextSyntheticId += 1
  return id
}

function cloneState(state: ClaudeStreamAdapterState): ClaudeStreamAdapterState {
  return {
    ...state,
    activeBlockIds: { ...state.activeBlockIds },
    blockBuffers: { ...state.blockBuffers },
    blockTypes: { ...state.blockTypes },
  }
}

function turnIdFromIndex(turnIndex: number | undefined): string | undefined {
  if (!turnIndex) {
    return undefined
  }
  return `claude-turn-${turnIndex}`
}

function createItem(context: ItemContext, data: StreamItemData): StreamItem {
  return {
    id: context.id,
    type: context.type,
    status: context.status,
    timestamp: context.timestamp,
    agentId: context.agentId,
    turnId: turnIdFromIndex(context.turnIndex),
    itemId: context.itemId ?? context.id,
    data: {
      ...data,
      sessionId: context.sessionId,
    },
  }
}

function streamItemTypeForBlock(blockType: string | undefined): StreamItemType {
  switch (blockType) {
    case "text":
      return "message"
    case "thinking":
      return "thinking"
    case "tool_use":
      return "tool_call"
    case "tool_result":
      return "tool_result"
    default:
      return "raw_item"
  }
}

function streamItemTypeForDelta(deltaType: string | undefined): StreamItemType {
  switch (deltaType) {
    case "thinking_delta":
      return "thinking"
    case "input_json_delta":
      return "tool_call"
    default:
      return "message"
  }
}

function startTurn(state: ClaudeStreamAdapterState): void {
  state.turnIndex += 1
  state.turnOpen = true
  state.activeBlockIds = {}
}

function ensureTurn(state: ClaudeStreamAdapterState): number {
  if (!state.turnOpen) {
    startTurn(state)
  }
  return state.turnIndex
}

function activeBlockIds(state: ClaudeStreamAdapterState): string[] {
  return Object.values(state.activeBlockIds)
}

function createRawItemAction(
  state: ClaudeStreamAdapterState,
  prefix: string,
  timestamp: number,
  message: unknown,
  options: ClaudeStreamAdapterOptions,
  sessionId: string | undefined
): StreamItemAction {
  const id = createSyntheticId(state, `${prefix}:raw`)
  return {
    type: "create",
    item: createItem(
      {
        id,
        type: "raw_item",
        status: "complete",
        timestamp,
        agentId: options.agentId,
        sessionId,
        turnIndex: state.turnOpen ? state.turnIndex : undefined,
      },
      { raw: message }
    ),
  }
}

function updateBufferForDelta(
  current: ClaudeBufferState,
  event: ClaudeStreamEvent
): ClaudeBufferState {
  const deltaType = readString(event.delta?.type)
  if (deltaType === "input_json_delta") {
    return {
      ...current,
      partialJson: `${current.partialJson}${event.delta?.partial_json ?? ""}`,
    }
  }

  if (deltaType === "thinking_delta") {
    return {
      ...current,
      thinking: `${current.thinking}${event.delta?.thinking ?? ""}`,
      text: `${current.text}${claudeDeltaText(event.delta)}`,
    }
  }

  return {
    ...current,
    text: `${current.text}${claudeDeltaText(event.delta)}`,
  }
}

function adaptStreamEvent(
  state: ClaudeStreamAdapterState,
  event: ClaudeStreamEvent,
  prefix: string,
  timestamp: number,
  options: ClaudeStreamAdapterOptions,
  sessionId: string | undefined
): StreamItemAction[] {
  const actions: StreamItemAction[] = []

  if (event.type === "message_start") {
    for (const id of activeBlockIds(state)) {
      actions.push({ type: "complete", id })
    }
    startTurn(state)
    return actions
  }

  if (event.type === "message_stop") {
    for (const id of activeBlockIds(state)) {
      actions.push({ type: "complete", id })
    }
    state.activeBlockIds = {}
    return actions
  }

  const turnIndex = ensureTurn(state)
  const blockIndex = claudeBlockIndex(event)

  if (event.type === "content_block_start") {
    if (typeof blockIndex !== "number") {
      actions.push(
        createRawItemAction(state, prefix, timestamp, event, options, sessionId)
      )
      return actions
    }

    const blockType = readString(event.content_block?.type)
    const streamType = streamItemTypeForBlock(blockType)
    const id = `${prefix}:turn:${turnIndex}:block:${blockIndex}`
    state.activeBlockIds[blockIndex] = id
    state.blockTypes[id] = streamType
    state.blockBuffers[id] = {
      ...EMPTY_BUFFER,
    }

    actions.push({
      type: "create",
      item: createItem(
        {
          id,
          type: streamType,
          status: "streaming",
          timestamp,
          agentId: options.agentId,
          sessionId,
          turnIndex,
        },
        {
          blockIndex,
          blockType,
          name: readString(event.content_block?.name),
          streamEventType: event.type,
        }
      ),
    })
    return actions
  }

  if (event.type === "content_block_delta") {
    if (typeof blockIndex !== "number") {
      actions.push(
        createRawItemAction(state, prefix, timestamp, event, options, sessionId)
      )
      return actions
    }

    const id =
      state.activeBlockIds[blockIndex] ??
      `${prefix}:turn:${turnIndex}:block:${blockIndex}`
    state.activeBlockIds[blockIndex] = id

    const existingBuffer = state.blockBuffers[id] ?? { ...EMPTY_BUFFER }
    const nextBuffer = updateBufferForDelta(existingBuffer, event)
    state.blockBuffers[id] = nextBuffer

    const deltaType = readString(event.delta?.type)
    const streamType = state.blockTypes[id] ?? streamItemTypeForDelta(deltaType)
    state.blockTypes[id] = streamType

    actions.push({
      type: "upsert",
      item: createItem(
        {
          id,
          type: streamType,
          status: "streaming",
          timestamp,
          agentId: options.agentId,
          sessionId,
          turnIndex,
        },
        {
          blockIndex,
          deltaType,
          partialJson: nextBuffer.partialJson,
          text: nextBuffer.text,
          thinking: nextBuffer.thinking,
          streamEventType: event.type,
        }
      ),
    })
    return actions
  }

  if (event.type === "content_block_stop") {
    if (typeof blockIndex !== "number") {
      actions.push(
        createRawItemAction(state, prefix, timestamp, event, options, sessionId)
      )
      return actions
    }
    const id = state.activeBlockIds[blockIndex]
    if (!id) {
      actions.push(
        createRawItemAction(state, prefix, timestamp, event, options, sessionId)
      )
      return actions
    }

    delete state.activeBlockIds[blockIndex]
    actions.push({ type: "complete", id })
    return actions
  }

  actions.push(
    createRawItemAction(state, prefix, timestamp, event, options, sessionId)
  )
  return actions
}

function adaptAssistantMessage(
  state: ClaudeStreamAdapterState,
  message: ClaudeStreamAdapterMessage,
  prefix: string,
  timestamp: number,
  options: ClaudeStreamAdapterOptions,
  sessionId: string | undefined
): StreamItemAction[] {
  const actions: StreamItemAction[] = []
  const content = message.message?.content
  if (!Array.isArray(content) || content.length === 0) {
    actions.push(
      createRawItemAction(state, prefix, timestamp, message, options, sessionId)
    )
    return actions
  }

  const turnIndex = ensureTurn(state)
  for (const [index, block] of content.entries()) {
    const blockType = readString(block.type)
    const streamType = streamItemTypeForBlock(blockType)
    const id =
      state.activeBlockIds[index] ??
      `${prefix}:turn:${turnIndex}:block:${index}`
    delete state.activeBlockIds[index]
    state.blockTypes[id] = streamType
    state.blockBuffers[id] = {
      ...EMPTY_BUFFER,
      partialJson:
        typeof block.input === "string"
          ? block.input
          : EMPTY_BUFFER.partialJson,
      text: typeof block.text === "string" ? block.text : EMPTY_BUFFER.text,
      thinking:
        blockType === "thinking" && typeof block.text === "string"
          ? block.text
          : EMPTY_BUFFER.thinking,
    }

    const data: StreamItemData = {
      blockIndex: index,
      blockType,
      content: block.content,
      input: block.input,
      name: block.name,
      text: block.text,
      raw: block,
    }

    actions.push({
      type: "upsert",
      item: createItem(
        {
          id,
          type: streamType,
          status: "complete",
          timestamp,
          agentId: options.agentId,
          sessionId,
          turnIndex,
        },
        data
      ),
    })
  }

  return actions
}

function adaptControlRequest(
  state: ClaudeStreamAdapterState,
  message: ClaudeStreamAdapterMessage,
  prefix: string,
  timestamp: number,
  options: ClaudeStreamAdapterOptions,
  sessionId: string | undefined
): StreamItemAction[] {
  const subtype = readString(message.request?.subtype)
  if (subtype === "init" || subtype === "initialize") {
    return []
  }
  if (subtype !== "can_use_tool") {
    return [
      createRawItemAction(
        state,
        prefix,
        timestamp,
        message,
        options,
        sessionId
      ),
    ]
  }

  const requestId = readString(message.request_id)
  const synthetic = createSyntheticId(state, `${prefix}:control`)
  const id = requestId ? `${prefix}:control:${requestId}` : synthetic
  return [
    {
      type: "create",
      item: createItem(
        {
          id,
          type: "approval_request",
          status: "streaming",
          timestamp,
          agentId: options.agentId,
          sessionId,
          turnIndex: state.turnOpen ? state.turnIndex : undefined,
        },
        {
          request: message.request,
          requestId,
          requestType: subtype,
          requiresInput: false,
          subtype,
          toolName: readString(message.request?.tool_name),
        }
      ),
    },
  ]
}

function adaptResult(
  state: ClaudeStreamAdapterState,
  message: ClaudeStreamAdapterMessage,
  prefix: string,
  timestamp: number,
  options: ClaudeStreamAdapterOptions,
  sessionId: string | undefined
): StreamItemAction[] {
  const actions: StreamItemAction[] = []
  for (const id of activeBlockIds(state)) {
    actions.push({ type: "complete", id })
  }
  const turnIndex = ensureTurn(state)
  const id = `${prefix}:turn:${turnIndex}:result`
  const isError = message.is_error === true
  state.turnOpen = false
  state.activeBlockIds = {}
  actions.push({
    type: "create",
    item: createItem(
      {
        id,
        type: "turn_complete",
        status: isError ? "error" : "complete",
        timestamp,
        agentId: options.agentId,
        sessionId,
        turnIndex,
      },
      {
        costUsd: message.cost_usd,
        durationMs: message.duration_ms,
        isError,
        result: message.result,
      }
    ),
  })
  return actions
}

function adaptStatus(
  state: ClaudeStreamAdapterState,
  message: ClaudeStreamAdapterMessage,
  prefix: string,
  timestamp: number,
  options: ClaudeStreamAdapterOptions,
  sessionId: string | undefined
): StreamItemAction[] {
  const id = createSyntheticId(state, `${prefix}:status`)
  const record = asRecord(message)
  return [
    {
      type: "create",
      item: createItem(
        {
          id,
          type: "status",
          status: "complete",
          timestamp,
          agentId: options.agentId,
          sessionId,
          turnIndex: state.turnOpen ? state.turnIndex : undefined,
        },
        {
          content: readString(record?.content),
          text: readString(record?.text),
        }
      ),
    },
  ]
}

export function createClaudeStreamAdapterState(): ClaudeStreamAdapterState {
  return {
    activeBlockIds: {},
    blockBuffers: {},
    blockTypes: {},
    nextSyntheticId: 1,
    turnIndex: 0,
    turnOpen: false,
  }
}

export function adaptClaudeStreamMessage(
  rawMessage: ClaudeStreamAdapterMessage,
  state: ClaudeStreamAdapterState,
  options: ClaudeStreamAdapterOptions = {}
): ClaudeAdaptResult {
  const nextState = cloneState(state)
  const message = unwrapClaudeRawMessage(
    rawMessage
  ) as ClaudeStreamAdapterMessage
  const timestamp = options.now ?? Date.now()
  const sessionId = claudeSessionId(message)
  const prefix = buildPrefix(sessionId)

  const streamEvent = toClaudeStreamEvent(message as ClaudeStreamMessage)
  if (streamEvent) {
    return {
      actions: adaptStreamEvent(
        nextState,
        streamEvent,
        prefix,
        timestamp,
        options,
        sessionId
      ),
      state: nextState,
    }
  }

  if (isClaudeSystemInitMessage(message)) {
    return {
      actions: [],
      state: nextState,
    }
  }

  if (message.type === "assistant" || message.type === "user") {
    return {
      actions: adaptAssistantMessage(
        nextState,
        message,
        prefix,
        timestamp,
        options,
        sessionId
      ),
      state: nextState,
    }
  }

  if (message.type === "control_request") {
    return {
      actions: adaptControlRequest(
        nextState,
        message,
        prefix,
        timestamp,
        options,
        sessionId
      ),
      state: nextState,
    }
  }

  if (message.type === "result") {
    return {
      actions: adaptResult(
        nextState,
        message,
        prefix,
        timestamp,
        options,
        sessionId
      ),
      state: nextState,
    }
  }

  if (message.type === "status") {
    return {
      actions: adaptStatus(
        nextState,
        message,
        prefix,
        timestamp,
        options,
        sessionId
      ),
      state: nextState,
    }
  }

  return {
    actions: [
      createRawItemAction(
        nextState,
        prefix,
        timestamp,
        message,
        options,
        sessionId
      ),
    ],
    state: nextState,
  }
}
