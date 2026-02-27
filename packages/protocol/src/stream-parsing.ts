import type { CodexRpcParams } from "@axel-delafosse/protocol/codex-rpc"

export type CodexTextParams = CodexRpcParams

export interface ClaudeMessageContentBlock {
  content?: unknown
  input?: unknown
  name?: string
  text?: string
  type?: string
}

export interface ClaudeDelta {
  partial_json?: string
  text?: string
  thinking?: string
  type?: string
}

export interface ClaudeStreamEvent {
  content_block?: { type?: string; name?: string }
  content_block_index?: number
  delta?: ClaudeDelta
  index?: number
  type?: string
}

export interface ClaudeStreamMessage {
  content_block_index?: number
  delta?: ClaudeDelta
  event?: ClaudeStreamEvent
  index?: number
  type?: string
}

export interface ClaudeSessionMessage {
  data?: unknown
  session_id?: string
  sessionId?: string
  subtype?: string
  type?: string
}

const STREAM_NEWLINE_REGEX = /\r\n?/g
const TRAILING_CR_REGEX = /\r$/
const OPAQUE_TOKEN_REGEX = /^[A-Za-z0-9+/_=-]+$/
const RAW_TEXT_TOKEN_SPLIT_REGEX = /\s+/
const RAW_TEXT_PART_TYPES = new Set(["output_text", "input_text", "text"])
const RAW_MSG_ORDERED_KEYS = [
  "msg",
  "delta",
  "text",
  "summaryText",
  "summary_text",
  "output_text",
  "input_text",
  "content",
  "message",
  "msg",
  "item",
  "event",
  "payload",
  "response",
  "data",
] as const

export const CLAUDE_STREAM_EVENT_TYPES = [
  "message_start",
  "message_stop",
  "content_block_start",
  "content_block_delta",
  "content_block_stop",
] as const

export type ClaudeStreamEventType = (typeof CLAUDE_STREAM_EVENT_TYPES)[number]

export function readNestedCodexText(value: unknown): string {
  if (typeof value === "string") {
    return value
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = readNestedCodexText(item)
      if (nested) {
        return nested
      }
    }
    return ""
  }
  if (typeof value !== "object" || value === null) {
    return ""
  }

  const record = value as Record<string, unknown>
  const preferredKeys = ["delta", "text", "content", "summaryText", "message"]
  for (const key of preferredKeys) {
    const nested = readNestedCodexText(record[key])
    if (nested) {
      return nested
    }
  }
  for (const nestedValue of Object.values(record)) {
    const nested = readNestedCodexText(nestedValue)
    if (nested) {
      return nested
    }
  }
  return ""
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined
  }
  return value as Record<string, unknown>
}

function looksOpaqueToken(token: string): boolean {
  if (token.length < 80) {
    return false
  }
  if (token.startsWith("gAAAAA")) {
    return true
  }
  return OPAQUE_TOKEN_REGEX.test(token)
}

function sanitizeRawText(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) {
    return ""
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return codexTextFromRawMsg(JSON.parse(trimmed))
    } catch {
      // fall through to token filtering
    }
  }
  const cleanedTokens = trimmed
    .split(RAW_TEXT_TOKEN_SPLIT_REGEX)
    .filter((token) => !looksOpaqueToken(token))
  return cleanedTokens.join(" ").trim()
}

function codexTextFromRawContentParts(content: unknown): string {
  if (!Array.isArray(content)) {
    return ""
  }
  for (const part of content) {
    const partRecord = asRecord(part)
    if (!partRecord) {
      continue
    }
    const partType = partRecord.type
    if (
      typeof partType !== "string" ||
      !RAW_TEXT_PART_TYPES.has(partType as string)
    ) {
      continue
    }
    const nested =
      codexTextFromRawMsg(partRecord.text) ||
      codexTextFromRawMsg(partRecord.content) ||
      codexTextFromRawMsg(partRecord.value)
    if (nested) {
      return nested
    }
  }
  return ""
}

function codexTextFromRawRecord(record: Record<string, unknown>): string {
  for (const key of RAW_MSG_ORDERED_KEYS) {
    const nested = codexTextFromRawMsg(record[key])
    if (nested) {
      return nested
    }
  }
  return codexTextFromRawContentParts(record.content)
}

function readSessionField(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed || undefined
}

function readSessionId(value: unknown): string | undefined {
  const record = asRecord(value)
  if (!record) {
    return undefined
  }
  return (
    readSessionField(record.session_id) ?? readSessionField(record.sessionId)
  )
}

function readDeepSessionId(
  value: unknown,
  visited: Set<object>,
  depth = 0
): string | undefined {
  if (depth > 8) {
    return undefined
  }
  const direct = readSessionId(value)
  if (direct) {
    return direct
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = readDeepSessionId(item, visited, depth + 1)
      if (nested) {
        return nested
      }
    }
    return undefined
  }

  const record = asRecord(value)
  if (!record) {
    return undefined
  }
  if (visited.has(record)) {
    return undefined
  }
  visited.add(record)

  const preferred = ["data", "payload", "message", "event", "item", "result"]
  for (const key of preferred) {
    const nested = readDeepSessionId(record[key], visited, depth + 1)
    if (nested) {
      return nested
    }
  }
  for (const nestedValue of Object.values(record)) {
    const nested = readDeepSessionId(nestedValue, visited, depth + 1)
    if (nested) {
      return nested
    }
  }

  return undefined
}

export function unwrapClaudeRawMessage(
  message: ClaudeSessionMessage
): ClaudeSessionMessage {
  let current: ClaudeSessionMessage = message
  for (let depth = 0; depth < 4; depth += 1) {
    if (current.type !== "raw") {
      break
    }
    const record = asRecord(current.data)
    if (!record) {
      break
    }
    current = record as ClaudeSessionMessage
  }
  return current
}

export function claudeSessionId(
  message: ClaudeSessionMessage
): string | undefined {
  const normalized = unwrapClaudeRawMessage(message)
  const visited = new Set<object>()
  return (
    readDeepSessionId(normalized, visited) ??
    readDeepSessionId(message, visited)
  )
}

export function isClaudeInitMessage(message: ClaudeSessionMessage): boolean {
  const normalized = unwrapClaudeRawMessage(message)
  if (normalized.type === "system/init" || normalized.type === "init") {
    return true
  }
  return normalized.type === "system" && normalized.subtype === "init"
}

export function codexTextFromParams(params?: CodexTextParams): string {
  if (!params) {
    return ""
  }
  const orderedValues = [
    params.delta,
    params.text,
    params.content,
    params.summaryText,
    params.input,
    params.message,
    params.response,
    params.payload,
    params.event,
    params.item,
    params.data,
  ]
  for (const value of orderedValues) {
    const text = readNestedCodexText(value)
    if (text) {
      return text
    }
  }
  return ""
}

function codexTextFromRawMsg(value: unknown): string {
  if (typeof value === "string") {
    return sanitizeRawText(value)
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = codexTextFromRawMsg(item)
      if (nested) {
        return nested
      }
    }
    return ""
  }
  if (typeof value !== "object" || value === null) {
    return ""
  }

  const record = asRecord(value)
  if (!record) {
    return ""
  }
  return codexTextFromRawRecord(record)
}

export function codexTextFromRawParams(params?: CodexTextParams): string {
  if (!params) {
    return ""
  }
  return codexTextFromRawMsg(params.msg)
}

export function claudeDeltaText(delta?: ClaudeDelta): string {
  if (!delta) {
    return ""
  }
  if (delta.type === "input_json_delta") {
    return ""
  }
  if (typeof delta.thinking === "string") {
    return delta.thinking
  }
  if (typeof delta.text === "string") {
    return delta.text
  }
  return ""
}

export function isClaudeStreamEventType(
  type?: string
): type is ClaudeStreamEventType {
  if (!type) {
    return false
  }
  return CLAUDE_STREAM_EVENT_TYPES.some((value) => value === type)
}

export function toClaudeStreamEvent(
  msg: ClaudeStreamMessage
): ClaudeStreamEvent | undefined {
  if (msg.type === "stream_event") {
    return msg.event ?? msg
  }
  if (isClaudeStreamEventType(msg.type)) {
    return msg
  }
  return undefined
}

export function claudeBlockIndex(event: {
  index?: number
  content_block_index?: number
}): number | undefined {
  if (typeof event.index === "number") {
    return event.index
  }
  if (typeof event.content_block_index === "number") {
    return event.content_block_index
  }
  return undefined
}

export function bufferNdjsonChunk(
  raw: string,
  carry: string
): { carry: string; lines: string[] } {
  const combined = `${carry}${raw}`
  const parts = combined.split("\n")
  const tail = parts.pop()?.replace(TRAILING_CR_REGEX, "") ?? ""
  const lines = parts.map((line) => line.replace(TRAILING_CR_REGEX, ""))

  if (!tail.trim()) {
    return { lines, carry: "" }
  }

  try {
    JSON.parse(tail)
    lines.push(tail)
    return { lines, carry: "" }
  } catch {
    return { lines, carry: tail }
  }
}

export function normalizeStreamText(text: string): string {
  return text.replace(STREAM_NEWLINE_REGEX, "\n")
}

export function claudeCompletedText(
  blocks?: ClaudeMessageContentBlock[]
): string {
  if (!Array.isArray(blocks)) {
    return ""
  }
  const chunks: string[] = []
  for (const block of blocks) {
    if (
      (block.type === "text" || block.type === "thinking") &&
      typeof block.text === "string"
    ) {
      chunks.push(block.text)
    }
  }
  return chunks.join("\n\n")
}

export function appendPrettyMessageBoundary(output: string): string {
  if (!output || output.endsWith("\n\n")) {
    return output
  }
  if (output.endsWith("\n")) {
    return `${output}\n`
  }
  return `${output}\n\n`
}
