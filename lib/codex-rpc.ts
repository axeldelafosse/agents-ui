import type {
  EventMsg,
  InitializeResponse,
  ServerNotification,
} from "@/codex-app-server-schemas"
import type { JsonValue } from "@/codex-app-server-schemas/serde_json/JsonValue"
import type { ThreadLoadedListResponse } from "@/codex-app-server-schemas/v2/ThreadLoadedListResponse"
import type { ThreadReadResponse } from "@/codex-app-server-schemas/v2/ThreadReadResponse"
import type { ThreadStartResponse } from "@/codex-app-server-schemas/v2/ThreadStartResponse"
import type { TurnStartResponse } from "@/codex-app-server-schemas/v2/TurnStartResponse"

type CodexLegacyEventType = EventMsg["type"]

type CodexLegacyEventNotification = {
  [T in CodexLegacyEventType]: {
    method: `codex/event/${T}`
    params: Omit<Extract<EventMsg, { type: T }>, "type">
  }
}[CodexLegacyEventType]

type CodexApprovalNotification =
  | {
      method: "item/commandExecution/requestApproval"
      params: Record<string, unknown>
    }
  | {
      method: "item/fileChange/requestApproval"
      params: Record<string, unknown>
    }
  | { method: "item/tool/requestUserInput"; params: Record<string, unknown> }
  | {
      method: "item/commandExecution/terminalInteraction"
      params: Record<string, unknown>
    }
  | { method: "item/fileChange/outputDelta"; params: Record<string, unknown> }
  | { method: "item/mcpToolCall/progress"; params: Record<string, unknown> }

type CodexAdditionalNotification =
  | { method: "turn/diff/updated"; params: Record<string, unknown> }
  | { method: "model/rerouted"; params: Record<string, unknown> }
  | { method: "deprecationNotice"; params: Record<string, unknown> }
  | { method: "configWarning"; params: Record<string, unknown> }
  | { method: "thread/unarchived"; params: Record<string, unknown> }
  | { method: "thread/status/changed"; params: Record<string, unknown> }
  | { method: "thread/closed"; params: Record<string, unknown> }

export type CodexKnownNotification =
  | ServerNotification
  | CodexLegacyEventNotification
  | CodexApprovalNotification
  | CodexAdditionalNotification

export type CodexKnownMethod = CodexKnownNotification["method"]

type CodexParamCompatibility = {
  argv?: string | string[]
  args?: string | string[]
  command?: string | string[]
  commandLine?: string | string[]
  cmd?: string | string[]
  conversation?: { id?: string }
  conversationId?: string
  conversation_id?: string
  content?: JsonValue
  data?: JsonValue
  delta?: JsonValue
  event?: JsonValue
  exitCode?: number | string
  exit_code?: number | string
  id?: string
  input?: JsonValue
  item?: JsonValue
  message?: JsonValue
  msg?: JsonValue
  payload?: JsonValue
  response?: JsonValue
  status?: string
  summaryText?: JsonValue
  summary_text?: JsonValue
  text?: JsonValue
  thread?: { id?: string; preview?: string }
  threadId?: string
  threadName?: string | null
  thread_id?: string
  thread_name?: string | null
  turn?: { id?: string }
  turnId?: string
  turn_id?: string
} & Record<string, unknown>

export type CodexRpcParams = (
  | CodexKnownNotification["params"]
  | Record<string, unknown>
) &
  CodexParamCompatibility

type CodexResultCompatibility = {
  data?: string[]
  id?: string
  nextCursor?: string | null
  thread?: { id?: string; preview?: string }
  turn?: { id?: string }
} & Record<string, unknown>

type CodexKnownResult =
  | InitializeResponse
  | ThreadLoadedListResponse
  | ThreadReadResponse
  | ThreadStartResponse
  | TurnStartResponse

export type CodexRpcResult = (CodexKnownResult | Record<string, unknown>) &
  CodexResultCompatibility

export interface CodexRpcMessage {
  id?: number
  method?: CodexKnownMethod | string
  params?: CodexRpcParams
  result?: CodexRpcResult
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed || undefined
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

function normalizeCommand(
  command: string | string[] | undefined
): string | undefined {
  if (!command) {
    return undefined
  }
  if (typeof command === "string") {
    const trimmed = command.trim()
    return trimmed || undefined
  }
  const joined = command.join(" ").trim()
  return joined || undefined
}

function normalizeUnknownCommand(value: unknown): string | undefined {
  if (typeof value === "string") {
    return normalizeCommand(value)
  }
  if (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string")
  ) {
    return normalizeCommand(value)
  }
  return undefined
}

function readCommandLikeField(
  params: CodexRpcParams | undefined,
  key: string
): string | undefined {
  if (!params) {
    return undefined
  }
  const record = params as Record<string, unknown>
  return normalizeUnknownCommand(record[key])
}

export function codexIdFromParams(params?: CodexRpcParams): string | undefined {
  return readTrimmedString(params?.id)
}

export function codexTurnIdFromParams(
  params?: CodexRpcParams
): string | undefined {
  return (
    readTrimmedString(params?.turnId) ??
    readTrimmedString(params?.turn_id) ??
    readTrimmedString(params?.turn?.id)
  )
}

export function codexThreadIdFromParams(
  params?: CodexRpcParams
): string | undefined {
  return (
    readTrimmedString(params?.threadId) ??
    readTrimmedString(params?.thread_id) ??
    readTrimmedString(params?.thread?.id) ??
    readTrimmedString(params?.conversationId) ??
    readTrimmedString(params?.conversation_id) ??
    readTrimmedString(params?.conversation?.id)
  )
}

export function codexThreadNameFromParams(
  params?: CodexRpcParams
): string | undefined {
  const camel = params?.threadName
  if (typeof camel === "string" && camel.trim()) {
    return camel.trim()
  }
  const snake = params?.thread_name
  if (typeof snake === "string" && snake.trim()) {
    return snake.trim()
  }
  return undefined
}

export function codexCommandFromParams(
  params?: CodexRpcParams
): string | undefined {
  return (
    normalizeCommand(params?.command) ??
    normalizeCommand(params?.cmd) ??
    normalizeCommand(params?.args) ??
    normalizeCommand(params?.argv) ??
    normalizeCommand(params?.commandLine) ??
    readCommandLikeField(params, "command_line") ??
    readCommandLikeField(params, "line") ??
    readCommandLikeField(params, "input")
  )
}

export function codexStatusFromParams(
  params?: CodexRpcParams
): string | undefined {
  return readTrimmedString(params?.status)
}

export function codexExitCodeFromParams(
  params?: CodexRpcParams
): number | undefined {
  return readNumber(params?.exitCode) ?? readNumber(params?.exit_code)
}

export function codexThreadIdFromResult(
  result?: CodexRpcResult
): string | undefined {
  return readTrimmedString(result?.thread?.id) ?? readTrimmedString(result?.id)
}

export function codexTurnIdFromResult(
  result?: CodexRpcResult
): string | undefined {
  return readTrimmedString(result?.turn?.id) ?? readTrimmedString(result?.id)
}

export function codexLoadedThreadIdsFromResult(
  result?: CodexRpcResult
): string[] {
  if (!Array.isArray(result?.data)) {
    return []
  }
  return result.data.filter(
    (value): value is string => typeof value === "string"
  )
}

export function codexThreadPreviewFromResult(
  result?: CodexRpcResult
): string | undefined {
  return readTrimmedString(result?.thread?.preview)
}
