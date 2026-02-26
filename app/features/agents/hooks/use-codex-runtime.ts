"use client"

import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import { useCallback, useMemo, useRef } from "react"
import type { WsCaptureEvent } from "@/app/features/agents/capture"
import {
  CODEX_NON_BUFFERED_TURN_METHODS,
  CODEX_NOOP_NOTIFICATION_METHODS,
  CODEX_OUTPUT_NOTIFICATION_METHODS,
  CODEX_PENDING_OUTPUT_EVENT_MAX,
  CODEX_PENDING_TURN_EVENT_MAX_PER_TURN,
  CODEX_PENDING_TURN_EVENT_MAX_TOTAL,
  CODEX_PENDING_TURN_EVENT_TTL_MS,
  CODEX_PRETTY_MODE,
  CODEX_STRUCTURED_NOTIFICATION_METHODS,
  CODEX_SUBAGENT_HINT_LIMIT,
  CODEX_SUBAGENT_HINT_TTL_MS,
  CODEX_TASK_DONE_METHODS,
} from "@/app/features/agents/constants"
import { parseCodexThreadIdFromRawLine } from "@/app/features/agents/discovery"
import {
  codexHubs,
  reconnectTimers,
  scheduleReconnect,
} from "@/app/features/agents/runtime-state"
import {
  firstOpenTurnAgent,
  hostFromUrl,
  isCodexItemMessage,
  shortId,
  turnIdFromParams,
} from "@/app/features/agents/tab-utils"
import type {
  Agent,
  CodexHub,
  CodexThreadStatus,
  Status,
} from "@/app/features/agents/types"
import { isReusableCodexPlaceholder } from "@/lib/agent-routing"
import { projectCodexOutputFromNotification } from "@/lib/codex-output-events"
import {
  applyCodexTurnRouting,
  ensureCodexThreadRoute,
  pendingThreadStartAgent,
  resolveCodexNotificationAgent,
} from "@/lib/codex-routing"
import {
  type CodexRpcMessage,
  type CodexRpcParams,
  codexLoadedThreadIdsFromResult,
  codexStatusFromParams,
  codexThreadIdFromParams,
  codexThreadIdFromResult,
  codexThreadNameFromParams,
  codexThreadPreviewFromResult,
  codexTurnIdFromResult,
  codexUnsubscribeStatusFromResult,
} from "@/lib/codex-rpc"
import {
  adaptCodexMessageToStreamItems,
  type CodexStreamAdapterState,
  createCodexStreamAdapterState,
} from "@/lib/codex-stream-adapter"
import { applyStreamActions } from "@/lib/stream-items"
import {
  type CodexOutputEvent,
  type CodexOutputState,
  createCodexOutputState,
  reduceCodexOutput,
} from "@/lib/stream-output"
import { bufferNdjsonChunk } from "@/lib/stream-parsing"

interface UseCodexRuntimeParams {
  agentsRef: MutableRefObject<Agent[]>
  onWsFrame?: (event: WsCaptureEvent) => void
  pushDebugEvent: (text: string) => void
  setAgentStatus: (id: string, status: Status) => void
  setAgents: Dispatch<SetStateAction<Agent[]>>
}

export interface CodexThreadListResult {
  data: Array<{
    id: string
    preview: string
    modelProvider: string
    createdAt: number
    updatedAt: number
    cwd: string
  }>
  nextCursor: string | null
}

interface UseCodexRuntimeResult {
  archiveCodexThread: (agentId: string, threadId: string) => void
  codexOutputStates: MutableRefObject<Map<string, CodexOutputState>>
  codexThreadAgentIds: MutableRefObject<Map<string, string>>
  compactCodexThread: (agentId: string, threadId: string) => void
  connectCodex: (targetUrl: string, opts?: { silent?: boolean }) => void
  disconnectCodexThread: (agentId: string, threadId: string) => boolean
  forkCodexThread: (agentId: string, threadId: string) => string
  interruptCodexTurn: (agentId: string) => void
  listCodexThreads: (hubUrl: string, cursor?: string) => void
  requestCodexLoadedList: (hub: CodexHub) => void
  resumeCodexThread: (hubUrl: string, threadId: string) => void
  rollbackCodexThread: (
    agentId: string,
    threadId: string,
    numTurns: number
  ) => void
  sendCodexRpcResponse: (
    agentId: string,
    requestId: number | string,
    result: Record<string, unknown>
  ) => boolean
  setCodexThreadName: (agentId: string, threadId: string, name: string) => void
  steerCodexTurn: (agentId: string, input: string) => void
  threadListResult: MutableRefObject<CodexThreadListResult>
  unarchiveCodexThread: (agentId: string, threadId: string) => void
}

const CODEX_DEFAULT_THREAD_START_PARAMS = {
  approvalPolicy: "never",
  sandbox: "danger-full-access",
} as const

function sendThreadUnsubscribes(hub: CodexHub): void {
  if (hub.ws.readyState !== WebSocket.OPEN) {
    return
  }
  for (const [threadId, agentId] of hub.threads.entries()) {
    hub.rpcId++
    hub.pending.set(hub.rpcId, {
      agentId,
      threadId,
      type: "thread_unsubscribe",
    })
    try {
      hub.ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "thread/unsubscribe",
          id: hub.rpcId,
          params: { threadId },
        })
      )
    } catch {
      // WS may already be closing, ignore
    }
  }
}

function sendAllHubThreadUnsubscribes(): void {
  for (const hub of codexHubs.values()) {
    sendThreadUnsubscribes(hub)
  }
}

let beforeUnloadRegistered = false

function ensureBeforeUnloadListener(): void {
  if (beforeUnloadRegistered) {
    return
  }
  beforeUnloadRegistered = true
  window.addEventListener("beforeunload", sendAllHubThreadUnsubscribes)
  window.addEventListener("pagehide", sendAllHubThreadUnsubscribes)
}

export function useCodexRuntime({
  agentsRef,
  onWsFrame,
  pushDebugEvent,
  setAgentStatus,
  setAgents,
}: UseCodexRuntimeParams): UseCodexRuntimeResult {
  "use no memo"
  const codexThreadAgentIds = useRef(new Map<string, string>())
  const codexOutputStates = useRef(new Map<string, CodexOutputState>())
  const codexStreamAdapterStates = useRef(
    new Map<string, CodexStreamAdapterState>()
  )
  const pendingCodexOutputEvents = useRef(new Map<string, CodexOutputEvent[]>())
  const threadListResult = useRef<CodexThreadListResult>({
    data: [],
    nextCursor: null,
  })

  const trackCodexFrame = useCallback(
    (event: Omit<WsCaptureEvent, "protocol">) => {
      onWsFrame?.({ ...event, protocol: "codex" })
    },
    [onWsFrame]
  )

  const sendCodexPayload = useCallback(
    (hub: CodexHub, payload: unknown, agentId?: string) => {
      const rawPayload = JSON.stringify(payload)
      trackCodexFrame({
        agentId,
        connectionId: hub.url,
        direction: "out",
        payload: rawPayload,
        timestamp: Date.now(),
        url: hub.url,
      })
      hub.ws.send(rawPayload)
    },
    [trackCodexFrame]
  )

  const clearCodexAgentRuntimeState = useCallback((agentId: string) => {
    codexOutputStates.current.delete(agentId)
    codexStreamAdapterStates.current.delete(agentId)
    pendingCodexOutputEvents.current.delete(agentId)
  }, [])

  const cleanUpUnsubscribedThread = useCallback(
    (hub: CodexHub, threadId: string, agentId: string) => {
      // Remove thread from hub mappings
      hub.threads.delete(threadId)
      hub.threadMetaRequested.delete(threadId)
      hub.primaryThreads.delete(threadId)

      // Remove global thread-to-agent mapping
      if (codexThreadAgentIds.current.get(threadId) === agentId) {
        codexThreadAgentIds.current.delete(threadId)
      }

      // Clean up any turns associated with this thread
      for (const [turnId, turnThreadId] of hub.turnThreads.entries()) {
        if (turnThreadId === threadId) {
          hub.turnThreads.delete(turnId)
          hub.turns.delete(turnId)
          hub.pendingTurnEvents.delete(turnId)
        }
      }

      // Clear agent runtime state and reset agent to disconnected
      clearCodexAgentRuntimeState(agentId)

      // Update agent: clear threadId, streamItems, and set status
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId
            ? {
                ...a,
                threadId: undefined,
                streamItems: [],
                status: "disconnected" as Status,
              }
            : a
        )
      )

      // Remove agent from hub if it has no remaining threads
      const agentHasOtherThreads = [...hub.threads.values()].includes(agentId)
      if (!agentHasOtherThreads) {
        hub.agents.delete(agentId)
      }
    },
    [clearCodexAgentRuntimeState, setAgents]
  )

  const reduceCodexOutputEvents = useCallback(
    (
      id: string,
      output: string,
      state: CodexOutputState,
      events: CodexOutputEvent[]
    ) => {
      let nextOutput = output
      let nextState = state
      for (const event of events) {
        const result = reduceCodexOutput(nextOutput, nextState, event, {
          prettyMode: CODEX_PRETTY_MODE,
        })
        nextOutput = result.output
        nextState = result.state
      }
      codexOutputStates.current.set(id, nextState)
      return nextOutput
    },
    []
  )

  const queueCodexOutputEvents = useCallback(
    (id: string, events: CodexOutputEvent[]) => {
      if (events.length === 0) {
        return
      }
      const queued = pendingCodexOutputEvents.current.get(id) ?? []
      queued.push(...events)
      if (queued.length > CODEX_PENDING_OUTPUT_EVENT_MAX) {
        queued.splice(0, queued.length - CODEX_PENDING_OUTPUT_EVENT_MAX)
      }
      pendingCodexOutputEvents.current.set(id, queued)
    },
    []
  )

  const consumePendingCodexOutputEvents = useCallback(
    (agent: Agent): Agent => {
      const queued = pendingCodexOutputEvents.current.get(agent.id)
      if (!queued || queued.length === 0) {
        return agent
      }
      pendingCodexOutputEvents.current.delete(agent.id)
      const nextState =
        codexOutputStates.current.get(agent.id) ?? createCodexOutputState()
      const nextOutput = reduceCodexOutputEvents(
        agent.id,
        agent.output,
        nextState,
        queued
      )
      if (nextOutput === agent.output) {
        return agent
      }
      return { ...agent, output: nextOutput }
    },
    [reduceCodexOutputEvents]
  )

  const applyCodexOutputEvents = useCallback(
    (id: string, events: CodexOutputEvent[]) => {
      if (events.length === 0) {
        return
      }
      setAgents((prev) => {
        const agentIndex = prev.findIndex((agent) => agent.id === id)
        if (agentIndex === -1) {
          queueCodexOutputEvents(id, events)
          return prev
        }

        const queued = pendingCodexOutputEvents.current.get(id)
        if (queued && queued.length > 0) {
          pendingCodexOutputEvents.current.delete(id)
        }
        const eventsToApply =
          queued && queued.length > 0 ? [...queued, ...events] : events

        const agent = prev[agentIndex]
        const currentState =
          codexOutputStates.current.get(id) ?? createCodexOutputState()
        const nextOutput = reduceCodexOutputEvents(
          id,
          agent.output,
          currentState,
          eventsToApply
        )
        if (nextOutput === agent.output) {
          return prev
        }

        const next = prev.slice()
        next[agentIndex] = { ...agent, output: nextOutput }
        return next
      })
    },
    [queueCodexOutputEvents, reduceCodexOutputEvents, setAgents]
  )

  const applyCodexStreamMessage = useCallback(
    (id: string, msg: CodexRpcMessage) => {
      const state =
        codexStreamAdapterStates.current.get(id) ??
        createCodexStreamAdapterState()
      codexStreamAdapterStates.current.set(id, state)
      const actions = adaptCodexMessageToStreamItems(state, {
        ...msg,
        agentId: id,
      })
      if (actions.length === 0) {
        return
      }
      setAgents((prev) => {
        const agentIndex = prev.findIndex((agent) => agent.id === id)
        if (agentIndex === -1) {
          return prev
        }
        const agent = prev[agentIndex]
        const streamItems = applyStreamActions(agent.streamItems, actions)
        if (streamItems === agent.streamItems) {
          return prev
        }
        const next = prev.slice()
        next[agentIndex] = { ...agent, streamItems }
        return next
      })
    },
    [setAgents]
  )

  const setAgentThread = useCallback(
    (id: string, threadId: string) => {
      const previousThreadId = agentsRef.current.find(
        (a) => a.id === id
      )?.threadId
      if (
        previousThreadId &&
        previousThreadId !== threadId &&
        codexThreadAgentIds.current.get(previousThreadId) === id
      ) {
        codexThreadAgentIds.current.delete(previousThreadId)
      }
      codexThreadAgentIds.current.set(threadId, id)
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? { ...a, threadId } : a))
      )
    },
    [agentsRef, setAgents]
  )

  const setAgentThreadName = useCallback(
    (id: string, threadName?: string) => {
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? { ...a, threadName } : a))
      )
    },
    [setAgents]
  )

  const setAgentThreadNameIfMissing = useCallback(
    (id: string, threadName: string) => {
      setAgents((prev) =>
        prev.map((a) => {
          if (a.id !== id || a.threadName) {
            return a
          }
          return { ...a, threadName }
        })
      )
    },
    [setAgents]
  )

  const requestCodexThreadMeta = useCallback(
    (hub: CodexHub, agentId: string, threadId: string) => {
      if (hub.threadMetaRequested.has(threadId)) {
        return
      }
      hub.threadMetaRequested.add(threadId)
      hub.rpcId++
      hub.pending.set(hub.rpcId, { agentId, type: "thread_read", threadId })
      sendCodexPayload(
        hub,
        {
          jsonrpc: "2.0",
          method: "thread/read",
          id: hub.rpcId,
          params: { threadId, includeTurns: false },
        },
        agentId
      )
    },
    [sendCodexPayload]
  )

  const requestCodexLoadedList = useCallback(
    (hub: CodexHub) => {
      if (!hub.initialized || hub.ws.readyState !== WebSocket.OPEN) {
        return
      }
      const requesterAgentId =
        hub.threads.values().next().value ?? hub.agents.values().next().value
      hub.rpcId++
      hub.pending.set(hub.rpcId, {
        agentId: requesterAgentId,
        type: "loaded_list",
      })
      sendCodexPayload(
        hub,
        {
          jsonrpc: "2.0",
          method: "thread/loaded/list",
          id: hub.rpcId,
          params: {},
        },
        requesterAgentId
      )
    },
    [sendCodexPayload]
  )

  const listCodexThreads = useCallback(
    (hubUrl: string, cursor?: string) => {
      const hub = codexHubs.get(hubUrl)
      if (!hub?.initialized || hub.ws.readyState !== WebSocket.OPEN) {
        let reason = "no-hub"
        if (hub) {
          reason = hub.initialized ? "ws-not-open" : "not-initialized"
        }
        pushDebugEvent(
          `codex thread/list skip hub=${hostFromUrl(hubUrl)} reason=${reason}`
        )
        return
      }
      hub.rpcId++
      hub.pending.set(hub.rpcId, { type: "thread_list" })
      const params: Record<string, unknown> = {}
      if (cursor) {
        params.cursor = cursor
      }
      sendCodexPayload(hub, {
        jsonrpc: "2.0",
        method: "thread/list",
        id: hub.rpcId,
        params,
      })
      pushDebugEvent(
        `codex thread/list sent hub=${hostFromUrl(hubUrl)}${cursor ? ` cursor=${cursor}` : ""}`
      )
    },
    [pushDebugEvent, sendCodexPayload]
  )

  const bindCodexThreadToAgent = useCallback(
    (hub: CodexHub, requestedAgentId: string, threadId: string): string => {
      // Skip stale mappings to disconnected agents
      const globalAgentId = codexThreadAgentIds.current.get(threadId)
      if (globalAgentId) {
        const globalAgent = agentsRef.current.find(
          (candidate) => candidate.id === globalAgentId
        )
        if (globalAgent?.status === "disconnected") {
          codexThreadAgentIds.current.delete(threadId)
        }
      }
      const canonicalAgentId =
        codexThreadAgentIds.current.get(threadId) ??
        hub.threads.get(threadId) ??
        requestedAgentId
      const existingHubAgentId = hub.threads.get(threadId)
      if (existingHubAgentId === canonicalAgentId) {
        setAgentThread(canonicalAgentId, threadId)
        setAgentStatus(canonicalAgentId, "connected")
        return canonicalAgentId
      }
      pushDebugEvent(
        `codex bind-new agent=${shortId(canonicalAgentId)} thread=${shortId(threadId)} hub=${hostFromUrl(hub.url)} requested=${shortId(requestedAgentId)}`
      )
      codexThreadAgentIds.current.set(threadId, canonicalAgentId)
      hub.threads.set(threadId, canonicalAgentId)
      hub.agents.add(canonicalAgentId)
      const canonicalAgent = agentsRef.current.find(
        (candidate) => candidate.id === canonicalAgentId
      )
      if (canonicalAgent) {
        setAgentThread(canonicalAgentId, threadId)
        setAgentStatus(canonicalAgentId, "connected")
      } else {
        const discoveredAgent: Agent = {
          id: canonicalAgentId,
          url: hub.url,
          protocol: "codex",
          status: "connected",
          output: "",
          streamItems: [],
          threadId,
        }
        setAgents((prev) => [
          ...prev,
          consumePendingCodexOutputEvents(discoveredAgent),
        ])
      }

      if (requestedAgentId !== canonicalAgentId) {
        const requestedAgent = agentsRef.current.find(
          (candidate) => candidate.id === requestedAgentId
        )
        if (isReusableCodexPlaceholder(requestedAgent)) {
          hub.agents.delete(requestedAgentId)
          setAgentStatus(requestedAgentId, "disconnected")
          clearCodexAgentRuntimeState(requestedAgentId)
        }
      }

      // v2 auto-subscribes on thread/start and thread/resume, no explicit
      // addConversationListener needed.
      requestCodexThreadMeta(hub, canonicalAgentId, threadId)
      return canonicalAgentId
    },
    [
      agentsRef,
      consumePendingCodexOutputEvents,
      clearCodexAgentRuntimeState,
      pushDebugEvent,
      requestCodexThreadMeta,
      setAgentStatus,
      setAgentThread,
      setAgents,
    ]
  )

  const findActiveCodexPrimaryAgent = useCallback(
    (hub: CodexHub): string | undefined => {
      for (const threadId of hub.primaryThreads) {
        const agentId = hub.threads.get(threadId)
        if (!agentId) {
          continue
        }
        const agent = agentsRef.current.find(
          (candidate) => candidate.id === agentId
        )
        if (agent && agent.status !== "disconnected") {
          return agentId
        }
      }
      return undefined
    },
    [agentsRef]
  )

  const findUnassignedCodexHubAgent = useCallback(
    (hub: CodexHub) => {
      const assigned = new Set(hub.threads.values())
      for (const agentId of hub.agents) {
        if (assigned.has(agentId)) {
          continue
        }
        const agent = agentsRef.current.find(
          (candidate) => candidate.id === agentId
        )
        if (isReusableCodexPlaceholder(agent)) {
          return agentId
        }
      }
      return undefined
    },
    [agentsRef]
  )

  const enqueueCodexSubagentParent = useCallback(
    (hub: CodexHub, agentId: string) => {
      const now = Date.now()
      hub.pendingSubagentParents = hub.pendingSubagentParents.filter(
        ({ agentId: candidateId, expiresAt }) => {
          if (expiresAt <= now) {
            return false
          }
          const candidate = agentsRef.current.find(
            (agent) => agent.id === candidateId
          )
          return Boolean(candidate && candidate.status !== "disconnected")
        }
      )
      hub.pendingSubagentParents.push({
        agentId,
        expiresAt: now + CODEX_SUBAGENT_HINT_TTL_MS,
      })
      if (hub.pendingSubagentParents.length > CODEX_SUBAGENT_HINT_LIMIT) {
        hub.pendingSubagentParents.splice(
          0,
          hub.pendingSubagentParents.length - CODEX_SUBAGENT_HINT_LIMIT
        )
      }
    },
    [agentsRef]
  )

  const takePendingCodexSubagentParent = useCallback(
    (hub: CodexHub): string | undefined => {
      const now = Date.now()
      while (hub.pendingSubagentParents.length > 0) {
        const next = hub.pendingSubagentParents.shift()
        if (!next || next.expiresAt <= now) {
          continue
        }
        const candidate = agentsRef.current.find(
          (agent) => agent.id === next.agentId
        )
        if (!candidate || candidate.status === "disconnected") {
          continue
        }
        return next.agentId
      }
      return undefined
    },
    [agentsRef]
  )

  const tryRouteCodexHintedSubagentThread = useCallback(
    (hub: CodexHub, threadId: string): boolean => {
      const collabParentAgentId = takePendingCodexSubagentParent(hub)
      if (!collabParentAgentId) {
        return false
      }
      pushDebugEvent(
        `codex route-thread via=collab parent=${shortId(collabParentAgentId)} thread=${shortId(threadId)}`
      )
      hub.threads.set(threadId, collabParentAgentId)
      hub.agents.add(collabParentAgentId)
      return true
    },
    [pushDebugEvent, takePendingCodexSubagentParent]
  )

  const tryRouteCodexSubagentFromPrimary = useCallback(
    (hub: CodexHub, threadId: string): boolean => {
      if (hub.primaryThreads.has(threadId) || hub.primaryThreads.size === 0) {
        return false
      }
      const parentAgentId = findActiveCodexPrimaryAgent(hub)
      if (!parentAgentId) {
        return false
      }
      pushDebugEvent(
        `codex route-thread via=subagent parent=${shortId(parentAgentId)} thread=${shortId(threadId)}`
      )
      hub.threads.set(threadId, parentAgentId)
      hub.agents.add(parentAgentId)
      return true
    },
    [findActiveCodexPrimaryAgent, pushDebugEvent]
  )

  const shouldBufferCodexTurnEvent = useCallback((method?: string): boolean => {
    if (!method) {
      return false
    }
    return !CODEX_NON_BUFFERED_TURN_METHODS.has(method)
  }, [])

  const pruneExpiredCodexTurnBuffers = useCallback(
    (hub: CodexHub, now: number) => {
      for (const [queuedTurnId, queuedEvents] of hub.pendingTurnEvents) {
        const liveEvents = queuedEvents.filter(
          (queued) => queued.expiresAt > now
        )
        if (liveEvents.length === 0) {
          hub.pendingTurnEvents.delete(queuedTurnId)
          continue
        }
        hub.pendingTurnEvents.set(queuedTurnId, liveEvents)
      }
    },
    []
  )

  const countBufferedCodexTurnEvents = useCallback((hub: CodexHub): number => {
    let totalBuffered = 0
    for (const queuedEvents of hub.pendingTurnEvents.values()) {
      totalBuffered += queuedEvents.length
    }
    return totalBuffered
  }, [])

  const trimCodexTurnBufferTotal = useCallback(
    (hub: CodexHub, maxTotal: number) => {
      let totalBuffered = countBufferedCodexTurnEvents(hub)
      while (totalBuffered > maxTotal) {
        const oldestTurnId = hub.pendingTurnEvents.keys().next().value
        if (!oldestTurnId) {
          break
        }
        const oldestQueue = hub.pendingTurnEvents.get(oldestTurnId)
        if (!oldestQueue || oldestQueue.length === 0) {
          hub.pendingTurnEvents.delete(oldestTurnId)
          continue
        }
        oldestQueue.shift()
        totalBuffered -= 1
        if (oldestQueue.length === 0) {
          hub.pendingTurnEvents.delete(oldestTurnId)
        } else {
          hub.pendingTurnEvents.set(oldestTurnId, oldestQueue)
        }
      }
    },
    [countBufferedCodexTurnEvents]
  )

  const bufferCodexTurnEvent = useCallback(
    (hub: CodexHub, turnId: string, msg: CodexRpcMessage) => {
      const now = Date.now()
      pruneExpiredCodexTurnBuffers(hub, now)

      const queue = hub.pendingTurnEvents.get(turnId) ?? []
      queue.push({
        expiresAt: now + CODEX_PENDING_TURN_EVENT_TTL_MS,
        msg,
      })
      if (queue.length > CODEX_PENDING_TURN_EVENT_MAX_PER_TURN) {
        queue.splice(0, queue.length - CODEX_PENDING_TURN_EVENT_MAX_PER_TURN)
      }
      hub.pendingTurnEvents.set(turnId, queue)
      trimCodexTurnBufferTotal(hub, CODEX_PENDING_TURN_EVENT_MAX_TOTAL)

      pushDebugEvent(
        `codex buffer method=${msg.method ?? "unknown"} turn=${shortId(turnId)} pending=${queue.length}`
      )
    },
    [pruneExpiredCodexTurnBuffers, pushDebugEvent, trimCodexTurnBufferTotal]
  )

  const attachDiscoveredCodexThread = useCallback(
    (hub: CodexHub, threadId: string): string => {
      const globalAgentId = codexThreadAgentIds.current.get(threadId)
      if (globalAgentId) {
        // Skip stale mapping to a disconnected agent
        const globalAgent = agentsRef.current.find(
          (candidate) => candidate.id === globalAgentId
        )
        if (globalAgent?.status === "disconnected") {
          codexThreadAgentIds.current.delete(threadId)
        } else {
          return bindCodexThreadToAgent(hub, globalAgentId, threadId)
        }
      }
      const ensured = ensureCodexThreadRoute(
        hub.threads,
        hub.agents,
        threadId,
        () => crypto.randomUUID()
      )
      codexThreadAgentIds.current.set(threadId, ensured.agentId)
      if (!ensured.created) {
        return bindCodexThreadToAgent(hub, ensured.agentId, threadId)
      }

      const discoveredAgent: Agent = {
        id: ensured.agentId,
        url: hub.url,
        protocol: "codex",
        status: "connected",
        output: "",
        streamItems: [],
        threadId,
      }
      pushDebugEvent(
        `codex attach new-agent=${shortId(ensured.agentId)} thread=${shortId(threadId)} hub=${hostFromUrl(hub.url)}`
      )
      setAgents((prev) => [
        ...prev,
        consumePendingCodexOutputEvents(discoveredAgent),
      ])

      // v2 auto-subscribes on thread/start and thread/resume, no explicit
      // addConversationListener needed.
      requestCodexThreadMeta(hub, ensured.agentId, threadId)
      return ensured.agentId
    },
    [
      agentsRef,
      bindCodexThreadToAgent,
      consumePendingCodexOutputEvents,
      pushDebugEvent,
      requestCodexThreadMeta,
      setAgents,
    ]
  )

  const ensureCodexNotificationThreadRoute = useCallback(
    (hub: CodexHub, notificationThreadId?: string) => {
      if (!notificationThreadId) {
        return
      }
      const globalAgentId =
        codexThreadAgentIds.current.get(notificationThreadId)
      if (globalAgentId) {
        if (!hub.threads.has(notificationThreadId)) {
          pushDebugEvent(
            `codex route-thread via=global agent=${shortId(globalAgentId)} thread=${shortId(notificationThreadId)}`
          )
        }
        bindCodexThreadToAgent(hub, globalAgentId, notificationThreadId)
        return
      }
      if (hub.threads.has(notificationThreadId)) {
        return
      }
      const pendingOwner = pendingThreadStartAgent(hub.pending.values())
      if (pendingOwner) {
        pushDebugEvent(
          `codex route-thread via=pending agent=${shortId(pendingOwner)} thread=${shortId(notificationThreadId)}`
        )
        bindCodexThreadToAgent(hub, pendingOwner, notificationThreadId)
        return
      }
      if (tryRouteCodexHintedSubagentThread(hub, notificationThreadId)) {
        return
      }
      if (tryRouteCodexSubagentFromPrimary(hub, notificationThreadId)) {
        return
      }
      const unassignedAgentId = findUnassignedCodexHubAgent(hub)
      if (unassignedAgentId) {
        pushDebugEvent(
          `codex route-thread via=unassigned agent=${shortId(unassignedAgentId)} thread=${shortId(notificationThreadId)}`
        )
        bindCodexThreadToAgent(hub, unassignedAgentId, notificationThreadId)
        return
      }
      pushDebugEvent(
        `codex route-thread via=attach thread=${shortId(notificationThreadId)} hub=${hostFromUrl(hub.url)}`
      )
      attachDiscoveredCodexThread(hub, notificationThreadId)
    },
    [
      attachDiscoveredCodexThread,
      bindCodexThreadToAgent,
      findUnassignedCodexHubAgent,
      pushDebugEvent,
      tryRouteCodexHintedSubagentThread,
      tryRouteCodexSubagentFromPrimary,
    ]
  )

  const resolveCodexTurnEventAgent = useCallback(
    (
      hub: CodexHub,
      method: string | undefined,
      routeTurnId: string | undefined
    ): string | undefined => {
      const onlyTurnAgent = firstOpenTurnAgent(hub.turns)
      if (method === "turn/started") {
        if (routeTurnId) {
          return hub.turns.get(routeTurnId)
        }
        return onlyTurnAgent
      }
      if (method === "turn/completed") {
        if (routeTurnId) {
          const byTurn = hub.turns.get(routeTurnId)
          if (byTurn) {
            return byTurn
          }
        }
        return onlyTurnAgent
      }
      return undefined
    },
    []
  )

  const resolveCodexItemEventAgent = useCallback(
    (hub: CodexHub, routeTurnId: string | undefined): string | undefined => {
      if (routeTurnId) {
        const byTurn = hub.turns.get(routeTurnId)
        if (byTurn) {
          return byTurn
        }
      }
      return firstOpenTurnAgent(hub.turns)
    },
    []
  )

  const resolveSingleLiveHubAgent = useCallback(
    (hub: CodexHub): string | undefined => {
      let singleAgentId: string | undefined
      for (const candidateId of hub.agents) {
        const candidate = agentsRef.current.find(
          (agent) => agent.id === candidateId
        )
        if (!candidate || candidate.status === "disconnected") {
          continue
        }
        if (singleAgentId && singleAgentId !== candidateId) {
          return undefined
        }
        singleAgentId = candidateId
      }
      return singleAgentId
    },
    [agentsRef]
  )

  const resolveCodexEventFallbackAgent = useCallback(
    (
      hub: CodexHub,
      method: string | undefined,
      routeTurnId: string | undefined
    ): string | undefined => {
      if (!method?.startsWith("codex/event/")) {
        return undefined
      }
      if (routeTurnId) {
        const byTurn = hub.turns.get(routeTurnId)
        if (byTurn) {
          return byTurn
        }
      }
      const openTurnAgent = firstOpenTurnAgent(hub.turns)
      if (openTurnAgent) {
        return openTurnAgent
      }
      if (
        method === "codex/event/user_message" ||
        method === "codex/event/agent_message"
      ) {
        return resolveSingleLiveHubAgent(hub)
      }
      return undefined
    },
    [resolveSingleLiveHubAgent]
  )

  const resolveCodexNotificationRoute = useCallback(
    (hub: CodexHub, msg: CodexRpcMessage, routeParams?: CodexRpcParams) => {
      const routeTurnId = turnIdFromParams(routeParams)
      const route = resolveCodexNotificationAgent(
        hub.threads,
        hub.turns,
        routeParams
      )
      if (route.agentId) {
        return route
      }

      const turnEventAgent = resolveCodexTurnEventAgent(
        hub,
        msg.method,
        routeTurnId
      )
      if (turnEventAgent) {
        return { agentId: turnEventAgent }
      }

      const shouldUseItemFallback =
        msg.method?.startsWith("item/") ||
        isCodexItemMessage(msg.method) ||
        CODEX_STRUCTURED_NOTIFICATION_METHODS.has(msg.method ?? "")
      const itemEventAgent = shouldUseItemFallback
        ? resolveCodexItemEventAgent(hub, routeTurnId)
        : undefined
      if (itemEventAgent) {
        return { agentId: itemEventAgent }
      }
      const eventFallbackAgent = resolveCodexEventFallbackAgent(
        hub,
        msg.method,
        routeTurnId
      )
      if (eventFallbackAgent) {
        return { agentId: eventFallbackAgent }
      }
      return route
    },
    [
      resolveCodexEventFallbackAgent,
      resolveCodexItemEventAgent,
      resolveCodexTurnEventAgent,
    ]
  )

  const ensureCodexAgentThreadMatch = useCallback(
    (hub: CodexHub, agentId: string, threadId?: string): string => {
      if (!threadId) {
        return agentId
      }
      const mappedAgentId = hub.threads.get(threadId)
      if (mappedAgentId) {
        return mappedAgentId
      }
      const agent = agentsRef.current.find(
        (candidate) => candidate.id === agentId
      )
      if (!agent?.threadId || agent.threadId === threadId) {
        return agentId
      }
      pushDebugEvent(
        `codex rotate thread-mismatch current=${shortId(agent.threadId)} incoming=${shortId(threadId)} agent=${shortId(agentId)}`
      )
      return attachDiscoveredCodexThread(hub, threadId)
    },
    [agentsRef, attachDiscoveredCodexThread, pushDebugEvent]
  )

  const disconnectCodexUnscopedAgentIfIdle = useCallback(
    (hub: CodexHub, agentId: string) => {
      if ([...hub.threads.values()].includes(agentId)) {
        return
      }
      const hasOpenTurn = [...hub.turns.values()].some(
        (turnAgentId) => turnAgentId === agentId
      )
      if (hasOpenTurn) {
        return
      }
      hub.agents.delete(agentId)
      setAgentStatus(agentId, "disconnected")
      clearCodexAgentRuntimeState(agentId)
    },
    [clearCodexAgentRuntimeState, setAgentStatus]
  )

  const applyCodexProjectedOutput = useCallback(
    (
      msg: CodexRpcMessage,
      routedAgentId: string,
      eventThreadId: string | undefined
    ) => {
      const projection = projectCodexOutputFromNotification({
        method: msg.method,
        params: msg.params,
        threadId: eventThreadId,
      })
      if (projection.missingText) {
        pushDebugEvent(
          `codex text-empty method=${projection.missingText.method} keys=${projection.missingText.keys} msgType=${projection.missingText.msgType} msgKeys=${projection.missingText.msgKeys}`
        )
      }
      applyCodexOutputEvents(routedAgentId, projection.events)
    },
    [applyCodexOutputEvents, pushDebugEvent]
  )

  const completeCodexTurnLifecycle = useCallback(
    (
      hub: CodexHub,
      routeParams: CodexRpcParams | undefined,
      routedAgentId: string
    ) => {
      applyCodexTurnRouting(
        hub.turns,
        "turn/completed",
        routeParams,
        routedAgentId
      )
      const completedTurnId = turnIdFromParams(routeParams)
      if (completedTurnId) {
        hub.turnThreads.delete(completedTurnId)
        hub.pendingTurnEvents.delete(completedTurnId)
      }
      disconnectCodexUnscopedAgentIfIdle(hub, routedAgentId)
    },
    [disconnectCodexUnscopedAgentIfIdle]
  )

  const completeCodexTaskLifecycle = useCallback(
    (
      hub: CodexHub,
      method: string,
      routeParams: CodexRpcParams | undefined,
      routedAgentId: string
    ) => {
      const doneThreadId = codexThreadIdFromParams(routeParams)
      const doneTurnId = turnIdFromParams(routeParams)
      if (doneTurnId) {
        hub.turns.delete(doneTurnId)
        hub.turnThreads.delete(doneTurnId)
        hub.pendingTurnEvents.delete(doneTurnId)
      }
      if (doneThreadId) {
        for (const [turnId, turnThreadId] of hub.turnThreads.entries()) {
          if (turnThreadId === doneThreadId) {
            hub.turnThreads.delete(turnId)
            hub.turns.delete(turnId)
          }
        }
      }
      hub.pendingSubagentParents = hub.pendingSubagentParents.filter(
        ({ agentId }) => agentId !== routedAgentId
      )
      const isPrimaryThread = doneThreadId
        ? hub.primaryThreads.has(doneThreadId)
        : false
      if (
        doneThreadId &&
        codexThreadAgentIds.current.get(doneThreadId) === routedAgentId
      ) {
        codexThreadAgentIds.current.delete(doneThreadId)
      }
      if (isPrimaryThread) {
        setAgentStatus(routedAgentId, "disconnected")
        clearCodexAgentRuntimeState(routedAgentId)
      }
      pushDebugEvent(
        `codex task-done via=${method} agent=${shortId(routedAgentId)} thread=${shortId(doneThreadId)} hub=${hostFromUrl(hub.url)}`
      )
    },
    [clearCodexAgentRuntimeState, pushDebugEvent, setAgentStatus]
  )

  const codexNotificationHandlers = useMemo(
    () =>
      new Map<
        string,
        (
          hub: CodexHub,
          msg: CodexRpcMessage,
          routeParams: CodexRpcParams | undefined,
          routedAgentId: string,
          eventThreadId: string | undefined
        ) => void
      >([
        [
          "turn/started",
          (hub, msg, routeParams, routedAgentId) => {
            applyCodexTurnRouting(
              hub.turns,
              msg.method,
              routeParams,
              routedAgentId
            )
          },
        ],
        [
          "turn/completed",
          (hub, _msg, routeParams, routedAgentId) => {
            completeCodexTurnLifecycle(hub, routeParams, routedAgentId)
          },
        ],
        [
          "thread/name/updated",
          (_hub, msg, _routeParams, routedAgentId) => {
            setAgentThreadName(
              routedAgentId,
              codexThreadNameFromParams(msg.params)
            )
          },
        ],
        [
          "thread/started",
          (hub, _msg, _routeParams, _routedAgentId, eventThreadId) => {
            if (eventThreadId) {
              hub.primaryThreads.add(eventThreadId)
            }
          },
        ],
        [
          "codex/event/collab_agent_spawn_begin",
          (hub, _msg, _routeParams, routedAgentId, eventThreadId) => {
            if (eventThreadId) {
              hub.primaryThreads.add(eventThreadId)
            }
            enqueueCodexSubagentParent(hub, routedAgentId)
          },
        ],
        [
          "codex/event/collab_agent_spawn_end",
          (hub, _msg, _routeParams, _routedAgentId, eventThreadId) => {
            if (eventThreadId) {
              hub.primaryThreads.add(eventThreadId)
            }
          },
        ],
        [
          "thread/status/changed",
          (_hub, msg, _routeParams, routedAgentId) => {
            const status = codexStatusFromParams(msg.params)
            const validStatuses = new Set([
              "notLoaded",
              "idle",
              "active",
              "systemError",
            ])
            if (!(status && validStatuses.has(status))) {
              return
            }
            const threadStatus = status as CodexThreadStatus
            setAgents((prev) =>
              prev.map((a) => {
                if (a.id !== routedAgentId) {
                  return a
                }
                const nextStatus: Status =
                  threadStatus === "notLoaded" ? "disconnected" : "connected"
                return { ...a, threadStatus, status: nextStatus }
              })
            )
          },
        ],
        [
          "thread/closed",
          (hub, _msg, _routeParams, routedAgentId, eventThreadId) => {
            if (eventThreadId) {
              cleanUpUnsubscribedThread(hub, eventThreadId, routedAgentId)
            }
          },
        ],
      ]),
    [
      cleanUpUnsubscribedThread,
      clearCodexAgentRuntimeState,
      completeCodexTurnLifecycle,
      enqueueCodexSubagentParent,
      setAgentStatus,
      setAgentThreadName,
      setAgents,
    ]
  )

  const applyCodexNotificationByMethod = useCallback(
    (
      hub: CodexHub,
      msg: CodexRpcMessage,
      routeParams: CodexRpcParams | undefined,
      routedAgentId: string
    ) => {
      const method = msg.method
      if (!method) {
        return
      }
      const routedMsg = routeParams ? { ...msg, params: routeParams } : msg
      applyCodexStreamMessage(routedAgentId, routedMsg)
      const eventThreadId = codexThreadIdFromParams(routeParams)

      if (CODEX_OUTPUT_NOTIFICATION_METHODS.has(method)) {
        applyCodexProjectedOutput(routedMsg, routedAgentId, eventThreadId)
        return
      }

      if (CODEX_TASK_DONE_METHODS.has(method)) {
        completeCodexTaskLifecycle(hub, method, routeParams, routedAgentId)
        return
      }

      if (CODEX_NOOP_NOTIFICATION_METHODS.has(method)) {
        return
      }

      const handler = codexNotificationHandlers.get(method)
      if (!handler) {
        return
      }
      handler(hub, msg, routeParams, routedAgentId, eventThreadId)
    },
    [
      applyCodexStreamMessage,
      applyCodexProjectedOutput,
      codexNotificationHandlers,
      completeCodexTaskLifecycle,
    ]
  )

  const logCodexDrop = useCallback(
    (
      method: string | undefined,
      notificationThreadId: string | undefined,
      routeParams?: CodexRpcParams
    ) => {
      if (method === "item/agentMessage/delta") {
        return
      }
      const turnId = turnIdFromParams(routeParams)
      pushDebugEvent(
        `codex drop method=${method ?? "unknown"} thread=${shortId(notificationThreadId) || "-"} turn=${shortId(turnId) || "-"}`
      )
    },
    [pushDebugEvent]
  )

  const replayBufferedCodexTurnEvents = useCallback(
    (
      hub: CodexHub,
      turnId: string,
      routedAgentId: string,
      fallbackThreadId?: string
    ) => {
      const buffered = hub.pendingTurnEvents.get(turnId)
      if (!buffered || buffered.length === 0) {
        return
      }
      hub.pendingTurnEvents.delete(turnId)
      const now = Date.now()
      let replayed = 0
      for (const queued of buffered) {
        if (queued.expiresAt <= now) {
          continue
        }
        const replayThreadId =
          codexThreadIdFromParams(queued.msg.params) ??
          fallbackThreadId ??
          hub.turnThreads.get(turnId)
        const replayParams = replayThreadId
          ? { ...queued.msg.params, threadId: replayThreadId }
          : queued.msg.params
        applyCodexNotificationByMethod(
          hub,
          queued.msg,
          replayParams,
          routedAgentId
        )
        replayed += 1
      }
      if (replayed > 0) {
        pushDebugEvent(
          `codex replay turn=${shortId(turnId)} count=${replayed} agent=${shortId(routedAgentId)}`
        )
      }
    },
    [applyCodexNotificationByMethod, pushDebugEvent]
  )

  const finalizeCodexRoute = useCallback(
    (
      hub: CodexHub,
      msg: CodexRpcMessage,
      routeParams: CodexRpcParams | undefined,
      notificationThreadId: string | undefined,
      agentId: string,
      mappedThreadId: string | undefined
    ): string => {
      const routedAgentId = ensureCodexAgentThreadMatch(
        hub,
        agentId,
        notificationThreadId
      )
      const routeTurnId = turnIdFromParams(routeParams)
      const routeThreadId = notificationThreadId ?? mappedThreadId
      if (routeTurnId) {
        hub.turns.set(routeTurnId, routedAgentId)
        if (routeThreadId) {
          hub.turnThreads.set(routeTurnId, routeThreadId)
        }
      }
      if (mappedThreadId) {
        hub.threads.set(mappedThreadId, routedAgentId)
      }
      const quietMethods = new Set([
        "item/agentMessage/delta",
        "codex/event/agent_message_delta",
        "codex/event/agent_message_content_delta",
        "codex/event/raw_response_item",
        "rawResponseItem/completed",
        "codex/event/agent_message",
        "codex/event/item_completed",
        "codex/event/token_count",
        "account/rateLimits/updated",
        "thread/tokenUsage/updated",
        "item/commandExecution/outputDelta",
        "codex/event/exec_command_output_delta",
        "codex/event/exec_command_begin",
        "codex/event/exec_command_end",
        "item/reasoning/summaryTextDelta",
        "item/reasoning/summaryPartAdded",
        "item/reasoning/textDelta",
        "codex/event/agent_reasoning",
        "codex/event/agent_reasoning_delta",
        "codex/event/reasoning_content_delta",
        "codex/event/agent_reasoning_section_break",
        "item/started",
        "codex/event/item_started",
        "codex/event/collab_waiting_begin",
      ])
      if (!quietMethods.has(msg.method ?? "")) {
        pushDebugEvent(
          `codex route method=${msg.method ?? "unknown"} thread=${shortId(notificationThreadId) || "-"} turn=${shortId(routeTurnId) || "-"} agent=${shortId(routedAgentId)}`
        )
      }
      return routedAgentId
    },
    [ensureCodexAgentThreadMatch, pushDebugEvent]
  )

  const routeCodexNotification = useCallback(
    (hub: CodexHub, msg: CodexRpcMessage) => {
      const routeTurnId = turnIdFromParams(msg.params)
      const notificationThreadId =
        codexThreadIdFromParams(msg.params) ??
        (routeTurnId ? hub.turnThreads.get(routeTurnId) : undefined)
      ensureCodexNotificationThreadRoute(hub, notificationThreadId)

      const routeParams = notificationThreadId
        ? { ...msg.params, threadId: notificationThreadId }
        : msg.params
      const { agentId, mappedThreadId } = resolveCodexNotificationRoute(
        hub,
        msg,
        routeParams
      )
      if (!agentId) {
        if (routeTurnId && shouldBufferCodexTurnEvent(msg.method)) {
          bufferCodexTurnEvent(hub, routeTurnId, msg)
          return
        }
        logCodexDrop(msg.method, notificationThreadId, routeParams)
        return
      }
      const routedAgentId = finalizeCodexRoute(
        hub,
        msg,
        routeParams,
        notificationThreadId,
        agentId,
        mappedThreadId
      )
      if (routeTurnId) {
        replayBufferedCodexTurnEvents(
          hub,
          routeTurnId,
          routedAgentId,
          notificationThreadId ?? mappedThreadId
        )
      }
      applyCodexNotificationByMethod(hub, msg, routeParams, routedAgentId)
    },
    [
      applyCodexNotificationByMethod,
      bufferCodexTurnEvent,
      ensureCodexNotificationThreadRoute,
      finalizeCodexRoute,
      logCodexDrop,
      replayBufferedCodexTurnEvents,
      resolveCodexNotificationRoute,
      shouldBufferCodexTurnEvent,
    ]
  )

  const routeCodexResponse = useCallback(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: this is a protocol response router
    (hub: CodexHub, msg: CodexRpcMessage) => {
      const rpcId = msg.id
      if (typeof rpcId !== "number") {
        return
      }
      const ctx = hub.pending.get(rpcId)
      if (!ctx) {
        return
      }
      hub.pending.delete(rpcId)
      if ("error" in msg) {
        pushDebugEvent(
          `codex rpc-error id=${rpcId} type=${ctx.type} hub=${hostFromUrl(hub.url)}`
        )
        return
      }

      if (ctx.type === "initialize" && msg.result) {
        hub.initialized = true
        sendCodexPayload(
          hub,
          { jsonrpc: "2.0", method: "initialized" },
          ctx.agentId
        )
        if (ctx.spawnThread && ctx.agentId) {
          hub.rpcId++
          hub.pending.set(hub.rpcId, {
            agentId: ctx.agentId,
            type: "thread_start",
          })
          sendCodexPayload(
            hub,
            {
              jsonrpc: "2.0",
              method: "thread/start",
              id: hub.rpcId,
              params: CODEX_DEFAULT_THREAD_START_PARAMS,
            },
            ctx.agentId
          )
        } else {
          requestCodexLoadedList(hub)
        }
      } else if (
        ctx.type === "thread_start" &&
        ctx.agentId &&
        codexThreadIdFromResult(msg.result)
      ) {
        const threadId = codexThreadIdFromResult(msg.result)
        if (!threadId) {
          return
        }
        hub.primaryThreads.add(threadId)
        const mappedAgentId = bindCodexThreadToAgent(hub, ctx.agentId, threadId)
        // send pending message if any
        const pending =
          hub.pendingMsgs.get(ctx.agentId) ?? hub.pendingMsgs.get(mappedAgentId)
        if (pending) {
          hub.pendingMsgs.delete(ctx.agentId)
          hub.pendingMsgs.delete(mappedAgentId)
          hub.rpcId++
          hub.pending.set(hub.rpcId, {
            agentId: mappedAgentId,
            threadId,
            type: "turn_start",
          })
          sendCodexPayload(
            hub,
            {
              jsonrpc: "2.0",
              method: "turn/start",
              id: hub.rpcId,
              params: { threadId, input: [{ type: "text", text: pending }] },
            },
            mappedAgentId
          )
        }
        // subscribe to all other loaded threads so we see their output
        requestCodexLoadedList(hub)
      } else if (ctx.type === "loaded_list") {
        const loadedThreads = codexLoadedThreadIdsFromResult(msg.result)
        if (loadedThreads.length === 0) {
          return
        }
        const loadedThreadIds = new Set(loadedThreads)
        for (const [threadId, agentId] of hub.threads.entries()) {
          if (loadedThreadIds.has(threadId)) {
            continue
          }
          hub.threads.delete(threadId)
          hub.threadMetaRequested.delete(threadId)
          hub.agents.delete(agentId)
          setAgentStatus(agentId, "disconnected")
          clearCodexAgentRuntimeState(agentId)
          for (const [turnId, turnAgentId] of hub.turns.entries()) {
            if (turnAgentId === agentId) {
              hub.turns.delete(turnId)
            }
          }
          for (const [turnId, turnThreadId] of hub.turnThreads.entries()) {
            if (turnThreadId === threadId) {
              hub.turnThreads.delete(turnId)
            }
          }
        }

        // create/assign a tab per loaded thread we don't already track.
        // If we have primary threads, any loaded thread not in that set
        // is likely a sub-agent thread and should be routed to the parent
        // agent instead of getting its own tab.
        for (const tid of loadedThreads) {
          if (hub.threads.has(tid)) {
            continue
          }
          if (hub.primaryThreads.size > 0 && !hub.primaryThreads.has(tid)) {
            const parentAgentId = findActiveCodexPrimaryAgent(hub)
            if (parentAgentId) {
              hub.threads.set(tid, parentAgentId)
              hub.agents.add(parentAgentId)
              continue
            }
          }
          const unassignedAgentId = findUnassignedCodexHubAgent(hub)
          if (unassignedAgentId) {
            bindCodexThreadToAgent(hub, unassignedAgentId, tid)
          } else {
            attachDiscoveredCodexThread(hub, tid)
          }
        }
      } else if (ctx.type === "thread_read" && ctx.agentId) {
        const preview = codexThreadPreviewFromResult(msg.result)
        if (preview) {
          setAgentThreadNameIfMissing(ctx.agentId, preview)
        }
      } else if (ctx.type === "turn_start" && ctx.agentId) {
        const startedTurnId = codexTurnIdFromResult(msg.result)
        if (!startedTurnId) {
          return
        }
        // turn started, notifications will follow
        hub.turns.set(startedTurnId, ctx.agentId)
        if (ctx.threadId) {
          hub.turnThreads.set(startedTurnId, ctx.threadId)
        }
      } else if (ctx.type === "turn_interrupt") {
        // interrupt confirmed, turn/completed notification will follow
      } else if (ctx.type === "turn_steer") {
        // steer confirmed, turn continues with new input
      } else if (
        ctx.type === "thread_resume" &&
        ctx.agentId &&
        codexThreadIdFromResult(msg.result)
      ) {
        const threadId = codexThreadIdFromResult(msg.result)
        if (!threadId) {
          return
        }
        hub.primaryThreads.add(threadId)
        bindCodexThreadToAgent(hub, ctx.agentId, threadId)
        requestCodexLoadedList(hub)
      } else if (
        ctx.type === "thread_fork" &&
        ctx.agentId &&
        codexThreadIdFromResult(msg.result)
      ) {
        const threadId = codexThreadIdFromResult(msg.result)
        if (!threadId) {
          return
        }
        hub.primaryThreads.add(threadId)
        bindCodexThreadToAgent(hub, ctx.agentId, threadId)
        requestCodexLoadedList(hub)
      } else if (ctx.type === "thread_list") {
        const result = msg.result as Record<string, unknown> | undefined
        if (result) {
          const data = Array.isArray(result.data) ? result.data : []
          threadListResult.current = {
            data: data.map(
              (t: Record<string, unknown>) =>
                ({
                  id: String(t.id ?? ""),
                  preview: String(t.preview ?? ""),
                  modelProvider: String(t.modelProvider ?? ""),
                  createdAt: Number(t.createdAt ?? 0),
                  updatedAt: Number(t.updatedAt ?? 0),
                  cwd: String(t.cwd ?? ""),
                }) as CodexThreadListResult["data"][number]
            ),
            nextCursor:
              typeof result.nextCursor === "string" ? result.nextCursor : null,
          }
        }
        pushDebugEvent(
          `codex thread/list received count=${threadListResult.current?.data.length ?? 0}`
        )
      } else if (ctx.type === "thread_archive") {
        // archive confirmed, thread/archived notification will follow
      } else if (ctx.type === "thread_unarchive") {
        // unarchive confirmed, thread/unarchived notification will follow
      } else if (ctx.type === "thread_name_set" && ctx.agentId) {
        // name set confirmed, thread/name/updated notification will follow
      } else if (ctx.type === "thread_rollback") {
        // rollback confirmed
      } else if (ctx.type === "thread_compact") {
        // compact started, thread/compacted notification will follow
      } else if (ctx.type === "thread_unsubscribe" && ctx.threadId) {
        const unsubStatus = codexUnsubscribeStatusFromResult(msg.result)
        const targetAgentId = ctx.agentId ?? hub.threads.get(ctx.threadId)
        if (unsubStatus === "notSubscribed") {
          pushDebugEvent(
            `codex unsubscribe-warn status=notSubscribed thread=${shortId(ctx.threadId)} hub=${hostFromUrl(hub.url)}`
          )
        }
        if (targetAgentId) {
          cleanUpUnsubscribedThread(hub, ctx.threadId, targetAgentId)
        }
        pushDebugEvent(
          `codex unsubscribe-done status=${unsubStatus ?? "unknown"} thread=${shortId(ctx.threadId)} agent=${shortId(targetAgentId)} hub=${hostFromUrl(hub.url)}`
        )
      }
    },
    [
      attachDiscoveredCodexThread,
      bindCodexThreadToAgent,
      cleanUpUnsubscribedThread,
      clearCodexAgentRuntimeState,
      findActiveCodexPrimaryAgent,
      findUnassignedCodexHubAgent,
      pushDebugEvent,
      requestCodexLoadedList,
      sendCodexPayload,
      setAgentStatus,
      setAgentThreadNameIfMissing,
    ]
  )

  const CODEX_KNOWN_SERVER_REQUEST_METHODS = useMemo(
    () =>
      new Set([
        "item/commandExecution/requestApproval",
        "item/fileChange/requestApproval",
        "item/tool/requestUserInput",
      ]),
    []
  )

  const routeCodexParsedMessage = useCallback(
    (hub: CodexHub, msg: CodexRpcMessage) => {
      if ("id" in msg && ("result" in msg || "error" in msg)) {
        routeCodexResponse(hub, msg)
        return
      }
      if ("id" in msg && msg.method) {
        // Server-initiated request: has both id and method.
        // Route as notification (handles approval requests etc.)
        routeCodexNotification(hub, msg)
        // For unknown server requests, send method-not-found error
        if (!CODEX_KNOWN_SERVER_REQUEST_METHODS.has(msg.method)) {
          sendCodexPayload(hub, {
            jsonrpc: "2.0",
            id: msg.id,
            error: {
              code: -32_601,
              message: `Method not found: ${msg.method}`,
            },
          })
        }
        return
      }
      if (msg.method) {
        routeCodexNotification(hub, msg)
      }
    },
    [
      CODEX_KNOWN_SERVER_REQUEST_METHODS,
      routeCodexResponse,
      routeCodexNotification,
      sendCodexPayload,
    ]
  )

  const handleCodexMessage = useCallback(
    (hub: CodexHub, raw: string) => {
      const buffered = bufferNdjsonChunk(raw, hub.lineBuffer)
      hub.lineBuffer = buffered.carry
      for (const line of buffered.lines) {
        if (!line.trim()) {
          continue
        }
        trackCodexFrame({
          connectionId: hub.url,
          direction: "in",
          payload: line,
          timestamp: Date.now(),
          url: hub.url,
        })
        try {
          const msg = JSON.parse(line) as CodexRpcMessage
          routeCodexParsedMessage(hub, msg)
        } catch {
          const rawThreadId = parseCodexThreadIdFromRawLine(line)
          if (rawThreadId) {
            pushDebugEvent(
              `codex route raw-thread=${shortId(rawThreadId)} hub=${hostFromUrl(hub.url)}`
            )
            attachDiscoveredCodexThread(hub, rawThreadId)
          }
        }
      }
    },
    [
      attachDiscoveredCodexThread,
      pushDebugEvent,
      routeCodexParsedMessage,
      trackCodexFrame,
    ]
  )

  const getOrCreateCodexHub = useCallback(
    (
      targetUrl: string,
      firstAgentId?: string,
      opts?: { silent?: boolean }
    ): CodexHub => {
      const existing = codexHubs.get(targetUrl)
      if (existing) {
        if (firstAgentId) {
          existing.agents.add(firstAgentId)
        }
        if (!opts?.silent) {
          existing.reconnectEnabled = true
        }
        if (existing.initialized) {
          requestCodexLoadedList(existing)
        }
        return existing
      }

      // Cancel any pending reconnect for this URL — a fresh connection
      // (typically from discovery) supersedes the reconnect loop.
      const pendingReconnect = reconnectTimers.get(targetUrl)
      if (pendingReconnect) {
        clearTimeout(pendingReconnect)
        reconnectTimers.delete(targetUrl)
      }

      const ws = new WebSocket(targetUrl)
      const hub: CodexHub = {
        ws,
        url: targetUrl,
        rpcId: 0,
        initialized: false,
        lineBuffer: "",
        agents: new Set(firstAgentId ? [firstAgentId] : []),
        primaryThreads: new Set(),
        reconnectEnabled: !opts?.silent,
        threads: new Map(),
        turnThreads: new Map(),
        turns: new Map(),
        threadMetaRequested: new Set(),
        pending: new Map(),
        pendingMsgs: new Map(),
        pendingSubagentParents: [],
        pendingTurnEvents: new Map(),
      }
      codexHubs.set(targetUrl, hub)
      ensureBeforeUnloadListener()
      pushDebugEvent(
        `codex hub-create hub=${hostFromUrl(targetUrl)} silent=${Boolean(opts?.silent)} agent=${shortId(firstAgentId)}`
      )

      ws.onopen = () => {
        hub.rpcId++
        hub.pending.set(hub.rpcId, {
          agentId: firstAgentId,
          spawnThread: Boolean(firstAgentId) && !opts?.silent,
          type: "initialize",
        })
        sendCodexPayload(hub, {
          jsonrpc: "2.0",
          method: "initialize",
          id: hub.rpcId,
          params: {
            clientInfo: {
              name: "agents-ui",
              version: "0.1.0",
              title: "Agents UI",
            },
            capabilities: {
              experimentalApi: true,
            },
          },
        })
      }
      ws.onmessage = (e) => handleCodexMessage(hub, e.data)
      ws.onclose = () => {
        pushDebugEvent(
          `codex hub-close hub=${hostFromUrl(targetUrl)} agents=${hub.agents.size} threads=${hub.threads.size} reconnect=${hub.reconnectEnabled}`
        )
        // Clear stale thread→agent mappings so reconnects don't route to dead agents
        for (const [threadId, agentId] of hub.threads.entries()) {
          if (codexThreadAgentIds.current.get(threadId) === agentId) {
            codexThreadAgentIds.current.delete(threadId)
          }
        }
        // collect agent IDs before clearing
        const agentIds = [...hub.agents]
        codexHubs.delete(targetUrl)

        if (agentIds.length === 0) {
          return
        }

        if (!hub.reconnectEnabled) {
          for (const agentId of agentIds) {
            clearCodexAgentRuntimeState(agentId)
          }
          setAgents((prev) =>
            prev
              .filter(
                (a) =>
                  !(
                    a.url === targetUrl &&
                    a.protocol === "codex" &&
                    a.status === "connecting" &&
                    !a.output &&
                    a.streamItems.length === 0
                  )
              )
              .map((a) =>
                a.url === targetUrl && a.protocol === "codex"
                  ? {
                      ...a,
                      status: "disconnected" as Status,
                      threadId: undefined,
                    }
                  : a
              )
          )
          return
        }

        // Freeze existing tabs on disconnect and clear stale threadIds.
        // A reconnected hub will discover threads again and create fresh tabs.
        for (const agentId of agentIds) {
          setAgentStatus(agentId, "disconnected")
          clearCodexAgentRuntimeState(agentId)
        }
        setAgents((prev) =>
          prev.map((a) => {
            const isHubAgent = a.url === targetUrl && a.protocol === "codex"
            return isHubAgent ? { ...a, threadId: undefined } : a
          })
        )

        const attemptReconnect = (attempt: number) => {
          const scheduled = scheduleReconnect(targetUrl, attempt, () => {
            const newWs = new WebSocket(targetUrl)
            let connectedHub: CodexHub | undefined

            newWs.onopen = () => {
              // If discovery already created a hub for this URL, abort the
              // reconnect to avoid overwriting it with a duplicate connection.
              if (codexHubs.has(targetUrl)) {
                pushDebugEvent(
                  `codex reconnect-abort hub=${hostFromUrl(targetUrl)} (discovery already connected)`
                )
                newWs.close()
                reconnectTimers.delete(targetUrl)
                return
              }

              pushDebugEvent(
                `codex reconnect-open hub=${hostFromUrl(targetUrl)} attempt=${attempt}`
              )
              // rebuild the hub
              const newHub: CodexHub = {
                ws: newWs,
                url: targetUrl,
                rpcId: 0,
                initialized: false,
                lineBuffer: "",
                agents: new Set(),
                primaryThreads: new Set(),
                reconnectEnabled: true,
                threads: new Map(),
                turnThreads: new Map(),
                turns: new Map(),
                threadMetaRequested: new Set(),
                pending: new Map(),
                pendingMsgs: new Map(),
                pendingSubagentParents: [],
                pendingTurnEvents: new Map(),
              }
              connectedHub = newHub
              codexHubs.set(targetUrl, newHub)

              newWs.onmessage = (e) => handleCodexMessage(newHub, e.data)

              // send initialize RPC
              newHub.rpcId++
              newHub.pending.set(newHub.rpcId, {
                type: "initialize",
              })
              sendCodexPayload(newHub, {
                jsonrpc: "2.0",
                method: "initialize",
                id: newHub.rpcId,
                params: {
                  clientInfo: {
                    name: "agents-ui",
                    version: "0.1.0",
                    title: "Agents UI",
                  },
                  capabilities: {
                    experimentalApi: true,
                  },
                },
              })

              reconnectTimers.delete(targetUrl)
            }

            // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: reconnect lifecycle with thread cleanup
            newWs.onclose = () => {
              codexHubs.delete(targetUrl)
              if (connectedHub) {
                // Clear stale thread→agent mappings before marking agents as disconnected
                for (const [
                  threadId,
                  agentId,
                ] of connectedHub.threads.entries()) {
                  if (codexThreadAgentIds.current.get(threadId) === agentId) {
                    codexThreadAgentIds.current.delete(threadId)
                  }
                }
                for (const aid of connectedHub.agents) {
                  setAgentStatus(aid, "disconnected")
                  clearCodexAgentRuntimeState(aid)
                }
              }
              attemptReconnect(attempt + 1)
            }

            newWs.onerror = () => {
              // handled via close/retry
            }
          })

          if (!scheduled) {
            for (const agentId of agentIds) {
              setAgentStatus(agentId, "disconnected")
              clearCodexAgentRuntimeState(agentId)
            }
            reconnectTimers.delete(targetUrl)
          }
        }

        attemptReconnect(0)
      }

      return hub
    },
    [
      handleCodexMessage,
      pushDebugEvent,
      clearCodexAgentRuntimeState,
      requestCodexLoadedList,
      sendCodexPayload,
      setAgentStatus,
      setAgents,
    ]
  )

  const spawnCodexThread = useCallback(
    (targetUrl: string, opts?: { silent?: boolean }): string => {
      const id = crypto.randomUUID()
      const agent: Agent = {
        id,
        url: targetUrl,
        protocol: "codex",
        status: "connecting",
        output: "",
        streamItems: [],
      }
      setAgents((prev) => [...prev, agent])

      const hub = getOrCreateCodexHub(targetUrl, id, opts)

      if (hub.initialized) {
        // hub already initialized, just create a new thread
        hub.rpcId++
        hub.pending.set(hub.rpcId, { agentId: id, type: "thread_start" })
        sendCodexPayload(
          hub,
          {
            jsonrpc: "2.0",
            method: "thread/start",
            id: hub.rpcId,
            params: CODEX_DEFAULT_THREAD_START_PARAMS,
          },
          id
        )
      }
      // else: initialization in progress, the first agent's init flow
      // handles thread creation. For additional agents on a new hub,
      // we need to queue thread creation after init completes.
      // This is handled: getOrCreateCodexHub only inits for the first agent.
      // For subsequent agents on a not-yet-initialized hub, queue it:
      if (!hub.initialized && hub.threads.size === 0 && hub.pending.size > 0) {
        // hub is initializing with the first agent, queue this one
        let waitRetries = 0
        const maxWaitRetries = 50 // 5 seconds max
        const waitForInit = () => {
          if (
            hub.ws.readyState !== WebSocket.OPEN ||
            waitRetries >= maxWaitRetries
          ) {
            return
          }
          if (hub.initialized) {
            hub.rpcId++
            hub.pending.set(hub.rpcId, { agentId: id, type: "thread_start" })
            sendCodexPayload(
              hub,
              {
                jsonrpc: "2.0",
                method: "thread/start",
                id: hub.rpcId,
                params: CODEX_DEFAULT_THREAD_START_PARAMS,
              },
              id
            )
          } else {
            waitRetries++
            setTimeout(waitForInit, 100)
          }
        }
        // only queue if this isn't the first agent (first is handled by init flow)
        if (hub.pending.values().next().value?.agentId !== id) {
          waitForInit()
        }
      }

      return id
    },
    [getOrCreateCodexHub, sendCodexPayload, setAgents]
  )

  const connectCodex = useCallback(
    (targetUrl: string, opts?: { silent?: boolean }) => {
      if (opts?.silent) {
        getOrCreateCodexHub(targetUrl, undefined, opts)
      } else {
        spawnCodexThread(targetUrl, opts)
      }
    },
    [getOrCreateCodexHub, spawnCodexThread]
  )

  const sendCodexRpcResponse = useCallback(
    (
      agentId: string,
      requestId: number | string,
      result: Record<string, unknown>
    ): boolean => {
      for (const hub of codexHubs.values()) {
        if (!hub.agents.has(agentId)) {
          continue
        }
        if (hub.ws.readyState !== WebSocket.OPEN) {
          pushDebugEvent(
            `codex approval-drop agent=${shortId(agentId)} reason=ws-not-open`
          )
          return false
        }
        sendCodexPayload(
          hub,
          {
            jsonrpc: "2.0",
            id: requestId,
            result,
          },
          agentId
        )
        pushDebugEvent(
          `codex approval-send agent=${shortId(agentId)} request=${String(requestId)}`
        )
        return true
      }
      pushDebugEvent(
        `codex approval-drop agent=${shortId(agentId)} reason=no-hub`
      )
      return false
    },
    [pushDebugEvent, sendCodexPayload]
  )

  const findHubForAgent = useCallback(
    (agentId: string): CodexHub | undefined => {
      for (const hub of codexHubs.values()) {
        if (hub.agents.has(agentId)) {
          return hub
        }
      }
      return undefined
    },
    []
  )

  // Phase 1a: turn/interrupt
  const interruptCodexTurn = useCallback(
    (agentId: string) => {
      const hub = findHubForAgent(agentId)
      if (!hub || hub.ws.readyState !== WebSocket.OPEN) {
        return
      }
      const agent = agentsRef.current.find((a) => a.id === agentId)
      const threadId = agent?.threadId
      if (!threadId) {
        return
      }
      // Find active turn for this agent
      let activeTurnId: string | undefined
      for (const [turnId, turnAgentId] of hub.turns.entries()) {
        if (turnAgentId === agentId) {
          activeTurnId = turnId
          break
        }
      }
      if (!activeTurnId) {
        return
      }
      hub.rpcId++
      hub.pending.set(hub.rpcId, {
        agentId,
        type: "turn_interrupt",
      })
      sendCodexPayload(
        hub,
        {
          jsonrpc: "2.0",
          method: "turn/interrupt",
          id: hub.rpcId,
          params: { threadId, turnId: activeTurnId },
        },
        agentId
      )
    },
    [agentsRef, findHubForAgent, sendCodexPayload]
  )

  // Phase 1a: turn/steer
  const steerCodexTurn = useCallback(
    (agentId: string, input: string) => {
      const hub = findHubForAgent(agentId)
      if (!hub || hub.ws.readyState !== WebSocket.OPEN) {
        return
      }
      const agent = agentsRef.current.find((a) => a.id === agentId)
      const threadId = agent?.threadId
      if (!threadId) {
        return
      }
      // Find active turn for this agent
      let activeTurnId: string | undefined
      for (const [turnId, turnAgentId] of hub.turns.entries()) {
        if (turnAgentId === agentId) {
          activeTurnId = turnId
          break
        }
      }
      if (!activeTurnId) {
        return
      }
      hub.rpcId++
      hub.pending.set(hub.rpcId, {
        agentId,
        type: "turn_steer",
      })
      sendCodexPayload(
        hub,
        {
          jsonrpc: "2.0",
          method: "turn/steer",
          id: hub.rpcId,
          params: {
            threadId,
            turnId: activeTurnId,
            input: [{ type: "text", text: input }],
          },
        },
        agentId
      )
    },
    [agentsRef, findHubForAgent, sendCodexPayload]
  )

  // Phase 1b: thread/resume
  const resumeCodexThread = useCallback(
    (hubUrl: string, threadId: string): void => {
      const hub = codexHubs.get(hubUrl)
      if (!hub?.initialized || hub.ws.readyState !== WebSocket.OPEN) {
        return
      }
      const agentId = crypto.randomUUID()
      const agent: Agent = {
        id: agentId,
        url: hubUrl,
        protocol: "codex",
        status: "connecting",
        output: "",
        streamItems: [],
      }
      setAgents((prev) => [...prev, agent])
      hub.agents.add(agentId)
      hub.rpcId++
      hub.pending.set(hub.rpcId, {
        agentId,
        threadId,
        type: "thread_resume",
      })
      sendCodexPayload(
        hub,
        {
          jsonrpc: "2.0",
          method: "thread/resume",
          id: hub.rpcId,
          params: {
            threadId,
            persistExtendedHistory: true,
          },
        },
        agentId
      )
    },
    [sendCodexPayload, setAgents]
  )

  // Phase 1b: thread/fork
  const forkCodexThread = useCallback(
    (agentId: string, threadId: string): string => {
      const hub = findHubForAgent(agentId)
      if (!hub || hub.ws.readyState !== WebSocket.OPEN) {
        return agentId
      }
      hub.rpcId++
      hub.pending.set(hub.rpcId, {
        agentId,
        type: "thread_fork",
      })
      sendCodexPayload(
        hub,
        {
          jsonrpc: "2.0",
          method: "thread/fork",
          id: hub.rpcId,
          params: { threadId },
        },
        agentId
      )
      return agentId
    },
    [findHubForAgent, sendCodexPayload]
  )

  // Phase 2b: thread/archive
  const archiveCodexThread = useCallback(
    (agentId: string, threadId: string) => {
      const hub = findHubForAgent(agentId)
      if (!hub || hub.ws.readyState !== WebSocket.OPEN) {
        return
      }
      hub.rpcId++
      hub.pending.set(hub.rpcId, {
        agentId,
        type: "thread_archive",
      })
      sendCodexPayload(
        hub,
        {
          jsonrpc: "2.0",
          method: "thread/archive",
          id: hub.rpcId,
          params: { threadId },
        },
        agentId
      )
    },
    [findHubForAgent, sendCodexPayload]
  )

  // Phase 2b: thread/unarchive
  const unarchiveCodexThread = useCallback(
    (agentId: string, threadId: string) => {
      const hub = findHubForAgent(agentId)
      if (!hub || hub.ws.readyState !== WebSocket.OPEN) {
        return
      }
      hub.rpcId++
      hub.pending.set(hub.rpcId, {
        agentId,
        type: "thread_unarchive",
      })
      sendCodexPayload(
        hub,
        {
          jsonrpc: "2.0",
          method: "thread/unarchive",
          id: hub.rpcId,
          params: { threadId },
        },
        agentId
      )
    },
    [findHubForAgent, sendCodexPayload]
  )

  // Phase 2b: thread/name/set
  const setCodexThreadName = useCallback(
    (agentId: string, threadId: string, name: string) => {
      const hub = findHubForAgent(agentId)
      if (!hub || hub.ws.readyState !== WebSocket.OPEN) {
        return
      }
      hub.rpcId++
      hub.pending.set(hub.rpcId, {
        agentId,
        type: "thread_name_set",
      })
      sendCodexPayload(
        hub,
        {
          jsonrpc: "2.0",
          method: "thread/name/set",
          id: hub.rpcId,
          params: { threadId, name },
        },
        agentId
      )
    },
    [findHubForAgent, sendCodexPayload]
  )

  // Phase 2b: thread/rollback
  const rollbackCodexThread = useCallback(
    (agentId: string, threadId: string, numTurns: number) => {
      const hub = findHubForAgent(agentId)
      if (!hub || hub.ws.readyState !== WebSocket.OPEN) {
        return
      }
      hub.rpcId++
      hub.pending.set(hub.rpcId, {
        agentId,
        type: "thread_rollback",
      })
      sendCodexPayload(
        hub,
        {
          jsonrpc: "2.0",
          method: "thread/rollback",
          id: hub.rpcId,
          params: { threadId, numTurns },
        },
        agentId
      )
    },
    [findHubForAgent, sendCodexPayload]
  )

  // Phase 2b: thread/compact/start
  const compactCodexThread = useCallback(
    (agentId: string, threadId: string) => {
      const hub = findHubForAgent(agentId)
      if (!hub || hub.ws.readyState !== WebSocket.OPEN) {
        return
      }
      hub.rpcId++
      hub.pending.set(hub.rpcId, {
        agentId,
        type: "thread_compact",
      })
      sendCodexPayload(
        hub,
        {
          jsonrpc: "2.0",
          method: "thread/compact/start",
          id: hub.rpcId,
          params: { threadId },
        },
        agentId
      )
    },
    [findHubForAgent, sendCodexPayload]
  )

  const disconnectCodexThread = useCallback(
    (agentId: string, threadId: string): boolean => {
      for (const hub of codexHubs.values()) {
        if (!hub.agents.has(agentId)) {
          continue
        }
        if (hub.ws.readyState !== WebSocket.OPEN) {
          pushDebugEvent(
            `codex unsubscribe-local agent=${shortId(agentId)} thread=${shortId(threadId)} reason=ws-not-open`
          )
          cleanUpUnsubscribedThread(hub, threadId, agentId)
          return true
        }
        hub.rpcId++
        hub.pending.set(hub.rpcId, {
          agentId,
          threadId,
          type: "thread_unsubscribe",
        })
        sendCodexPayload(
          hub,
          {
            jsonrpc: "2.0",
            method: "thread/unsubscribe",
            id: hub.rpcId,
            params: { threadId },
          },
          agentId
        )
        pushDebugEvent(
          `codex unsubscribe-send agent=${shortId(agentId)} thread=${shortId(threadId)} hub=${hostFromUrl(hub.url)}`
        )
        return true
      }
      pushDebugEvent(
        `codex unsubscribe-drop agent=${shortId(agentId)} thread=${shortId(threadId)} reason=no-hub`
      )
      return false
    },
    [cleanUpUnsubscribedThread, pushDebugEvent, sendCodexPayload]
  )

  return {
    archiveCodexThread,
    codexOutputStates,
    codexThreadAgentIds,
    compactCodexThread,
    connectCodex,
    disconnectCodexThread,
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
  }
}
