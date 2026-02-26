"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  latestChatCapture,
  storeChatCapture,
  type WsCaptureEvent,
} from "@/app/features/agents/capture"
import {
  DEBUG_EVENT_LIMIT,
  DISCOVERY_INTERVAL_MS,
} from "@/app/features/agents/constants"
import {
  parseOpenPorts,
  parseTailDiscovery,
  portToDiscover,
  probeUrl,
} from "@/app/features/agents/discovery"
import { useActiveAgentView } from "@/app/features/agents/hooks/use-active-agent-view"
import { useClaudeRuntime } from "@/app/features/agents/hooks/use-claude-runtime"
import { useCodexRuntime } from "@/app/features/agents/hooks/use-codex-runtime"
import { codexHubs, reconnectTimers } from "@/app/features/agents/runtime-state"
import {
  hostFromUrl,
  isTransientPlaceholderAgent,
} from "@/app/features/agents/tab-utils"
import type {
  Agent,
  DiscoveredEndpoint,
  Protocol,
  Status,
} from "@/app/features/agents/types"
import type { StreamItem } from "@/lib/stream-items"

const CODEX_USER_INPUT_METHOD = "item/tool/requestUserInput"
const CODEX_DEFAULT_QUESTION_ID_FALLBACK = "response"
const LIVE_CAPTURE_EVENT_LIMIT = 3000

type StreamApprovalInputValue = string | Record<string, string>

type UnknownRecord = Record<string, unknown>

interface CodexQuestionAnswer {
  answers: string[]
}

interface ClaudeControlResponseInputPayload {
  allow: boolean
  input?: string | Record<string, string>
  requestId: string
  updatedInput?: unknown
}

type SendClaudeControlResponse = (
  agentId: string,
  payload: {
    allow: boolean
    input?: string | Record<string, string>
    requestId: string
    updatedInput?: unknown
  }
) => boolean

type SendCodexRpcResponse = (
  agentId: string,
  requestId: number | string,
  result: Record<string, unknown>
) => boolean

function asRecord(value: unknown): UnknownRecord | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined
  }
  return value as UnknownRecord
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function readQuestionIds(item: StreamItem): string[] {
  const rawData = asRecord(item.data)
  if (!rawData) {
    return []
  }
  const directQuestions = Array.isArray(rawData.questions)
    ? rawData.questions
    : []
  const params = asRecord(rawData.params)
  const nestedQuestions = Array.isArray(params?.questions)
    ? params.questions
    : []
  const rawQuestions =
    directQuestions.length > 0 ? directQuestions : nestedQuestions
  const ids: string[] = []
  for (const rawQuestion of rawQuestions) {
    const question = asRecord(rawQuestion)
    const questionId =
      readString(question?.id) ?? readString(question?.questionId)
    if (questionId) {
      ids.push(questionId)
    }
  }
  return ids
}

export function normalizeSubmittedInput(
  input: StreamApprovalInputValue
): string | Record<string, string> | undefined {
  if (typeof input === "string") {
    return readString(input)
  }
  const normalizedEntries: [string, string][] = []
  for (const [key, rawValue] of Object.entries(input)) {
    const normalizedKey = readString(key)
    const normalizedValue = readString(rawValue)
    if (!(normalizedKey && normalizedValue)) {
      continue
    }
    normalizedEntries.push([normalizedKey, normalizedValue])
  }
  if (normalizedEntries.length === 0) {
    return undefined
  }
  return Object.fromEntries(normalizedEntries)
}

export function toCodexQuestionAnswers(
  input: StreamApprovalInputValue,
  questionIds: readonly string[]
): Record<string, CodexQuestionAnswer> {
  const normalizedInput = normalizeSubmittedInput(input)
  if (!normalizedInput) {
    return {}
  }

  if (typeof normalizedInput === "string") {
    const firstQuestionId = questionIds[0] ?? CODEX_DEFAULT_QUESTION_ID_FALLBACK
    return {
      [firstQuestionId]: {
        answers: [normalizedInput],
      },
    }
  }

  const responses: Record<string, CodexQuestionAnswer> = {}
  for (const questionId of questionIds) {
    const response = readString(normalizedInput[questionId])
    if (!response) {
      continue
    }
    responses[questionId] = {
      answers: [response],
    }
  }

  if (Object.keys(responses).length > 0) {
    return responses
  }

  if (questionIds.length === 0) {
    for (const [questionId, answer] of Object.entries(normalizedInput)) {
      responses[questionId] = {
        answers: [answer],
      }
    }
    return responses
  }

  const firstQuestionId = questionIds[0]
  const firstAnswer = Object.values(normalizedInput)[0]
  if (firstQuestionId && firstAnswer) {
    responses[firstQuestionId] = {
      answers: [firstAnswer],
    }
  }
  return responses
}

export function buildClaudeInputPayload(
  item: StreamItem,
  value: StreamApprovalInputValue
): ClaudeControlResponseInputPayload | undefined {
  const requestId =
    typeof item.data.requestId === "string" ? item.data.requestId : undefined
  if (!requestId) {
    return undefined
  }

  const request = asRecord(item.data.request)
  const requestInput = request?.input
  const submittedInput = normalizeSubmittedInput(value)
  const payload: ClaudeControlResponseInputPayload = {
    allow: true,
    requestId,
  }

  if (requestInput !== undefined && submittedInput !== undefined) {
    if (
      typeof submittedInput === "string" &&
      typeof requestInput === "object" &&
      requestInput !== null &&
      !Array.isArray(requestInput)
    ) {
      payload.updatedInput = {
        ...(requestInput as UnknownRecord),
        userInput: submittedInput,
      }
    } else if (
      typeof submittedInput === "object" &&
      typeof requestInput === "object" &&
      requestInput !== null &&
      !Array.isArray(requestInput)
    ) {
      payload.updatedInput = {
        ...(requestInput as UnknownRecord),
        ...submittedInput,
      }
    } else {
      payload.updatedInput = submittedInput
    }
  } else if (submittedInput !== undefined) {
    payload.updatedInput = submittedInput
  } else if (requestInput !== undefined) {
    payload.updatedInput = requestInput
  }

  if (submittedInput !== undefined) {
    payload.input = submittedInput
  }

  return payload
}

function sendClaudeInputResponse(
  agentId: string,
  item: StreamItem,
  value: StreamApprovalInputValue,
  sendClaudeControlResponse: SendClaudeControlResponse
): void {
  const payload = buildClaudeInputPayload(item, value)
  if (!payload) {
    return
  }
  sendClaudeControlResponse(agentId, payload)
}

function sendCodexInputResponse(
  agentId: string,
  item: StreamItem,
  value: StreamApprovalInputValue,
  sendCodexRpcResponse: SendCodexRpcResponse
): void {
  const requestId = item.data.requestId
  if (requestId === undefined) {
    return
  }

  const requestMethod =
    typeof item.data.requestMethod === "string"
      ? item.data.requestMethod
      : undefined
  const questionIds = readQuestionIds(item)
  const isInputRequest =
    requestMethod === CODEX_USER_INPUT_METHOD || questionIds.length > 0
  if (!isInputRequest) {
    return
  }
  const answers = toCodexQuestionAnswers(value, questionIds)
  sendCodexRpcResponse(agentId, requestId as number | string, {
    answers,
  })
}

function sendClaudeApprovalResponse(
  agentId: string,
  item: StreamItem,
  allow: boolean,
  sendClaudeControlResponse: SendClaudeControlResponse
): void {
  const requestId =
    typeof item.data.requestId === "string" ? item.data.requestId : undefined
  if (!requestId) {
    return
  }
  sendClaudeControlResponse(agentId, { allow, requestId })
}

type CodexApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "acceptWithExecpolicyAmendment"
  | "decline"
  | "cancel"

function sendCodexApprovalResponse(
  agentId: string,
  item: StreamItem,
  allow: boolean,
  sendCodexRpcResponse: SendCodexRpcResponse,
  decision?: CodexApprovalDecision
): void {
  const requestId = item.data.requestId
  if (requestId === undefined) {
    return
  }
  const requestMethod =
    typeof item.data.requestMethod === "string"
      ? item.data.requestMethod
      : undefined
  if (requestMethod === CODEX_USER_INPUT_METHOD) {
    return
  }
  const resolvedDecision = decision ?? (allow ? "accept" : "decline")
  const resolvedApproved =
    resolvedDecision === "accept" ||
    resolvedDecision === "acceptForSession" ||
    resolvedDecision === "acceptWithExecpolicyAmendment"
  sendCodexRpcResponse(agentId, requestId as number | string, {
    decision: resolvedDecision,
    approved: resolvedApproved,
  })
}

function sendCodexApprovalResponseWithDecision(
  agentId: string,
  item: StreamItem,
  decision: CodexApprovalDecision,
  sendCodexRpcResponse: SendCodexRpcResponse
): void {
  const requestId = item.data.requestId
  if (requestId === undefined) {
    return
  }
  const requestMethod =
    typeof item.data.requestMethod === "string"
      ? item.data.requestMethod
      : undefined
  if (requestMethod === CODEX_USER_INPUT_METHOD) {
    return
  }
  const approved =
    decision === "accept" ||
    decision === "acceptForSession" ||
    decision === "acceptWithExecpolicyAmendment"
  sendCodexRpcResponse(agentId, requestId as number | string, {
    decision,
    approved,
  })
}

export function useAgentsRuntime() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [autoFollow, setAutoFollow] = useState(false)
  const [captureEnabled, setCaptureEnabled] = useState(false)
  const [_debugEvents, setDebugEvents] = useState<string[]>([])
  const [lastSavedCaptureAt, setLastSavedCaptureAt] = useState<
    number | undefined
  >(() => latestChatCapture()?.createdAt)
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null)
  const agentsRef = useRef<Agent[]>([])
  const captureEventsRef = useRef<WsCaptureEvent[]>([])
  const captureEnabledRef = useRef(captureEnabled)

  const pushDebugEvent = useCallback((text: string) => {
    if (process.env.NODE_ENV !== "production") {
      const timestamp = new Date().toISOString().slice(11, 23)
      const line = `${timestamp} ${text}`
      console.log(`[route] ${line}`)
      setDebugEvents((prev) => {
        const next = [line, ...prev]
        if (next.length > DEBUG_EVENT_LIMIT) {
          return next.slice(0, DEBUG_EVENT_LIMIT)
        }
        return next
      })
    }
  }, [])

  const appendWsFrame = useCallback((event: WsCaptureEvent) => {
    if (!captureEnabledRef.current) {
      return
    }
    captureEventsRef.current.push(event)
    if (captureEventsRef.current.length > LIVE_CAPTURE_EVENT_LIMIT) {
      captureEventsRef.current.splice(
        0,
        captureEventsRef.current.length - LIVE_CAPTURE_EVENT_LIMIT
      )
    }
  }, [])

  const saveCaptureSnapshot = useCallback((): boolean => {
    const saved = storeChatCapture(agentsRef.current, captureEventsRef.current)
    if (!saved) {
      return false
    }
    setLastSavedCaptureAt(saved.createdAt)
    return true
  }, [])

  const startCapture = useCallback(() => {
    captureEventsRef.current = []
    captureEnabledRef.current = true
    setCaptureEnabled(true)
  }, [])

  const stopCaptureAndSave = useCallback(() => {
    const saved = saveCaptureSnapshot()
    captureEnabledRef.current = false
    setCaptureEnabled(false)
    return saved
  }, [saveCaptureSnapshot])

  const setAgentStatus = useCallback((id: string, status: Status) => {
    setAgents((prev) =>
      prev.flatMap((agent) => {
        if (agent.id !== id) {
          return [agent]
        }
        const nextAgent = { ...agent, status }
        if (
          status === "disconnected" &&
          isTransientPlaceholderAgent(nextAgent)
        ) {
          return []
        }
        return [nextAgent]
      })
    )
  }, [])

  const {
    archiveCodexThread,
    codexOutputStates,
    codexThreadAgentIds,
    compactCodexThread,
    connectCodex,
    forkCodexThread,
    interruptCodexTurn,
    listCodexThreads,
    requestCodexLoadedList,
    resumeCodexThread,
    rollbackCodexThread,
    sendCodexRpcResponse,
    setCodexThreadName,
    steerCodexTurn,
    threadListResult,
    unarchiveCodexThread,
  } = useCodexRuntime({
    agentsRef,
    onWsFrame: appendWsFrame,
    pushDebugEvent,
    setAgentStatus,
    setAgents,
  })

  const {
    claudeOutputStates,
    claudeSessionAgentIds,
    claudeSessionIds,
    connectClaude,
    sendClaudeControlResponse,
  } = useClaudeRuntime({
    agentsRef,
    onWsFrame: appendWsFrame,
    pushDebugEvent,
    setAgentStatus,
    setAgents,
  })

  useEffect(() => {
    agentsRef.current = agents
  }, [agents])

  useEffect(() => {
    captureEnabledRef.current = captureEnabled
  }, [captureEnabled])

  const connectTo = useCallback(
    (
      targetUrl: string,
      targetProtocol: Protocol,
      opts?: { silent?: boolean }
    ) => {
      if (!targetUrl) {
        return
      }

      if (targetProtocol === "codex") {
        connectCodex(targetUrl, opts)
        return
      }

      connectClaude(targetUrl, opts)
    },
    [connectClaude, connectCodex]
  )

  // Periodic discovery: probe port ranges every few seconds.
  // Existing agents are never removed — only new ones are added.
  const knownUrls = useRef(new Set<string>())

  const runDiscovery = useCallback(() => {
    const localDiscovery = fetch(probeUrl())
      .then((r) => (r.ok ? r.json() : []))
      .then((payload: unknown) => {
        const discovered: DiscoveredEndpoint[] = []
        for (const port of parseOpenPorts(payload)) {
          const endpoint = portToDiscover(port)
          if (endpoint) {
            discovered.push(endpoint)
          }
        }
        return discovered
      })
      .catch(() => [])

    const tailDiscovery = fetch("/api/discover")
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((payload: unknown) => parseTailDiscovery(payload))
      .catch(() => [])

    Promise.all([localDiscovery, tailDiscovery]).then((sources) => {
      for (const d of sources.flat()) {
        const hasLiveAgent = agentsRef.current.some(
          (agent) =>
            agent.url === d.url &&
            agent.protocol === d.protocol &&
            agent.status !== "disconnected"
        )
        const hasLiveCodexHub = d.protocol === "codex" && codexHubs.has(d.url)
        if (hasLiveAgent || hasLiveCodexHub) {
          knownUrls.current.add(d.url)
          continue
        }
        knownUrls.current.add(d.url)
        pushDebugEvent(`discovery connect ${d.protocol} ${hostFromUrl(d.url)}`)
        connectTo(d.url, d.protocol, { silent: true })
      }

      for (const hub of codexHubs.values()) {
        requestCodexLoadedList(hub)
      }
    })
  }, [connectTo, pushDebugEvent, requestCodexLoadedList])

  // Sync knownUrls with current agents — if an agent is removed or
  // disconnects fully (not reconnecting), allow re-probing that URL.
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: syncs multiple routing caches with agent lifecycle
  useEffect(() => {
    const activeUrls = new Set([
      ...agents.filter((a) => a.status !== "disconnected").map((a) => a.url),
      ...codexHubs.keys(),
    ])
    const activeAgentIds = new Set(agents.map((a) => a.id))
    for (const url of knownUrls.current) {
      if (!activeUrls.has(url)) {
        knownUrls.current.delete(url)
      }
    }
    for (const agentId of claudeOutputStates.current.keys()) {
      if (!activeAgentIds.has(agentId)) {
        claudeOutputStates.current.delete(agentId)
      }
    }
    for (const agentId of codexOutputStates.current.keys()) {
      if (!activeAgentIds.has(agentId)) {
        codexOutputStates.current.delete(agentId)
      }
    }
    for (const agentId of claudeSessionIds.current.keys()) {
      if (!activeAgentIds.has(agentId)) {
        claudeSessionIds.current.delete(agentId)
      }
    }
    for (const [
      sessionId,
      agentId,
    ] of claudeSessionAgentIds.current.entries()) {
      if (!activeAgentIds.has(agentId)) {
        claudeSessionAgentIds.current.delete(sessionId)
      }
    }
    for (const [threadId, agentId] of codexThreadAgentIds.current.entries()) {
      if (!activeAgentIds.has(agentId)) {
        codexThreadAgentIds.current.delete(threadId)
      }
    }
  }, [
    agents,
    claudeOutputStates,
    claudeSessionAgentIds,
    claudeSessionIds,
    codexOutputStates,
    codexThreadAgentIds,
  ])

  useEffect(() => {
    // initial scan
    runDiscovery()
    // poll for new sessions
    const interval = setInterval(runDiscovery, DISCOVERY_INTERVAL_MS)

    return () => {
      clearInterval(interval)
      for (const timer of reconnectTimers.values()) {
        clearTimeout(timer)
      }
      reconnectTimers.clear()
    }
  }, [runDiscovery])

  const {
    activeAgent,
    activeHost,
    activeOutput,
    activeStreamItems,
    activeTab,
    visibleTabs,
  } = useActiveAgentView({
    agents,
    autoFollow,
    claudeSessionAgentIds,
    codexThreadAgentIds,
    selectedTabId,
    setSelectedTabId,
  })

  const handleApprovalResponse = useCallback(
    (item: StreamItem, allow: boolean) => {
      const agentId = item.agentId
      if (!agentId) {
        return
      }
      const agent = agentsRef.current.find((a) => a.id === agentId)
      if (!agent) {
        return
      }
      if (agent.protocol === "claude") {
        sendClaudeApprovalResponse(
          agentId,
          item,
          allow,
          sendClaudeControlResponse
        )
        return
      }

      if (agent.protocol === "codex") {
        sendCodexApprovalResponse(agentId, item, allow, sendCodexRpcResponse)
      }
    },
    [sendClaudeControlResponse, sendCodexRpcResponse]
  )

  const handleApprovalDecision = useCallback(
    (item: StreamItem, decision: CodexApprovalDecision) => {
      const agentId = item.agentId
      if (!agentId) {
        return
      }
      const agent = agentsRef.current.find((a) => a.id === agentId)
      if (!agent) {
        return
      }
      if (agent.protocol !== "codex") {
        return
      }
      sendCodexApprovalResponseWithDecision(
        agentId,
        item,
        decision,
        sendCodexRpcResponse
      )
    },
    [sendCodexRpcResponse]
  )

  const handleApprovalInput = useCallback(
    (item: StreamItem, value: StreamApprovalInputValue) => {
      const agentId = item.agentId
      if (!agentId) {
        return
      }
      const agent = agentsRef.current.find(
        (candidate) => candidate.id === agentId
      )
      if (!agent) {
        return
      }

      if (agent.protocol === "claude") {
        sendClaudeInputResponse(agentId, item, value, sendClaudeControlResponse)
        return
      }

      if (agent.protocol === "codex") {
        sendCodexInputResponse(agentId, item, value, sendCodexRpcResponse)
      }
    },
    [sendClaudeControlResponse, sendCodexRpcResponse]
  )

  return {
    activeAgent,
    activeHost,
    activeOutput,
    activeStreamItems,
    activeTab,
    agents,
    archiveCodexThread,
    autoFollow,
    captureEnabled,
    compactCodexThread,
    forkCodexThread,
    handleApprovalDecision,
    handleApprovalInput,
    handleApprovalResponse,
    interruptCodexTurn,
    lastSavedCaptureAt,
    listCodexThreads,
    resumeCodexThread,
    rollbackCodexThread,
    saveCaptureSnapshot,
    selectedTabId,
    setCodexThreadName,
    startCapture,
    steerCodexTurn,
    stopCaptureAndSave,
    threadListResult,
    unarchiveCodexThread,
    setAutoFollow,
    setSelectedTabId,
    visibleTabs,
  }
}
