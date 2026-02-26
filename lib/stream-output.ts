import {
  appendPrettyMessageBoundary,
  type ClaudeMessageContentBlock,
  type ClaudeStreamEvent,
  claudeBlockIndex,
  claudeCompletedText,
  claudeDeltaText,
  normalizeStreamText,
  toClaudeStreamEvent,
} from "@/lib/stream-parsing"

interface ClaudeMessagePayload {
  content?: ClaudeMessageContentBlock[]
}

export interface ClaudeOutputMessage {
  event?: ClaudeStreamEvent
  message?: ClaudeMessagePayload
  type?: string
}

export interface ClaudeOutputState {
  activeBlockIndex?: number
  pendingBreak: boolean
  streamedDelta: boolean
  turnStartIndex?: number
}

export interface CodexOutputEvent {
  method?: string
  sourceMethod?: string
  text?: string
  threadId?: string
}

export interface CodexOutputState {
  activeThreadId?: string
  lastAssistantDeltaText?: string
  lastCompletedMessageText?: string
  openAssistantMessage: boolean
  primaryThreadId?: string
}

interface ReduceOptions {
  prettyMode: boolean
}

const DEFAULT_REDUCE_OPTIONS: Readonly<ReduceOptions> = {
  prettyMode: true,
}

export function createClaudeOutputState(): ClaudeOutputState {
  return {
    pendingBreak: false,
    streamedDelta: false,
  }
}

export function createCodexOutputState(): CodexOutputState {
  return {
    openAssistantMessage: false,
  }
}

function appendClaudeText(
  output: string,
  state: ClaudeOutputState,
  text: string
): { output: string; state: ClaudeOutputState } {
  const normalized = normalizeStreamText(text)
  if (!normalized) {
    return { output, state }
  }

  const nextState: ClaudeOutputState = { ...state, pendingBreak: false }
  if (state.pendingBreak || typeof state.turnStartIndex !== "number") {
    nextState.turnStartIndex = output.length
  }

  return {
    output: `${output}${normalized}`,
    state: nextState,
  }
}

function appendClaudeDelta(
  output: string,
  state: ClaudeOutputState,
  text: string
): { output: string; state: ClaudeOutputState } {
  if (!text) {
    return { output, state }
  }

  const result = appendClaudeText(
    output,
    { ...state, streamedDelta: true },
    text
  )
  return {
    output: result.output,
    state: { ...result.state, streamedDelta: true },
  }
}

function markClaudeBoundary(
  output: string,
  state: ClaudeOutputState,
  options: ReduceOptions
): { output: string; state: ClaudeOutputState } {
  return {
    output: options.prettyMode ? appendPrettyMessageBoundary(output) : output,
    state: { ...state, pendingBreak: true },
  }
}

function markClaudeBoundaryOnBlockChange(
  output: string,
  state: ClaudeOutputState,
  nextIndex: number | undefined,
  options: ReduceOptions
): { output: string; state: ClaudeOutputState } {
  if (typeof nextIndex !== "number") {
    return { output, state }
  }

  let nextOutput = output
  let nextState: ClaudeOutputState = { ...state }
  if (
    typeof nextState.activeBlockIndex === "number" &&
    nextState.activeBlockIndex !== nextIndex &&
    nextState.streamedDelta
  ) {
    const boundary = markClaudeBoundary(nextOutput, nextState, options)
    nextOutput = boundary.output
    nextState = boundary.state
  }

  nextState.activeBlockIndex = nextIndex
  return { output: nextOutput, state: nextState }
}

function reconcileClaudeTurn(
  output: string,
  state: ClaudeOutputState,
  text: string
): string {
  const normalized = normalizeStreamText(text)
  if (!normalized || typeof state.turnStartIndex !== "number") {
    return output
  }

  const before = output.slice(0, state.turnStartIndex)
  const currentTurn = output.slice(state.turnStartIndex)
  if (currentTurn === normalized) {
    return output
  }
  return `${before}${normalized}`
}

function reduceClaudeStreamEvent(
  output: string,
  state: ClaudeOutputState,
  event: ClaudeStreamEvent,
  options: ReduceOptions
): { output: string; state: ClaudeOutputState } {
  let nextOutput = output
  let nextState: ClaudeOutputState = { ...state }

  if (event.type === "message_start" && nextState.streamedDelta) {
    const boundary = markClaudeBoundary(nextOutput, nextState, options)
    nextOutput = boundary.output
    nextState = boundary.state
  }

  if (
    event.type === "content_block_start" ||
    event.type === "content_block_delta"
  ) {
    const nextIndex = claudeBlockIndex(event)
    if (
      event.type === "content_block_start" &&
      typeof nextIndex !== "number" &&
      nextState.streamedDelta
    ) {
      const boundary = markClaudeBoundary(nextOutput, nextState, options)
      nextOutput = boundary.output
      nextState = boundary.state
    }

    const changed = markClaudeBoundaryOnBlockChange(
      nextOutput,
      nextState,
      nextIndex,
      options
    )
    nextOutput = changed.output
    nextState = changed.state
  }

  if (event.type === "content_block_delta") {
    const delta = appendClaudeDelta(
      nextOutput,
      nextState,
      claudeDeltaText(event.delta)
    )
    nextOutput = delta.output
    nextState = delta.state
  }

  if (event.type === "content_block_stop") {
    if (nextState.streamedDelta) {
      const boundary = markClaudeBoundary(nextOutput, nextState, options)
      nextOutput = boundary.output
      nextState = boundary.state
    }
    nextState.activeBlockIndex = undefined
  }

  if (event.type === "message_stop") {
    const boundary = markClaudeBoundary(nextOutput, nextState, options)
    nextOutput = boundary.output
    nextState = boundary.state
    nextState.activeBlockIndex = undefined
  }

  return { output: nextOutput, state: nextState }
}

export function reduceClaudeOutput(
  output: string,
  state: ClaudeOutputState,
  msg: ClaudeOutputMessage,
  options: ReduceOptions = DEFAULT_REDUCE_OPTIONS
): { output: string; state: ClaudeOutputState } {
  const streamEvent = toClaudeStreamEvent(msg)
  if (streamEvent) {
    return reduceClaudeStreamEvent(output, state, streamEvent, options)
  }

  let nextOutput = output
  let nextState: ClaudeOutputState = { ...state }

  if (msg.type === "assistant") {
    const completed = claudeCompletedText(msg.message?.content)
    if (nextState.streamedDelta) {
      if (completed) {
        nextOutput = reconcileClaudeTurn(nextOutput, nextState, completed)
      }
      const boundary = markClaudeBoundary(nextOutput, nextState, options)
      return { output: boundary.output, state: boundary.state }
    }

    if (completed) {
      const appended = appendClaudeText(nextOutput, nextState, completed)
      nextOutput = appended.output
      nextState = appended.state
      const boundary = markClaudeBoundary(nextOutput, nextState, options)
      return { output: boundary.output, state: boundary.state }
    }

    return { output: nextOutput, state: nextState }
  }

  if (msg.type === "result") {
    const boundary = markClaudeBoundary(nextOutput, nextState, options)
    nextState = { ...boundary.state, streamedDelta: false }
    nextOutput = boundary.output
    nextState.activeBlockIndex = undefined
    nextState.turnStartIndex = undefined
    return { output: nextOutput, state: nextState }
  }

  return { output: nextOutput, state: nextState }
}

function codexThreadTransition(
  output: string,
  state: CodexOutputState,
  threadId: string | undefined
): { output: string; state: CodexOutputState } {
  if (!threadId) {
    return { output, state }
  }
  const nextState = { ...state }
  if (!nextState.primaryThreadId) {
    nextState.primaryThreadId = threadId
  }
  if (threadId === state.activeThreadId) {
    return { output, state: nextState }
  }
  nextState.activeThreadId = threadId
  const isSubagent = threadId !== nextState.primaryThreadId
  const isReturn = !isSubagent && state.activeThreadId !== undefined
  if (!(isSubagent || isReturn)) {
    return { output, state: nextState }
  }
  const label = isSubagent
    ? `\n\n---\n**[subagent ${threadId.slice(0, 8)}]**\n\n`
    : "\n\n---\n\n"
  return {
    output: `${output}${label}`,
    state: nextState,
  }
}

const COMPLETE_MESSAGE_SOURCE_METHODS = new Set<string>([
  "codex/event/agent_message",
  "codex/event/raw_response_item",
  "codex/event/user_message",
])

export function reduceCodexOutput(
  output: string,
  state: CodexOutputState,
  event: CodexOutputEvent,
  options: ReduceOptions = DEFAULT_REDUCE_OPTIONS
): { output: string; state: CodexOutputState } {
  if (event.method === "item/agentMessage/delta") {
    const normalized = normalizeStreamText(event.text ?? "")
    if (!normalized) {
      return { output, state }
    }
    const dedupeText = normalized.trimEnd()
    const isCompleteMessageReplay =
      !state.openAssistantMessage &&
      state.lastCompletedMessageText === dedupeText &&
      (event.sourceMethod
        ? COMPLETE_MESSAGE_SOURCE_METHODS.has(event.sourceMethod)
        : false) &&
      (!event.threadId || event.threadId === state.activeThreadId)
    if (isCompleteMessageReplay) {
      return {
        output,
        state: { ...state, lastCompletedMessageText: undefined },
      }
    }
    if (
      state.openAssistantMessage &&
      state.lastAssistantDeltaText?.trimEnd() === dedupeText
    ) {
      return { output, state }
    }
    const transition = codexThreadTransition(output, state, event.threadId)
    return {
      output: `${transition.output}${normalized}`,
      state: {
        ...transition.state,
        lastAssistantDeltaText: normalized,
        lastCompletedMessageText: undefined,
        openAssistantMessage: true,
      },
    }
  }

  if (event.method === "item/completed") {
    if (!state.openAssistantMessage) {
      return { output, state }
    }
    return {
      output: options.prettyMode ? appendPrettyMessageBoundary(output) : output,
      state: {
        ...state,
        lastAssistantDeltaText: undefined,
        lastCompletedMessageText: state.lastAssistantDeltaText?.trimEnd(),
        openAssistantMessage: false,
      },
    }
  }

  return { output, state }
}
