import {
  type CodexRpcParams,
  codexCommandFromParams,
  codexExitCodeFromParams,
  codexStatusFromParams,
  codexThreadIdFromParams,
  codexTurnIdFromParams,
} from "@axel-delafosse/protocol/codex-rpc"
import type {
  StreamItem,
  StreamItemAction,
  StreamItemData,
  StreamItemStatus,
  StreamItemType,
} from "@axel-delafosse/protocol/stream-items"
import {
  codexTextFromParams,
  codexTextFromRawParams,
} from "@axel-delafosse/protocol/stream-parsing"

export interface CodexStreamAdapterInput {
  agentId?: string
  id?: number | string
  method?: string
  params?: CodexRpcParams
}

export interface CodexStreamAdapterState {
  activeMessageByThread: Map<string, string>
  activeMessageByThreadOnly: Map<string, string>
  aggregatedCommandOutputBySourceItem: Map<string, string>
  aggregatedFileChangeDeltaBySourceItem: Map<string, string>
  aggregatedMcpProgressBySourceItem: Map<string, string>
  aggregatedMessageTextByThread: Map<string, string>
  latestCommandStreamByTurn: Map<string, string>
  messageRoleByStreamId: Map<string, MessageRole>
  nextId: number
  recentCompletedMessageByThread: Map<
    string,
    { id: string; role?: MessageRole; text: string; timestamp: number }
  >
  sourceItemToStreamItem: Map<string, string>
}

export interface CodexStreamAdapterOptions {
  now?: () => number
}

const DUPLICATE_COMPLETION_TEXT_WINDOW_MS = 2000
const DEDUPE_WHITESPACE_REGEX = /\s+/g
const MAX_AGGREGATED_MESSAGE_TEXT_ENTRIES = 512
const MAX_LATEST_COMMAND_STREAM_BY_TURN_ENTRIES = 256
const MAX_MESSAGE_ROLE_BY_STREAM_ID_ENTRIES = 512
const MAX_RECENT_COMPLETED_MESSAGE_ENTRIES = 512
const RECENT_COMPLETED_MESSAGE_TTL_MS = DUPLICATE_COMPLETION_TEXT_WINDOW_MS * 4

type StreamItemCompletionStatus = Extract<
  StreamItemStatus,
  "complete" | "error"
>

function pruneMapToLimit<K, V>(map: Map<K, V>, maxSize: number): void {
  if (map.size <= maxSize) {
    return
  }
  let overflow = map.size - maxSize
  for (const key of map.keys()) {
    map.delete(key)
    overflow -= 1
    if (overflow <= 0) {
      break
    }
  }
}

function readObject(value: unknown): Record<string, unknown> | undefined {
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

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  const direct = readObject(value)
  if (direct) {
    return direct
  }
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  try {
    return readObject(JSON.parse(trimmed))
  } catch {
    return undefined
  }
}

function readCommandLikeValue(value: unknown): string | undefined {
  const direct = readString(value)
  if (direct) {
    return direct
  }
  if (!Array.isArray(value)) {
    return undefined
  }
  const parts = value.filter(
    (entry): entry is string => typeof entry === "string"
  )
  if (parts.length === 0) {
    return undefined
  }
  const joined = parts.join(" ").trim()
  return joined || undefined
}

interface RawExecCommandCall {
  callId?: string
  command: string
  cwd?: string
}

function readRawExecCommandCall(
  params?: CodexRpcParams
): RawExecCommandCall | undefined {
  const msg = readObject(params?.msg)
  const item = readObject(msg?.item)
  if (!item) {
    return undefined
  }
  if (readString(item.type) !== "function_call") {
    return undefined
  }
  if (readString(item.name) !== "exec_command") {
    return undefined
  }
  const argumentsRecord = parseJsonObject(item.arguments)
  const command =
    readCommandLikeValue(argumentsRecord?.cmd) ??
    readCommandLikeValue(argumentsRecord?.command) ??
    readCommandLikeValue(argumentsRecord?.args) ??
    readCommandLikeValue(argumentsRecord?.argv)
  if (!command) {
    return undefined
  }
  return {
    callId: readString(item.call_id) ?? readString(item.callId),
    command,
    cwd:
      readString(argumentsRecord?.workdir) ?? readString(argumentsRecord?.cwd),
  }
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value
  }
  if (value === undefined || value === null) {
    return ""
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function dedupeTextKey(text: string): string {
  return text.replace(DEDUPE_WHITESPACE_REGEX, " ").trim()
}

function threadScopedKey(
  prefix: string,
  threadId?: string,
  turnId?: string
): string {
  return `${prefix}:${threadId ?? "-"}:${turnId ?? "-"}`
}

function commandTurnKey(threadId?: string, turnId?: string): string {
  return threadScopedKey("command-turn", threadId, turnId)
}

function messageTurnKey(threadId?: string, turnId?: string): string {
  return threadScopedKey("msg", threadId, turnId)
}

function messageThreadOnlyKey(threadId?: string): string {
  return threadScopedKey("msg", threadId)
}

function messageGlobalKey(): string {
  return threadScopedKey("msg", "*", "*")
}

function findActiveMessageByEquivalentText(
  state: CodexStreamAdapterState,
  dedupedText: string
): string | undefined {
  const matchedIds = new Set<string>()
  for (const [key, text] of state.aggregatedMessageTextByThread) {
    if (dedupeTextKey(text) !== dedupedText) {
      continue
    }
    const byTurn = state.activeMessageByThread.get(key)
    if (byTurn) {
      matchedIds.add(byTurn)
    }
    const byThreadOnly = state.activeMessageByThreadOnly.get(key)
    if (byThreadOnly) {
      matchedIds.add(byThreadOnly)
    }
  }
  if (matchedIds.size !== 1) {
    return undefined
  }
  return matchedIds.values().next().value
}

function clearActiveMessageReferencesById(
  state: CodexStreamAdapterState,
  streamId: string
): void {
  for (const [key, id] of state.activeMessageByThread) {
    if (id === streamId) {
      state.activeMessageByThread.delete(key)
    }
  }
  for (const [key, id] of state.activeMessageByThreadOnly) {
    if (id === streamId) {
      state.activeMessageByThreadOnly.delete(key)
    }
  }
  state.messageRoleByStreamId.delete(streamId)
}

function clearAggregatedMessageTextByStreamId(
  state: CodexStreamAdapterState,
  streamId: string
): void {
  for (const key of state.aggregatedMessageTextByThread.keys()) {
    const byTurn = state.activeMessageByThread.get(key)
    const byThreadOnly = state.activeMessageByThreadOnly.get(key)
    if (byTurn === streamId || byThreadOnly === streamId) {
      state.aggregatedMessageTextByThread.delete(key)
    }
  }
}

function aggregatedMessageTextForStreamId(
  state: CodexStreamAdapterState,
  streamId: string
): string | undefined {
  let best: string | undefined
  for (const [key, text] of state.aggregatedMessageTextByThread) {
    const byTurn = state.activeMessageByThread.get(key)
    const byThreadOnly = state.activeMessageByThreadOnly.get(key)
    if (byTurn !== streamId && byThreadOnly !== streamId) {
      continue
    }
    if (!best || text.length > best.length) {
      best = text
    }
  }
  return best
}

function recentCompletedMessageForKeys(
  state: CodexStreamAdapterState,
  threadId?: string,
  turnId?: string,
  nowTimestamp?: number
):
  | { id: string; role?: MessageRole; text: string; timestamp: number }
  | undefined {
  if (nowTimestamp !== undefined) {
    for (const [key, recent] of state.recentCompletedMessageByThread) {
      if (nowTimestamp - recent.timestamp > RECENT_COMPLETED_MESSAGE_TTL_MS) {
        state.recentCompletedMessageByThread.delete(key)
      }
    }
  }
  pruneMapToLimit(
    state.recentCompletedMessageByThread,
    MAX_RECENT_COMPLETED_MESSAGE_ENTRIES
  )
  const byTurn = state.recentCompletedMessageByThread.get(
    messageTurnKey(threadId, turnId)
  )
  const byThread = state.recentCompletedMessageByThread.get(
    messageThreadOnlyKey(threadId)
  )
  const byGlobal = state.recentCompletedMessageByThread.get(messageGlobalKey())
  const candidates = [byTurn, byThread, byGlobal].filter(
    (candidate): candidate is NonNullable<typeof candidate> =>
      candidate !== undefined
  )
  if (candidates.length === 0) {
    return undefined
  }
  let latest = candidates[0]
  for (const candidate of candidates.slice(1)) {
    if (candidate.timestamp > latest.timestamp) {
      latest = candidate
    }
  }
  return latest
}

function setRecentCompletedMessageForKeys(
  state: CodexStreamAdapterState,
  threadId: string | undefined,
  turnId: string | undefined,
  recent: { id: string; role?: MessageRole; text: string; timestamp: number }
): void {
  state.recentCompletedMessageByThread.set(
    messageTurnKey(threadId, turnId),
    recent
  )
  state.recentCompletedMessageByThread.set(
    messageThreadOnlyKey(threadId),
    recent
  )
  state.recentCompletedMessageByThread.set(messageGlobalKey(), recent)
  pruneMapToLimit(
    state.recentCompletedMessageByThread,
    MAX_RECENT_COMPLETED_MESSAGE_ENTRIES
  )
}

function aggregatedMessageTextForKeys(
  state: CodexStreamAdapterState,
  threadId?: string,
  turnId?: string
): string | undefined {
  return (
    state.aggregatedMessageTextByThread.get(messageTurnKey(threadId, turnId)) ??
    state.aggregatedMessageTextByThread.get(messageThreadOnlyKey(threadId))
  )
}

function setAggregatedMessageTextForKeys(
  state: CodexStreamAdapterState,
  threadId: string | undefined,
  turnId: string | undefined,
  text: string
): void {
  state.aggregatedMessageTextByThread.set(
    messageTurnKey(threadId, turnId),
    text
  )
  state.aggregatedMessageTextByThread.set(messageThreadOnlyKey(threadId), text)
  pruneMapToLimit(
    state.aggregatedMessageTextByThread,
    MAX_AGGREGATED_MESSAGE_TEXT_ENTRIES
  )
}

function clearAggregatedMessageTextForKeys(
  state: CodexStreamAdapterState,
  threadId?: string,
  turnId?: string
): void {
  state.aggregatedMessageTextByThread.delete(messageTurnKey(threadId, turnId))
  state.aggregatedMessageTextByThread.delete(messageThreadOnlyKey(threadId))
}

function nextCodexItemId(
  state: CodexStreamAdapterState,
  prefix: string
): string {
  state.nextId += 1
  return `codex-${prefix}-${state.nextId}`
}

interface CodexItemOptions {
  agentId?: string
  data?: StreamItemData
  itemId?: string
  status?: StreamItemStatus
  text?: string
  threadId?: string
  title?: string
  turnId?: string
}

interface CodexUserInputQuestion {
  header?: string
  id?: string
  isOther: boolean
  isSecret: boolean
  options: unknown[]
  question?: string
}

type MessageRole = "assistant" | "user"

const LEGACY_MIRROR_NOTIFICATION_METHODS = new Set([
  "codex/event/item_started",
  "codex/event/item_completed",
  "rawResponseItem/completed",
  "codex/event/agent_message_delta",
  "codex/event/agent_message_content_delta",
  "codex/event/agent_message",
  "codex/event/agent_reasoning",
  "codex/event/agent_reasoning_delta",
  "codex/event/reasoning_content_delta",
  "codex/event/agent_reasoning_section_break",
])

function normalizeThreadItemType(threadItemType?: string): string | undefined {
  const normalized = threadItemType?.trim()
  if (!normalized) {
    return undefined
  }
  switch (normalized) {
    case "UserMessage":
      return "userMessage"
    case "AgentMessage":
      return "agentMessage"
    case "Plan":
      return "plan"
    case "Reasoning":
      return "reasoning"
    case "WebSearch":
      return "webSearch"
    case "ContextCompaction":
      return "contextCompaction"
    default:
      return normalized
  }
}

function createCodexItem(
  state: CodexStreamAdapterState,
  type: StreamItemType,
  opts?: CodexItemOptions
): { action: StreamItemAction; id: string } {
  const id = nextCodexItemId(state, type)
  const data: StreamItemData = {
    ...opts?.data,
    ...(opts?.text !== undefined && { text: opts.text }),
    ...(opts?.title !== undefined && { title: opts.title }),
  }
  const item: StreamItem = {
    id,
    type,
    status: opts?.status ?? "streaming",
    timestamp: Date.now(),
    ...(opts?.agentId !== undefined && { agentId: opts.agentId }),
    data,
    ...(opts?.itemId !== undefined && { itemId: opts.itemId }),
    ...(opts?.threadId !== undefined && { threadId: opts.threadId }),
    ...(opts?.turnId !== undefined && { turnId: opts.turnId }),
  }
  return {
    action: { type: "create", item },
    id,
  }
}

function mapCodexThreadItemType(threadItemType?: string): StreamItemType {
  switch (normalizeThreadItemType(threadItemType)) {
    case "userMessage":
      return "message"
    case "agentMessage":
      return "message"
    case "commandExecution":
      return "command_execution"
    case "collabAgentToolCall":
      return "collab_agent"
    case "contextCompaction":
      return "status"
    case "enteredReviewMode":
    case "exitedReviewMode":
      return "review_mode"
    case "fileChange":
      return "file_change"
    case "imageView":
      return "image"
    case "mcpToolCall":
      return "mcp_tool_call"
    case "plan":
      return "plan"
    case "reasoning":
      return "reasoning"
    case "webSearch":
      return "web_search"
    default:
      return "raw_item"
  }
}

function readThreadItemId(params?: CodexRpcParams): string | undefined {
  return (
    readString(params?.itemId) ??
    readString(readObject(params?.item)?.id) ??
    readString(params?.id)
  )
}

function readCommandSourceId(params?: CodexRpcParams): string | undefined {
  const paramsRecord = readObject(params)
  return (
    readString(params?.itemId) ??
    readString(params?.id) ??
    readString(paramsRecord?.call_id) ??
    readString(paramsRecord?.callId) ??
    readString(paramsRecord?.process_id) ??
    readString(paramsRecord?.processId)
  )
}

function commandSourceKey(
  params: CodexRpcParams | undefined,
  threadId?: string,
  turnId?: string
): string {
  return (
    readCommandSourceId(params) ?? threadScopedKey("command", threadId, turnId)
  )
}

function readRawResponseMessageRole(
  params?: CodexRpcParams
): MessageRole | undefined {
  const msgRecord = readObject(params?.msg)
  const role =
    readString(msgRecord?.role) ?? readString(readObject(msgRecord?.item)?.role)
  if (role === "user") {
    return "user"
  }
  if (role === "assistant") {
    return "assistant"
  }
  return undefined
}

function messageRoleFromMethod(
  method: string,
  params?: CodexRpcParams
): MessageRole | undefined {
  if (method === "codex/event/user_message") {
    return "user"
  }
  if (
    method === "item/agentMessage/delta" ||
    method === "codex/event/agent_message_delta" ||
    method === "codex/event/agent_message_content_delta" ||
    method === "codex/event/agent_message"
  ) {
    return "assistant"
  }
  if (method === "codex/event/raw_response_item") {
    return readRawResponseMessageRole(params) ?? "assistant"
  }
  return undefined
}

function messageRoleFromThreadItemType(
  threadItemType?: string
): MessageRole | undefined {
  const normalized = normalizeThreadItemType(threadItemType)
  if (normalized === "userMessage") {
    return "user"
  }
  if (normalized === "agentMessage") {
    return "assistant"
  }
  return undefined
}

function extractUserMessageContentText(content: unknown): string {
  const parts: string[] = []
  for (const entry of readArray(content)) {
    const record = readObject(entry)
    if (!record) {
      continue
    }
    const text =
      readString(record.text) ??
      readString(record.name) ??
      readString(record.path) ??
      readString(record.image_url) ??
      readString(record.url)
    if (text) {
      parts.push(text)
    }
  }
  return parts.join("\n")
}

function extractReasoningText(threadItem: Record<string, unknown>): string {
  const summary = (
    readArray(threadItem.summary) ??
    readArray(threadItem.summary_text) ??
    []
  )
    .map((part) => readString(part) ?? "")
    .filter(Boolean)
    .join("\n")
  if (summary) {
    return summary
  }
  return (
    readArray(threadItem.content) ??
    readArray(threadItem.raw_content) ??
    []
  )
    .map((part) => readString(part) ?? "")
    .filter(Boolean)
    .join("\n")
}

function extractCommandExecutionText(
  threadItem: Record<string, unknown>
): string {
  const command = readString(threadItem.command)
  const output = readString(threadItem.aggregatedOutput)
  if (command && output) {
    return `$ ${command}\n${output}`
  }
  return output ?? (command ? `$ ${command}` : "")
}

function extractThreadItemText(threadItem: Record<string, unknown>): string {
  const type = normalizeThreadItemType(readString(threadItem.type))
  switch (type) {
    case "agentMessage":
      return (
        readString(threadItem.text) ??
        extractUserMessageContentText(threadItem.content)
      )
    case "plan":
      return readString(threadItem.text) ?? ""
    case "userMessage":
      return extractUserMessageContentText(threadItem.content)
    case "reasoning":
      return extractReasoningText(threadItem)
    case "commandExecution":
      return extractCommandExecutionText(threadItem)
    case "webSearch":
      return readString(threadItem.query) ?? ""
    case "imageView":
      return readString(threadItem.path) ?? ""
    case "enteredReviewMode":
    case "exitedReviewMode":
      return readString(threadItem.review) ?? ""
    default:
      return ""
  }
}

function appendSourceItemText(
  map: Map<string, string>,
  sourceItemId: string,
  chunk: string,
  separator = ""
): string {
  const existing = map.get(sourceItemId)
  const next = existing ? `${existing}${separator}${chunk}` : chunk
  map.set(sourceItemId, next)
  return next
}

function reconcileIncomingText(
  existing: string,
  incoming: string
): { appendText: string; nextAggregate: string } {
  if (!incoming) {
    return { appendText: "", nextAggregate: existing }
  }
  if (!existing) {
    return { appendText: incoming, nextAggregate: incoming }
  }
  if (incoming === existing || existing.endsWith(incoming)) {
    return { appendText: "", nextAggregate: existing }
  }
  if (incoming.startsWith(existing)) {
    return {
      appendText: incoming.slice(existing.length),
      nextAggregate: incoming,
    }
  }
  return {
    appendText: incoming,
    nextAggregate: `${existing}${incoming}`,
  }
}

function normalizeThreadItemData(
  threadItem: Record<string, unknown>,
  threadItemType?: string
): StreamItemData {
  const normalizedType = threadItemType ?? readString(threadItem.type)
  const baseData: StreamItemData = {
    item: threadItem,
  }
  if (normalizedType === "commandExecution") {
    return {
      ...baseData,
      command: readString(threadItem.command),
      cwd: readString(threadItem.cwd),
      durationMs: threadItem.durationMs,
      exitCode: threadItem.exitCode,
      output: readString(threadItem.aggregatedOutput),
      processId: readString(threadItem.processId),
      status: readString(threadItem.status),
    }
  }
  if (normalizedType === "fileChange") {
    return {
      ...baseData,
      changes: readArray(threadItem.changes),
      status: readString(threadItem.status),
    }
  }
  if (normalizedType === "mcpToolCall") {
    return {
      ...baseData,
      arguments: threadItem.arguments,
      durationMs: threadItem.durationMs,
      error: threadItem.error,
      name: readString(threadItem.tool),
      result: threadItem.result,
      server: readString(threadItem.server),
      status: readString(threadItem.status),
      toolName: readString(threadItem.tool),
    }
  }
  const messageRole = messageRoleFromThreadItemType(normalizedType)
  if (messageRole) {
    return {
      ...baseData,
      role: messageRole,
    }
  }
  return baseData
}

function completionStatusFromCodexStatus(
  status: string | undefined
): StreamItemCompletionStatus | undefined {
  if (!status) {
    return undefined
  }
  const normalized = status.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }
  if (
    normalized.includes("error") ||
    normalized.includes("fail") ||
    normalized.includes("denied")
  ) {
    return "error"
  }
  if (
    normalized === "complete" ||
    normalized === "completed" ||
    normalized === "done" ||
    normalized === "finished" ||
    normalized === "success" ||
    normalized === "succeeded" ||
    normalized === "ok"
  ) {
    return "complete"
  }
  return undefined
}

function completionDataForThreadItem(
  threadItem: Record<string, unknown>,
  threadItemType?: string
): StreamItemData {
  const text = extractThreadItemText(threadItem)
  const normalized = normalizeThreadItemData(threadItem, threadItemType)
  return {
    ...normalized,
    ...(text && { text }),
    ...(threadItemType && { title: threadItemType }),
  }
}

function ensureSourceItem(
  state: CodexStreamAdapterState,
  actions: StreamItemAction[],
  sourceItemId: string,
  type: StreamItemType,
  agentId?: string,
  threadId?: string,
  turnId?: string,
  title?: string,
  data?: StreamItemData
): string {
  const existing = state.sourceItemToStreamItem.get(sourceItemId)
  if (existing) {
    return existing
  }
  const created = createCodexItem(state, type, {
    agentId,
    data,
    itemId: sourceItemId,
    threadId,
    title,
    turnId,
  })
  actions.push(created.action)
  state.sourceItemToStreamItem.set(sourceItemId, created.id)
  return created.id
}

function setLatestCommandStreamByTurn(
  state: CodexStreamAdapterState,
  threadId: string | undefined,
  turnId: string | undefined,
  streamId: string
): void {
  state.latestCommandStreamByTurn.set(
    commandTurnKey(threadId, turnId),
    streamId
  )
  pruneMapToLimit(
    state.latestCommandStreamByTurn,
    MAX_LATEST_COMMAND_STREAM_BY_TURN_ENTRIES
  )
}

function setMessageRoleByStreamId(
  state: CodexStreamAdapterState,
  streamId: string,
  role: MessageRole
): void {
  state.messageRoleByStreamId.set(streamId, role)
  pruneMapToLimit(
    state.messageRoleByStreamId,
    MAX_MESSAGE_ROLE_BY_STREAM_ID_ENTRIES
  )
}

function clearLatestCommandStreamByTurnIfMatch(
  state: CodexStreamAdapterState,
  threadId: string | undefined,
  turnId: string | undefined,
  streamId: string
): void {
  const key = commandTurnKey(threadId, turnId)
  if (state.latestCommandStreamByTurn.get(key) === streamId) {
    state.latestCommandStreamByTurn.delete(key)
  }
}

function handleCodexApprovalRequest(
  state: CodexStreamAdapterState,
  input: CodexStreamAdapterInput,
  agentId: string | undefined,
  threadId: string | undefined,
  turnId: string | undefined
): StreamItemAction[] {
  const method = input.method
  if (!method) {
    return []
  }

  if (
    method !== "item/commandExecution/requestApproval" &&
    method !== "item/fileChange/requestApproval" &&
    method !== "item/tool/requestUserInput"
  ) {
    return []
  }

  const params = input.params
  const sourceItemId = readString(params?.itemId)
  const data: StreamItemData = {
    params: readObject(params),
    requestId: input.id,
    requestMethod: method,
    ...(sourceItemId !== undefined && { sourceItemId }),
  }
  let text = ""
  let title = "Approval request"
  let requestType = "approval"
  let requiresInput = false

  if (method === "item/commandExecution/requestApproval") {
    title = "Command approval"
    requestType = "command_approval"
    const command = codexCommandFromParams(params)
    const reason = readString(params?.reason)
    const cwd = readString(params?.cwd)
    const approvalId = readString(params?.approvalId)
    text = command ?? reason ?? ""
    Object.assign(data, {
      approvalId,
      command,
      cwd,
      prompt: reason ?? command,
      reason,
      requiresInput,
      requestType,
    })
  } else if (method === "item/fileChange/requestApproval") {
    title = "File change approval"
    requestType = "file_change_approval"
    const reason = readString(params?.reason)
    const grantRoot = readString(params?.grantRoot)
    text = reason ?? grantRoot ?? ""
    Object.assign(data, {
      grantRoot,
      path: grantRoot,
      prompt: reason ?? grantRoot,
      reason,
      requiresInput,
      requestType,
    })
  } else if (method === "item/tool/requestUserInput") {
    title = "User input request"
    requestType = "tool_input_request"
    requiresInput = true
    const questions = readArray(params?.questions)
    const normalizedQuestions = questions
      .map((question): CodexUserInputQuestion | undefined => {
        const record = readObject(question)
        if (!record) {
          return undefined
        }
        return {
          header: readString(record.header),
          id: readString(record.id),
          isOther: record.isOther === true,
          isSecret: record.isSecret === true,
          options: readArray(record.options),
          question: readString(record.question),
        }
      })
      .filter(
        (question): question is CodexUserInputQuestion => question !== undefined
      )
    text = normalizedQuestions
      .map((question) => {
        return (
          readString(question.question) ?? readString(question.header) ?? ""
        )
      })
      .filter(Boolean)
      .join("\n")
    const firstPrompt = normalizedQuestions.at(0)
    Object.assign(data, {
      inputPlaceholder: readString(firstPrompt?.question) ?? "Type a response",
      prompt: text,
      questions: normalizedQuestions,
      requiresInput,
      requestType,
    })
  }

  const created = createCodexItem(state, "approval_request", {
    agentId,
    status: "complete",
    text: text || undefined,
    title,
    threadId,
    turnId,
    data,
  })
  return [created.action]
}

export function createCodexStreamAdapterState(): CodexStreamAdapterState {
  return {
    activeMessageByThread: new Map<string, string>(),
    activeMessageByThreadOnly: new Map<string, string>(),
    aggregatedCommandOutputBySourceItem: new Map<string, string>(),
    aggregatedFileChangeDeltaBySourceItem: new Map<string, string>(),
    aggregatedMessageTextByThread: new Map<string, string>(),
    aggregatedMcpProgressBySourceItem: new Map<string, string>(),
    latestCommandStreamByTurn: new Map<string, string>(),
    messageRoleByStreamId: new Map<string, MessageRole>(),
    nextId: 0,
    recentCompletedMessageByThread: new Map<
      string,
      { id: string; role?: MessageRole; text: string; timestamp: number }
    >(),
    sourceItemToStreamItem: new Map<string, string>(),
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: adapter keeps event mapping local and explicit
export function adaptCodexMessageToStreamItems(
  state: CodexStreamAdapterState,
  input: CodexStreamAdapterInput,
  options: CodexStreamAdapterOptions = {}
): StreamItemAction[] {
  const now = options.now ?? Date.now
  const method = input.method
  if (!method) {
    return []
  }

  const threadId = codexThreadIdFromParams(input.params)
  const turnId = codexTurnIdFromParams(input.params)
  const threadKey = messageTurnKey(threadId, turnId)
  const threadOnlyMessageKey = messageThreadOnlyKey(threadId)
  const agentId = input.agentId

  const approvalActions = handleCodexApprovalRequest(
    state,
    input,
    agentId,
    threadId,
    turnId
  )
  if (approvalActions.length > 0) {
    return approvalActions
  }

  if (LEGACY_MIRROR_NOTIFICATION_METHODS.has(method)) {
    return []
  }

  if (method === "item/started") {
    const threadItem = readObject(input.params?.item)
    if (!threadItem) {
      return []
    }
    const threadItemId = readString(threadItem.id)
    const threadItemType = readString(threadItem.type)
    const normalizedThreadItemType = normalizeThreadItemType(threadItemType)
    const itemType = mapCodexThreadItemType(threadItemType)
    const itemText = extractThreadItemText(threadItem)
    const normalizedData = normalizeThreadItemData(threadItem, threadItemType)
    const messageRole = messageRoleFromThreadItemType(threadItemType)
    if (itemType === "message" && messageRole === "user" && itemText) {
      const nowTimestamp = now()
      const recent = recentCompletedMessageForKeys(
        state,
        threadId,
        turnId,
        nowTimestamp
      )
      const dedupeText = dedupeTextKey(itemText)
      if (
        recent &&
        recent.role === "user" &&
        recent.text === dedupeText &&
        nowTimestamp - recent.timestamp <= DUPLICATE_COMPLETION_TEXT_WINDOW_MS
      ) {
        if (threadItemId) {
          state.sourceItemToStreamItem.set(threadItemId, recent.id)
        }
        return []
      }
    }

    const commandTurnStreamId = state.latestCommandStreamByTurn.get(
      commandTurnKey(threadId, turnId)
    )
    const fallbackCommandSourceId =
      threadItemType === "commandExecution"
        ? threadScopedKey("command", threadId, turnId)
        : undefined
    const mappedFallbackCommandStreamId =
      fallbackCommandSourceId &&
      threadItemId &&
      state.sourceItemToStreamItem.get(fallbackCommandSourceId)
    const mergeCommandStreamId =
      mappedFallbackCommandStreamId ?? commandTurnStreamId

    if (
      normalizedThreadItemType === "commandExecution" &&
      mergeCommandStreamId &&
      threadItemId
    ) {
      state.sourceItemToStreamItem.set(threadItemId, mergeCommandStreamId)
      setLatestCommandStreamByTurn(
        state,
        threadId,
        turnId,
        mergeCommandStreamId
      )
      const actions: StreamItemAction[] = [
        {
          type: "update",
          id: mergeCommandStreamId,
          patch: {
            data: {
              ...normalizedData,
              ...(itemText ? { text: itemText } : {}),
              ...(threadItemType ? { title: threadItemType } : {}),
            },
            itemId: threadItemId,
          },
        },
      ]
      const output = readString(threadItem.aggregatedOutput)
      if (output) {
        state.aggregatedCommandOutputBySourceItem.set(threadItemId, output)
      }
      return actions
    }

    const created = createCodexItem(state, itemType, {
      agentId,
      itemId: threadItemId,
      text: itemText || undefined,
      threadId,
      title: threadItemType,
      turnId,
      data: normalizedData,
      status:
        itemType === "status" || itemType === "review_mode"
          ? "complete"
          : "streaming",
    })

    if (threadItemId) {
      state.sourceItemToStreamItem.set(threadItemId, created.id)
      if (normalizedThreadItemType === "commandExecution") {
        setLatestCommandStreamByTurn(state, threadId, turnId, created.id)
        const output = readString(threadItem.aggregatedOutput)
        if (output) {
          state.aggregatedCommandOutputBySourceItem.set(threadItemId, output)
        }
      } else if (itemType === "message" && itemText) {
        setAggregatedMessageTextForKeys(state, threadId, turnId, itemText)
      } else if (normalizedThreadItemType === "fileChange") {
        const delta =
          readString(threadItem.delta) ?? readString(threadItem.patch)
        if (delta) {
          state.aggregatedFileChangeDeltaBySourceItem.set(threadItemId, delta)
        }
      } else if (normalizedThreadItemType === "mcpToolCall") {
        const progress = readString(threadItem.message)
        if (progress) {
          state.aggregatedMcpProgressBySourceItem.set(threadItemId, progress)
        }
      }
    }
    if (itemType === "message") {
      state.activeMessageByThread.set(threadKey, created.id)
      state.activeMessageByThreadOnly.set(threadOnlyMessageKey, created.id)
      if (messageRole) {
        setMessageRoleByStreamId(state, created.id, messageRole)
      }
    }

    return [created.action]
  }

  if (method === "item/plan/delta") {
    const actions: StreamItemAction[] = []
    const itemId =
      readString(input.params?.itemId) ??
      threadScopedKey("plan", threadId, turnId)
    const streamId = ensureSourceItem(
      state,
      actions,
      itemId,
      "plan",
      agentId,
      threadId,
      turnId,
      "Plan"
    )
    const delta = codexTextFromParams(input.params)
    if (!delta) {
      return actions
    }
    actions.push({ type: "append_text", id: streamId, text: delta })
    return actions
  }

  if (method === "turn/plan/updated") {
    const plan = readArray(input.params?.plan)
    const explanation = readString(input.params?.explanation)
    const planText = plan
      .map((step) => {
        const record = readObject(step)
        const status = readString(record?.status)
        const stepText = readString(record?.step)
        return [status, stepText].filter(Boolean).join(" ")
      })
      .filter(Boolean)
      .join("\n")
    const created = createCodexItem(state, "plan", {
      agentId,
      status: "complete",
      text: [explanation, planText].filter(Boolean).join("\n"),
      threadId,
      title: "Plan",
      turnId,
      data: {
        plan: plan as unknown[],
      },
    })
    return [created.action]
  }

  if (
    method === "item/reasoning/summaryTextDelta" ||
    method === "item/reasoning/textDelta"
  ) {
    const delta = codexTextFromParams(input.params)
    if (!delta) {
      return []
    }
    const actions: StreamItemAction[] = []
    const itemId =
      readString(input.params?.itemId) ??
      threadScopedKey("reasoning", threadId, turnId)
    const streamId = ensureSourceItem(
      state,
      actions,
      itemId,
      "reasoning",
      agentId,
      threadId,
      turnId,
      "Reasoning"
    )
    actions.push({
      type: "append_text",
      id: streamId,
      text: delta,
    })
    return actions
  }

  if (method === "item/reasoning/summaryPartAdded") {
    const actions: StreamItemAction[] = []
    const itemId =
      readString(input.params?.itemId) ??
      threadScopedKey("reasoning", threadId, turnId)
    const streamId = ensureSourceItem(
      state,
      actions,
      itemId,
      "reasoning",
      agentId,
      threadId,
      turnId,
      "Reasoning"
    )
    actions.push({ type: "append_text", id: streamId, text: "\n\n" })
    return actions
  }

  if (method === "codex/event/collab_waiting_begin") {
    const created = createCodexItem(state, "status", {
      agentId,
      status: "complete",
      text: "Waiting for collaborator output",
      threadId,
      turnId,
    })
    return [created.action]
  }

  if (
    method === "item/agentMessage/delta" ||
    method === "codex/event/user_message" ||
    method === "codex/event/raw_response_item"
  ) {
    const isRawResponseItem = method === "codex/event/raw_response_item"
    if (isRawResponseItem) {
      const rawExecCommand = readRawExecCommandCall(input.params)
      if (rawExecCommand) {
        const sourceId =
          rawExecCommand.callId ??
          commandSourceKey(input.params, threadId, turnId)
        const existing = state.sourceItemToStreamItem.get(sourceId)
        if (existing) {
          setLatestCommandStreamByTurn(state, threadId, turnId, existing)
          return [
            {
              type: "update",
              id: existing,
              patch: {
                data: {
                  command: rawExecCommand.command,
                  ...(rawExecCommand.cwd ? { cwd: rawExecCommand.cwd } : {}),
                },
              },
            },
          ]
        }
        const created = createCodexItem(state, "command_execution", {
          agentId,
          itemId: sourceId,
          text: `$ ${rawExecCommand.command}\n`,
          threadId,
          title: "Command",
          turnId,
          data: {
            callId: rawExecCommand.callId,
            command: rawExecCommand.command,
            ...(rawExecCommand.cwd ? { cwd: rawExecCommand.cwd } : {}),
          },
        })
        state.sourceItemToStreamItem.set(sourceId, created.id)
        setLatestCommandStreamByTurn(state, threadId, turnId, created.id)
        return [created.action]
      }
      return []
    }
    const isCompleteMessageEvent = method === "codex/event/user_message"
    const text =
      method === "codex/event/user_message"
        ? codexTextFromRawParams(input.params) ||
          codexTextFromParams(input.params)
        : codexTextFromParams(input.params)
    const messageRole = messageRoleFromMethod(method, input.params)
    if (!text) {
      return []
    }

    const dedupeText = dedupeTextKey(text)
    if (isCompleteMessageEvent && messageRole) {
      const nowTimestamp = now()
      const recent = recentCompletedMessageForKeys(
        state,
        threadId,
        turnId,
        nowTimestamp
      )
      if (
        recent &&
        recent.role === messageRole &&
        recent.text === dedupeText &&
        nowTimestamp - recent.timestamp <= DUPLICATE_COMPLETION_TEXT_WINDOW_MS
      ) {
        return []
      }
    }

    const actions: StreamItemAction[] = []
    let streamId = state.activeMessageByThread.get(threadKey)
    if (!streamId && isCompleteMessageEvent) {
      streamId = state.activeMessageByThreadOnly.get(threadOnlyMessageKey)
    }
    if (
      !streamId &&
      isCompleteMessageEvent &&
      !threadId &&
      !turnId &&
      messageRole === "user"
    ) {
      streamId = findActiveMessageByEquivalentText(state, dedupeText)
    }
    if (!streamId) {
      const created = createCodexItem(state, "message", {
        agentId,
        data: messageRole ? { role: messageRole } : undefined,
        threadId,
        turnId,
      })
      streamId = created.id
      state.activeMessageByThread.set(threadKey, streamId)
      state.activeMessageByThreadOnly.set(threadOnlyMessageKey, streamId)
      if (messageRole) {
        setMessageRoleByStreamId(state, streamId, messageRole)
      }
      actions.push(created.action)
    }

    let existingMessageText =
      aggregatedMessageTextForKeys(state, threadId, turnId) ?? ""
    if (!existingMessageText && streamId) {
      existingMessageText =
        aggregatedMessageTextForStreamId(state, streamId) ?? ""
    }
    const isWhitespaceEquivalentCompletion =
      isCompleteMessageEvent &&
      Boolean(existingMessageText) &&
      dedupeTextKey(existingMessageText) === dedupeText
    if (!isWhitespaceEquivalentCompletion) {
      const reconciled = reconcileIncomingText(existingMessageText, text)
      setAggregatedMessageTextForKeys(
        state,
        threadId,
        turnId,
        reconciled.nextAggregate
      )
      if (reconciled.appendText) {
        actions.push({
          type: "append_text",
          id: streamId,
          text: reconciled.appendText,
        })
      }
    }

    if (isCompleteMessageEvent) {
      actions.push({ type: "complete", id: streamId })
      clearAggregatedMessageTextByStreamId(state, streamId)
      clearActiveMessageReferencesById(state, streamId)
      setRecentCompletedMessageForKeys(state, threadId, turnId, {
        id: streamId,
        role: messageRole,
        text: dedupeText,
        timestamp: now(),
      })
      clearAggregatedMessageTextForKeys(state, threadId, turnId)
    }

    return actions
  }

  if (method === "codex/event/exec_command_begin") {
    const command = codexCommandFromParams(input.params)
    if (!command) {
      return []
    }
    const sourceId = commandSourceKey(input.params, threadId, turnId)
    const existing = state.sourceItemToStreamItem.get(sourceId)
    if (existing) {
      setLatestCommandStreamByTurn(state, threadId, turnId, existing)
      return [
        {
          type: "update",
          id: existing,
          patch: {
            data: {
              command,
            },
          },
        },
      ]
    }
    const explicitSourceId = readCommandSourceId(input.params)
    if (!explicitSourceId) {
      const latestForTurn = state.latestCommandStreamByTurn.get(
        commandTurnKey(threadId, turnId)
      )
      if (latestForTurn) {
        state.sourceItemToStreamItem.set(sourceId, latestForTurn)
        setLatestCommandStreamByTurn(state, threadId, turnId, latestForTurn)
        return [
          {
            type: "update",
            id: latestForTurn,
            patch: {
              data: {
                command,
              },
            },
          },
        ]
      }
    }
    const created = createCodexItem(state, "command_execution", {
      agentId,
      itemId: sourceId,
      text: `$ ${command}\n`,
      threadId,
      title: "Command",
      turnId,
      data: {
        command,
      },
    })
    state.sourceItemToStreamItem.set(sourceId, created.id)
    setLatestCommandStreamByTurn(state, threadId, turnId, created.id)
    return [created.action]
  }

  if (
    method === "item/commandExecution/outputDelta" ||
    method === "codex/event/exec_command_output_delta"
  ) {
    const actions: StreamItemAction[] = []
    const sourceId = commandSourceKey(input.params, threadId, turnId)
    const streamId = ensureSourceItem(
      state,
      actions,
      sourceId,
      "command_execution",
      agentId,
      threadId,
      turnId,
      "Command",
      {
        command: codexCommandFromParams(input.params),
      }
    )
    setLatestCommandStreamByTurn(state, threadId, turnId, streamId)
    const delta = codexTextFromParams(input.params)
    if (!delta) {
      return actions
    }
    const aggregatedOutput = appendSourceItemText(
      state.aggregatedCommandOutputBySourceItem,
      sourceId,
      delta
    )
    actions.push({ type: "append_text", id: streamId, text: delta })
    actions.push({
      type: "update",
      id: streamId,
      patch: {
        data: {
          output: aggregatedOutput,
          stdout: aggregatedOutput,
        },
      },
    })
    return actions
  }

  if (
    method === "item/commandExecution/terminalInteraction" ||
    method === "codex/event/terminal_interaction" ||
    method === "codex/event/exec_command_terminal_interaction"
  ) {
    const actions: StreamItemAction[] = []
    const sourceId = commandSourceKey(input.params, threadId, turnId)
    const streamId = ensureSourceItem(
      state,
      actions,
      sourceId,
      "command_execution",
      agentId,
      threadId,
      turnId,
      "Command",
      {
        command: codexCommandFromParams(input.params),
      }
    )
    setLatestCommandStreamByTurn(state, threadId, turnId, streamId)
    const paramsRecord = readObject(input.params)
    const stdin = readString(input.params?.stdin)
    const interactionText = readString(input.params?.text)
    const processId =
      readString(input.params?.processId) ??
      readString(paramsRecord?.process_id)
    if (stdin || interactionText) {
      const terminalInputLine = stdin
        ? `\n[stdin] ${stdin}\n`
        : `\n${interactionText}\n`
      const aggregatedOutput = appendSourceItemText(
        state.aggregatedCommandOutputBySourceItem,
        sourceId,
        terminalInputLine
      )
      actions.push({
        type: "append_text",
        id: streamId,
        text: terminalInputLine,
      })
      actions.push({
        type: "update",
        id: streamId,
        patch: {
          data: {
            lastTerminalInput: stdin,
            interaction: interactionText,
            output: aggregatedOutput,
            processId,
            stdin,
            stdout: aggregatedOutput,
            terminalInput: stdin,
          },
        },
      })
      return actions
    }
    if (processId) {
      actions.push({
        type: "update",
        id: streamId,
        patch: {
          data: {
            processId,
          },
        },
      })
    }
    return actions
  }

  if (method === "item/fileChange/outputDelta") {
    const actions: StreamItemAction[] = []
    const sourceId =
      readString(input.params?.itemId) ??
      threadScopedKey("file-change", threadId, turnId)
    const streamId = ensureSourceItem(
      state,
      actions,
      sourceId,
      "file_change",
      agentId,
      threadId,
      turnId,
      "File change"
    )
    const delta = codexTextFromParams(input.params)
    if (!delta) {
      return actions
    }
    const aggregatedDelta = appendSourceItemText(
      state.aggregatedFileChangeDeltaBySourceItem,
      sourceId,
      delta
    )
    actions.push({
      type: "update",
      id: streamId,
      patch: {
        data: {
          delta: aggregatedDelta,
          diff: aggregatedDelta,
          patch: aggregatedDelta,
        },
      },
    })
    return actions
  }

  if (method === "item/mcpToolCall/progress") {
    const actions: StreamItemAction[] = []
    const sourceId =
      readString(input.params?.itemId) ??
      threadScopedKey("mcp-tool", threadId, turnId)
    const streamId = ensureSourceItem(
      state,
      actions,
      sourceId,
      "mcp_tool_call",
      agentId,
      threadId,
      turnId,
      "MCP tool",
      {
        name: readString(input.params?.tool),
        server: readString(input.params?.server),
        toolName: readString(input.params?.tool),
      }
    )
    const progressDelta =
      readString(input.params?.message) ?? codexTextFromParams(input.params)
    if (!progressDelta) {
      return actions
    }
    const aggregatedProgress = appendSourceItemText(
      state.aggregatedMcpProgressBySourceItem,
      sourceId,
      progressDelta,
      "\n"
    )
    actions.push({
      type: "update",
      id: streamId,
      patch: {
        data: {
          message: progressDelta,
          progress: aggregatedProgress,
        },
      },
    })
    return actions
  }

  if (method === "codex/event/exec_command_end") {
    const sourceId = commandSourceKey(input.params, threadId, turnId)
    const streamId = state.sourceItemToStreamItem.get(sourceId)
    const status = codexStatusFromParams(input.params)
    const exitCode = codexExitCodeFromParams(input.params)
    const command = codexCommandFromParams(input.params)
    const aggregatedOutput =
      state.aggregatedCommandOutputBySourceItem.get(sourceId)
    const completionText = [
      status ? `status=${status}` : undefined,
      typeof exitCode === "number" ? `exit=${exitCode}` : undefined,
    ]
      .filter(Boolean)
      .join(" ")
    const actions: StreamItemAction[] = []
    let targetId = streamId
    if (!targetId) {
      if (!(command || aggregatedOutput)) {
        return []
      }
      const created = createCodexItem(state, "command_execution", {
        agentId,
        itemId: sourceId,
        text: command ? `$ ${command}\n` : undefined,
        threadId,
        title: "Command",
        turnId,
        data: {
          ...(command ? { command } : {}),
        },
      })
      targetId = created.id
      state.sourceItemToStreamItem.set(sourceId, targetId)
      actions.push(created.action)
    }
    setLatestCommandStreamByTurn(state, threadId, turnId, targetId)
    if (completionText) {
      actions.push({
        type: "append_text",
        id: targetId,
        text: `\n${completionText}\n`,
      })
    }
    actions.push({
      type: "complete",
      id: targetId,
      patch: {
        data: {
          exitCode,
          output: aggregatedOutput,
          status,
        },
      },
    })
    state.aggregatedCommandOutputBySourceItem.delete(sourceId)
    clearLatestCommandStreamByTurnIfMatch(state, threadId, turnId, targetId)
    return actions
  }

  if (method === "item/completed") {
    const actions: StreamItemAction[] = []
    const threadItemId = readThreadItemId(input.params)
    const threadItem = readObject(input.params?.item)
    const threadItemType = readString(threadItem?.type)
    const completionStatus = completionStatusFromCodexStatus(
      readString(threadItem?.status) ?? codexStatusFromParams(input.params)
    )
    const completionData = threadItem
      ? completionDataForThreadItem(threadItem, threadItemType)
      : undefined
    const activeMessageId =
      state.activeMessageByThread.get(threadKey) ??
      state.activeMessageByThreadOnly.get(threadOnlyMessageKey)
    let completedTargetItem = false

    if (threadItemId) {
      const mapped = state.sourceItemToStreamItem.get(threadItemId)
      if (mapped) {
        const completionAction: Extract<
          StreamItemAction,
          { type: "complete" }
        > = {
          type: "complete",
          id: mapped,
        }
        if (completionStatus) {
          completionAction.status = completionStatus
        }
        if (completionData) {
          completionAction.patch = {
            data: completionData,
          }
        }
        actions.push(completionAction)
        completedTargetItem = true
        if (activeMessageId === mapped) {
          const completedMessageText = aggregatedMessageTextForStreamId(
            state,
            mapped
          )
          const completedMessageRole = state.messageRoleByStreamId.get(mapped)
          if (completedMessageText && completedMessageRole) {
            setRecentCompletedMessageForKeys(state, threadId, turnId, {
              id: mapped,
              role: completedMessageRole,
              text: dedupeTextKey(completedMessageText),
              timestamp: now(),
            })
          }
          clearAggregatedMessageTextByStreamId(state, mapped)
          clearActiveMessageReferencesById(state, mapped)
          clearAggregatedMessageTextForKeys(state, threadId, turnId)
        }
        if (threadItemType === "commandExecution") {
          clearLatestCommandStreamByTurnIfMatch(state, threadId, turnId, mapped)
        }
      } else if (threadItem) {
        const completedType = mapCodexThreadItemType(threadItemType)
        const created = createCodexItem(state, completedType, {
          agentId,
          data: completionData,
          itemId: threadItemId,
          status: completionStatus ?? "complete",
          text: extractThreadItemText(threadItem) || undefined,
          threadId,
          title: threadItemType,
          turnId,
        })
        actions.push(created.action)
        state.sourceItemToStreamItem.set(threadItemId, created.id)
        completedTargetItem = true
        if (threadItemType === "commandExecution") {
          clearLatestCommandStreamByTurnIfMatch(
            state,
            threadId,
            turnId,
            created.id
          )
        }
      }
      state.aggregatedCommandOutputBySourceItem.delete(threadItemId)
      state.aggregatedFileChangeDeltaBySourceItem.delete(threadItemId)
      state.aggregatedMcpProgressBySourceItem.delete(threadItemId)
    }

    if (activeMessageId && !completedTargetItem) {
      const completedMessageText = aggregatedMessageTextForStreamId(
        state,
        activeMessageId
      )
      const completedMessageRole =
        state.messageRoleByStreamId.get(activeMessageId)
      if (completedMessageText && completedMessageRole) {
        setRecentCompletedMessageForKeys(state, threadId, turnId, {
          id: activeMessageId,
          role: completedMessageRole,
          text: dedupeTextKey(completedMessageText),
          timestamp: now(),
        })
      }
      actions.push({ type: "complete", id: activeMessageId })
      clearAggregatedMessageTextByStreamId(state, activeMessageId)
      clearActiveMessageReferencesById(state, activeMessageId)
      clearAggregatedMessageTextForKeys(state, threadId, turnId)
    }

    return actions
  }

  if (method === "error") {
    const created = createCodexItem(state, "error", {
      agentId,
      status: "error",
      text: codexTextFromParams(input.params) || stringifyUnknown(input.params),
      threadId,
      turnId,
    })
    return [created.action]
  }

  if (method === "turn/completed") {
    const status = codexStatusFromParams(input.params)
    if (status !== "failed") {
      return []
    }
    const created = createCodexItem(state, "error", {
      agentId,
      status: "error",
      text: "Turn failed",
      threadId,
      turnId,
      data: {
        params: readObject(input.params),
      },
    })
    return [created.action]
  }

  if (method === "codex/event/task_complete" || method === "thread/archived") {
    const created = createCodexItem(state, "turn_complete", {
      agentId,
      status: "complete",
      text: method === "thread/archived" ? "Thread archived" : "Task complete",
      threadId,
      turnId,
    })
    return [created.action]
  }

  if (method === "turn/diff/updated") {
    const diff = readString(readObject(input.params)?.diff) ?? ""
    const created = createCodexItem(state, "turn_diff", {
      agentId,
      status: "complete",
      threadId,
      turnId,
      data: {
        diff,
        label: "Turn Diff",
      },
    })
    return [created.action]
  }

  if (method === "model/rerouted") {
    const model = readString(input.params?.model) ?? "unknown"
    const created = createCodexItem(state, "status", {
      agentId,
      status: "complete",
      text: `Model rerouted to: ${model}`,
      threadId,
      turnId,
      data: {
        model,
      },
    })
    return [created.action]
  }

  if (method === "deprecationNotice") {
    const message = readString(input.params?.message) ?? "Deprecation notice"
    const created = createCodexItem(state, "status", {
      agentId,
      status: "complete",
      text: message,
      threadId,
      turnId,
      data: {
        level: "warning",
      },
    })
    return [created.action]
  }

  if (method === "configWarning") {
    const message = readString(input.params?.message) ?? "Configuration warning"
    const created = createCodexItem(state, "status", {
      agentId,
      status: "complete",
      text: message,
      threadId,
      turnId,
      data: {
        level: "warning",
      },
    })
    return [created.action]
  }

  if (method === "thread/unarchived") {
    const created = createCodexItem(state, "status", {
      agentId,
      status: "complete",
      text: "Thread unarchived",
      threadId,
      turnId,
    })
    return [created.action]
  }

  if (
    method === "thread/name/updated" ||
    method === "thread/tokenUsage/updated" ||
    method === "account/rateLimits/updated" ||
    method === "codex/event/token_count" ||
    method === "turn/started" ||
    method === "thread/started" ||
    method === "codex/event/collab_agent_spawn_begin" ||
    method === "codex/event/collab_agent_spawn_end" ||
    method === "codex/event/mcp_startup_update" ||
    method === "codex/event/mcp_startup_complete" ||
    method === "codex/event/shutdown_complete"
  ) {
    return []
  }

  const created = createCodexItem(state, "raw_item", {
    agentId,
    status: "complete",
    threadId,
    title: method,
    turnId,
    data: {
      method,
      params: input.params,
      requestId: input.id,
    },
  })
  return [created.action]
}
