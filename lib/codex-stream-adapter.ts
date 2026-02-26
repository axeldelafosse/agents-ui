import {
  type CodexRpcParams,
  codexCommandFromParams,
  codexExitCodeFromParams,
  codexStatusFromParams,
  codexThreadIdFromParams,
  codexTurnIdFromParams,
} from "@/lib/codex-rpc"
import type {
  StreamItem,
  StreamItemAction,
  StreamItemData,
  StreamItemStatus,
  StreamItemType,
} from "@/lib/stream-items"
import {
  codexTextFromParams,
  codexTextFromRawParams,
} from "@/lib/stream-parsing"

export interface CodexStreamAdapterInput {
  agentId?: string
  id?: number | string
  method?: string
  params?: CodexRpcParams
}

export interface CodexStreamAdapterState {
  activeMessageByThread: Map<string, string>
  aggregatedCommandOutputBySourceItem: Map<string, string>
  aggregatedFileChangeDeltaBySourceItem: Map<string, string>
  aggregatedMcpProgressBySourceItem: Map<string, string>
  nextId: number
  sourceItemToStreamItem: Map<string, string>
}

type StreamItemCompletionStatus = Extract<
  StreamItemStatus,
  "complete" | "error"
>

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

function threadScopedKey(
  prefix: string,
  threadId?: string,
  turnId?: string
): string {
  return `${prefix}:${threadId ?? "-"}:${turnId ?? "-"}`
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
  switch (threadItemType) {
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
    readString(paramsRecord?.call_id)
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

function extractThreadItemText(threadItem: Record<string, unknown>): string {
  const type = readString(threadItem.type)
  if (type === "agentMessage" || type === "plan") {
    return readString(threadItem.text) ?? ""
  }
  if (type === "reasoning") {
    const summary = readArray(threadItem.summary)
      .map((part) => readString(part) ?? "")
      .filter(Boolean)
      .join("\n")
    if (summary) {
      return summary
    }
    const content = readArray(threadItem.content)
      .map((part) => readString(part) ?? "")
      .filter(Boolean)
      .join("\n")
    return content
  }
  if (type === "commandExecution") {
    const command = readString(threadItem.command)
    const output = readString(threadItem.aggregatedOutput)
    if (command && output) {
      return `$ ${command}\n${output}`
    }
    return output ?? (command ? `$ ${command}` : "")
  }
  if (type === "webSearch") {
    return readString(threadItem.query) ?? ""
  }
  if (type === "imageView") {
    return readString(threadItem.path) ?? ""
  }
  if (type === "enteredReviewMode" || type === "exitedReviewMode") {
    return readString(threadItem.review) ?? ""
  }
  return ""
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
    aggregatedCommandOutputBySourceItem: new Map<string, string>(),
    aggregatedFileChangeDeltaBySourceItem: new Map<string, string>(),
    aggregatedMcpProgressBySourceItem: new Map<string, string>(),
    nextId: 0,
    sourceItemToStreamItem: new Map<string, string>(),
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: adapter keeps event mapping local and explicit
export function adaptCodexMessageToStreamItems(
  state: CodexStreamAdapterState,
  input: CodexStreamAdapterInput
): StreamItemAction[] {
  const method = input.method
  if (!method) {
    return []
  }

  const threadId = codexThreadIdFromParams(input.params)
  const turnId = codexTurnIdFromParams(input.params)
  const threadKey = threadScopedKey("msg", threadId, turnId)
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

  if (method === "item/started" || method === "codex/event/item_started") {
    const threadItem = readObject(input.params?.item)
    if (!threadItem) {
      return []
    }
    const threadItemId = readString(threadItem.id)
    const threadItemType = readString(threadItem.type)
    const itemType = mapCodexThreadItemType(threadItemType)
    const itemText = extractThreadItemText(threadItem)
    const normalizedData = normalizeThreadItemData(threadItem, threadItemType)
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
      if (threadItemType === "commandExecution") {
        const output = readString(threadItem.aggregatedOutput)
        if (output) {
          state.aggregatedCommandOutputBySourceItem.set(threadItemId, output)
        }
      } else if (threadItemType === "fileChange") {
        const delta =
          readString(threadItem.delta) ?? readString(threadItem.patch)
        if (delta) {
          state.aggregatedFileChangeDeltaBySourceItem.set(threadItemId, delta)
        }
      } else if (threadItemType === "mcpToolCall") {
        const progress = readString(threadItem.message)
        if (progress) {
          state.aggregatedMcpProgressBySourceItem.set(threadItemId, progress)
        }
      }
    }
    if (itemType === "message") {
      state.activeMessageByThread.set(threadKey, created.id)
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
    method === "item/reasoning/textDelta" ||
    method === "codex/event/agent_reasoning_delta" ||
    method === "codex/event/reasoning_content_delta"
  ) {
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
    const delta = codexTextFromParams(input.params)
    if (!delta) {
      return actions
    }
    actions.push({ type: "append_text", id: streamId, text: delta })
    return actions
  }

  if (
    method === "item/reasoning/summaryPartAdded" ||
    method === "codex/event/agent_reasoning_section_break"
  ) {
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
    method === "codex/event/agent_message_delta" ||
    method === "codex/event/agent_message_content_delta" ||
    method === "codex/event/agent_message" ||
    method === "codex/event/raw_response_item" ||
    method === "codex/event/user_message"
  ) {
    const isRawResponseItem = method === "codex/event/raw_response_item"
    const text = isRawResponseItem
      ? codexTextFromRawParams(input.params) ||
        codexTextFromParams(input.params)
      : codexTextFromParams(input.params)
    if (!text) {
      if (isRawResponseItem) {
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
      return []
    }

    const actions: StreamItemAction[] = []
    let streamId = state.activeMessageByThread.get(threadKey)
    if (!streamId) {
      const created = createCodexItem(state, "message", {
        agentId,
        threadId,
        turnId,
      })
      streamId = created.id
      state.activeMessageByThread.set(threadKey, streamId)
      actions.push(created.action)
    }

    actions.push({ type: "append_text", id: streamId, text })

    if (
      method === "codex/event/agent_message" ||
      isRawResponseItem ||
      method === "codex/event/user_message"
    ) {
      actions.push({ type: "complete", id: streamId })
      state.activeMessageByThread.delete(threadKey)
    }

    return actions
  }

  if (method === "codex/event/exec_command_begin") {
    const command =
      codexCommandFromParams(input.params) ?? "(command unavailable)"
    const sourceId = commandSourceKey(input.params, threadId, turnId)
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
    const completionText = [
      status ? `status=${status}` : undefined,
      typeof exitCode === "number" ? `exit=${exitCode}` : undefined,
    ]
      .filter(Boolean)
      .join(" ")
    const actions: StreamItemAction[] = []
    let targetId = streamId
    if (!targetId) {
      const command =
        codexCommandFromParams(input.params) ?? "(command unavailable)"
      const created = createCodexItem(state, "command_execution", {
        agentId,
        itemId: sourceId,
        text: `$ ${command}\n`,
        threadId,
        title: "Command",
        turnId,
        data: { command },
      })
      targetId = created.id
      state.sourceItemToStreamItem.set(sourceId, targetId)
      actions.push(created.action)
    }
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
          output: state.aggregatedCommandOutputBySourceItem.get(sourceId),
          status,
        },
      },
    })
    state.aggregatedCommandOutputBySourceItem.delete(sourceId)
    return actions
  }

  if (
    method === "item/completed" ||
    method === "codex/event/item_completed" ||
    method === "rawResponseItem/completed"
  ) {
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
    const activeMessageId = state.activeMessageByThread.get(threadKey)
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
          state.activeMessageByThread.delete(threadKey)
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
      }
      state.aggregatedCommandOutputBySourceItem.delete(threadItemId)
      state.aggregatedFileChangeDeltaBySourceItem.delete(threadItemId)
      state.aggregatedMcpProgressBySourceItem.delete(threadItemId)
    }

    if (activeMessageId && !completedTargetItem) {
      actions.push({ type: "complete", id: activeMessageId })
      state.activeMessageByThread.delete(threadKey)
    }

    if (actions.length === 0 && method === "rawResponseItem/completed") {
      const created = createCodexItem(state, "raw_item", {
        agentId,
        status: completionStatus ?? "complete",
        threadId,
        title: method,
        turnId,
        data: {
          method,
          params: input.params,
        },
      })
      actions.push(created.action)
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

const _globalCodexAdapterStates = new Map<string, CodexStreamAdapterState>()

export function clearCodexStreamAdapterState(agentId?: string): void {
  if (!agentId) {
    _globalCodexAdapterStates.clear()
    return
  }
  _globalCodexAdapterStates.delete(agentId)
}

export function adaptCodexStreamMessage(
  msg: { method?: string; params?: CodexRpcParams; id?: number | string },
  agentId?: string
): StreamItemAction[] {
  const key = agentId ?? "_default"
  let state = _globalCodexAdapterStates.get(key)
  if (!state) {
    state = createCodexStreamAdapterState()
    _globalCodexAdapterStates.set(key, state)
  }
  return adaptCodexMessageToStreamItems(state, {
    ...msg,
    agentId,
  })
}
