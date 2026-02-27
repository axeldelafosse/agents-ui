import type { Agent, Protocol } from "./types"
import type { StreamItem } from "@axel-delafosse/protocol/stream-items"

const CHAT_CAPTURE_STORAGE_KEY = "agents-ui:chat-captures:v1"
const MAX_CHAT_CAPTURES = 8
const MAX_CAPTURE_EVENTS = 3000
const MAX_CAPTURE_STREAM_ITEMS = 1200
const MAX_CAPTURE_PAYLOAD_CHARS = 20_000
const MAX_CAPTURE_OUTPUT_CHARS = 120_000

type WsFrameDirection = "in" | "out"

export interface WsCaptureEvent {
  agentId?: string
  connectionId?: string
  direction: WsFrameDirection
  payload: string
  protocol: Protocol
  timestamp: number
  url: string
}

export interface CapturedAgentSnapshot {
  id: string
  output: string
  protocol: Protocol
  sessionId?: string
  status: Agent["status"]
  streamItems: StreamItem[]
  threadId?: string
  threadName?: string
  url: string
}

export interface ChatCaptureSnapshot {
  agents: CapturedAgentSnapshot[]
  createdAt: number
  events: WsCaptureEvent[]
  id: string
}

const isBrowser = (): boolean => typeof window !== "undefined"

const truncateText = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) {
    return value
  }
  return `${value.slice(0, maxChars)}\n...[truncated]`
}

const trimFromFront = <T>(items: readonly T[], max: number): T[] => {
  if (items.length <= max) {
    return [...items]
  }
  return items.slice(items.length - max)
}

const cloneJson = <T>(value: T): T => {
  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    return value
  }
}

const sanitizeStreamItems = (items: readonly StreamItem[]): StreamItem[] =>
  trimFromFront(items, MAX_CAPTURE_STREAM_ITEMS).map((item) => ({
    ...item,
    data: cloneJson(item.data),
  }))

const sanitizeEvents = (events: readonly WsCaptureEvent[]): WsCaptureEvent[] =>
  trimFromFront(events, MAX_CAPTURE_EVENTS).map((event) => ({
    ...event,
    payload: truncateText(event.payload, MAX_CAPTURE_PAYLOAD_CHARS),
  }))

const sanitizeAgents = (agents: readonly Agent[]): CapturedAgentSnapshot[] =>
  agents
    .filter(
      (agent) =>
        agent.streamItems.length > 0 ||
        (agent.output && agent.output.length > 0)
    )
    .map((agent) => ({
      id: agent.id,
      output: truncateText(agent.output, MAX_CAPTURE_OUTPUT_CHARS),
      protocol: agent.protocol,
      sessionId: agent.sessionId,
      status: agent.status,
      streamItems: sanitizeStreamItems(agent.streamItems),
      threadId: agent.threadId,
      threadName: agent.threadName,
      url: agent.url,
    }))

const captureId = (now: number): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID()
  }
  return `capture-${now}`
}

const parseStoredCaptures = (
  rawValue: string | null
): ChatCaptureSnapshot[] => {
  if (!rawValue) {
    return []
  }
  try {
    const parsed = JSON.parse(rawValue) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((entry): entry is ChatCaptureSnapshot => {
      if (typeof entry !== "object" || !entry) {
        return false
      }
      const maybeCapture = entry as Partial<ChatCaptureSnapshot>
      return (
        typeof maybeCapture.id === "string" &&
        typeof maybeCapture.createdAt === "number" &&
        Array.isArray(maybeCapture.events) &&
        Array.isArray(maybeCapture.agents)
      )
    })
  } catch {
    return []
  }
}

export const listChatCaptures = (): ChatCaptureSnapshot[] => {
  if (!isBrowser()) {
    return []
  }
  return parseStoredCaptures(localStorage.getItem(CHAT_CAPTURE_STORAGE_KEY))
}

export const latestChatCapture = (): ChatCaptureSnapshot | undefined =>
  listChatCaptures()[0]

export const storeChatCapture = (
  agents: readonly Agent[],
  events: readonly WsCaptureEvent[]
): ChatCaptureSnapshot | undefined => {
  if (!isBrowser()) {
    return undefined
  }

  const now = Date.now()
  const snapshot: ChatCaptureSnapshot = {
    agents: sanitizeAgents(agents),
    createdAt: now,
    events: sanitizeEvents(events),
    id: captureId(now),
  }

  if (snapshot.agents.length === 0 && snapshot.events.length === 0) {
    return undefined
  }

  const existing = listChatCaptures()
  const next = [snapshot, ...existing].slice(0, MAX_CHAT_CAPTURES)
  try {
    localStorage.setItem(CHAT_CAPTURE_STORAGE_KEY, JSON.stringify(next))
    return snapshot
  } catch {
    return undefined
  }
}
