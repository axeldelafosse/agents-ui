"use client"

import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import { useCallback, useRef } from "react"
import { CLAUDE_PRETTY_MODE } from "@/app/features/agents/constants"
import {
  looksLikeClaudeInitLine,
  parseClaudeSessionIdFromRawLine,
} from "@/app/features/agents/discovery"
import {
  claudeConns,
  reconnectTimers,
  scheduleReconnect,
} from "@/app/features/agents/runtime-state"
import { shortId } from "@/app/features/agents/tab-utils"
import type {
  Agent,
  ClaudeUIMessage,
  Status,
} from "@/app/features/agents/types"
import {
  adaptClaudeStreamMessage,
  type ClaudeStreamAdapterState,
  createClaudeStreamAdapterState,
} from "@/lib/claude-stream-adapter"
import { applyStreamActions } from "@/lib/stream-items"
import {
  type ClaudeOutputMessage,
  type ClaudeOutputState,
  createClaudeOutputState,
  reduceClaudeOutput,
} from "@/lib/stream-output"
import {
  bufferNdjsonChunk,
  claudeSessionId,
  isClaudeInitMessage,
  unwrapClaudeRawMessage,
} from "@/lib/stream-parsing"

interface UseClaudeRuntimeParams {
  agentsRef: MutableRefObject<Agent[]>
  pushDebugEvent: (text: string) => void
  setAgentStatus: (id: string, status: Status) => void
  setAgents: Dispatch<SetStateAction<Agent[]>>
}

interface UseClaudeRuntimeResult {
  claudeOutputStates: MutableRefObject<Map<string, ClaudeOutputState>>
  claudeSessionAgentIds: MutableRefObject<Map<string, string>>
  claudeSessionIds: MutableRefObject<Map<string, string>>
  connectClaude: (targetUrl: string, opts?: { silent?: boolean }) => void
  sendClaudeControlResponse: (
    agentId: string,
    payload: {
      allow: boolean
      input?: string | Record<string, string>
      requestId: string
      updatedInput?: unknown
    }
  ) => boolean
}

export function useClaudeRuntime({
  agentsRef,
  pushDebugEvent,
  setAgentStatus,
  setAgents,
}: UseClaudeRuntimeParams): UseClaudeRuntimeResult {
  const claudeLineBuffers = useRef(new Map<string, string>())
  const claudeOutputStates = useRef(new Map<string, ClaudeOutputState>())
  const claudeStreamAdapterStates = useRef(
    new Map<string, ClaudeStreamAdapterState>()
  )
  const claudeConnectionAgentIds = useRef(new Map<string, string>())
  const claudeConnectionOwnedAgents = useRef(new Map<string, Set<string>>())
  const claudeSessionIds = useRef(new Map<string, string>())
  const claudeSessionAgentIds = useRef(new Map<string, string>())

  const applyClaudeStreamMessage = useCallback(
    (id: string, msg: ClaudeUIMessage) => {
      const currentState =
        claudeStreamAdapterStates.current.get(id) ??
        createClaudeStreamAdapterState()
      const result = adaptClaudeStreamMessage(msg, currentState, {
        agentId: id,
      })
      claudeStreamAdapterStates.current.set(id, result.state)
      if (result.actions.length === 0) {
        return
      }
      setAgents((prev) =>
        prev.map((agent) => {
          if (agent.id !== id) {
            return agent
          }
          const streamItems = applyStreamActions(
            agent.streamItems,
            result.actions
          )
          if (streamItems === agent.streamItems) {
            return agent
          }
          return { ...agent, streamItems }
        })
      )
    },
    [setAgents]
  )

  const applyClaudeOutputMessage = useCallback(
    (id: string, msg: ClaudeOutputMessage) => {
      setAgents((prev) =>
        prev.map((agent) => {
          if (agent.id !== id) {
            return agent
          }
          const currentState =
            claudeOutputStates.current.get(id) ?? createClaudeOutputState()
          const result = reduceClaudeOutput(agent.output, currentState, msg, {
            prettyMode: CLAUDE_PRETTY_MODE,
          })
          claudeOutputStates.current.set(id, result.state)
          if (result.output === agent.output) {
            return agent
          }
          return { ...agent, output: result.output }
        })
      )
    },
    [setAgents]
  )

  const setAgentSession = useCallback(
    (id: string, sessionId: string) => {
      const previousSessionId = agentsRef.current.find(
        (a) => a.id === id
      )?.sessionId
      if (
        previousSessionId &&
        previousSessionId !== sessionId &&
        claudeSessionAgentIds.current.get(previousSessionId) === id
      ) {
        claudeSessionAgentIds.current.delete(previousSessionId)
      }
      claudeSessionAgentIds.current.set(sessionId, id)
      claudeSessionIds.current.set(id, sessionId)
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? { ...a, sessionId } : a))
      )
    },
    [agentsRef, setAgents]
  )

  const addToOwnedAgents = useCallback(
    (connectionId: string, agentId: string) => {
      const owned = claudeConnectionOwnedAgents.current.get(connectionId)
      if (owned) {
        owned.add(agentId)
      } else {
        claudeConnectionOwnedAgents.current.set(
          connectionId,
          new Set([agentId])
        )
      }
    },
    []
  )

  const rotateClaudeSessionAgent = useCallback(
    (connectionId: string, sessionId: string): string => {
      const currentAgentId =
        claudeConnectionAgentIds.current.get(connectionId) ?? connectionId
      const canonicalAgentId = claudeSessionAgentIds.current.get(sessionId)
      if (canonicalAgentId) {
        // Skip stale mapping to a disconnected agent
        const canonicalAgent = agentsRef.current.find(
          (a) => a.id === canonicalAgentId
        )
        if (canonicalAgent?.status === "disconnected") {
          claudeSessionAgentIds.current.delete(sessionId)
          // Fall through to create a fresh agent below
        } else {
          claudeConnectionAgentIds.current.set(connectionId, canonicalAgentId)
          addToOwnedAgents(connectionId, canonicalAgentId)
          return canonicalAgentId
        }
      }
      const currentSessionId = claudeSessionIds.current.get(currentAgentId)
      const currentAgent = agentsRef.current.find(
        (a) => a.id === currentAgentId
      )
      const currentHasContent = Boolean(
        currentAgent?.output || currentAgent?.streamItems.length
      )
      if (
        currentSessionId === sessionId &&
        currentAgent?.status !== "disconnected"
      ) {
        return currentAgentId
      }
      if (
        !(currentSessionId || currentHasContent) &&
        currentAgent?.status !== "disconnected"
      ) {
        return currentAgentId
      }
      if (!currentAgent) {
        return currentAgentId
      }

      const nextAgentId = crypto.randomUUID()
      const nextAgent: Agent = {
        id: nextAgentId,
        output: "",
        streamItems: [],
        protocol: "claude",
        sessionId,
        status: currentAgent.status,
        url: currentAgent.url,
      }
      setAgents((prev) => [...prev, nextAgent])
      claudeSessionIds.current.set(nextAgentId, sessionId)
      claudeConnectionAgentIds.current.set(connectionId, nextAgentId)
      addToOwnedAgents(connectionId, nextAgentId)
      return nextAgentId
    },
    [agentsRef, setAgents, addToOwnedAgents]
  )

  const rotateClaudeConnectionAgent = useCallback(
    (connectionId: string) => {
      const currentAgentId =
        claudeConnectionAgentIds.current.get(connectionId) ?? connectionId
      const currentAgent = agentsRef.current.find(
        (agent) => agent.id === currentAgentId
      )
      if (!currentAgent) {
        return currentAgentId
      }
      if (
        !(
          currentAgent.output ||
          currentAgent.sessionId ||
          currentAgent.streamItems.length
        )
      ) {
        return currentAgentId
      }

      const nextAgentId = crypto.randomUUID()
      const nextAgent: Agent = {
        id: nextAgentId,
        output: "",
        streamItems: [],
        protocol: "claude",
        status: "connected",
        url: currentAgent.url,
      }
      setAgents((prev) => [
        ...prev.map((agent) =>
          agent.id === currentAgentId
            ? { ...agent, status: "disconnected" as Status }
            : agent
        ),
        nextAgent,
      ])
      claudeConnectionAgentIds.current.set(connectionId, nextAgentId)
      const owned = claudeConnectionOwnedAgents.current.get(connectionId)
      if (owned) {
        owned.add(nextAgentId)
      } else {
        claudeConnectionOwnedAgents.current.set(
          connectionId,
          new Set([nextAgentId])
        )
      }
      return nextAgentId
    },
    [agentsRef, setAgents]
  )

  const routeClaudeAgent = useCallback(
    (
      connectionId: string,
      initialAgentId: string,
      sessionId: string | undefined,
      isInit: boolean
    ): string => {
      if (sessionId) {
        const agentId = rotateClaudeSessionAgent(connectionId, sessionId)
        setAgentSession(agentId, sessionId)
        setAgentStatus(agentId, "connected")
        if (agentId !== initialAgentId) {
          pushDebugEvent(
            `claude rotate session=${shortId(sessionId)} from=${shortId(initialAgentId)} to=${shortId(agentId)}`
          )
        }
        return agentId
      }
      if (isInit) {
        const agentId = rotateClaudeConnectionAgent(connectionId)
        setAgentStatus(agentId, "connected")
        if (agentId !== initialAgentId) {
          pushDebugEvent(
            `claude rotate init from=${shortId(initialAgentId)} to=${shortId(agentId)}`
          )
        }
        return agentId
      }
      return initialAgentId
    },
    [
      pushDebugEvent,
      rotateClaudeConnectionAgent,
      rotateClaudeSessionAgent,
      setAgentSession,
      setAgentStatus,
    ]
  )

  const handleClaudeStatusDisconnect = useCallback(
    (connectionId: string, mappedAgentId: string) => {
      pushDebugEvent(
        `claude status-disconnect agent=${shortId(mappedAgentId)} conn=${shortId(connectionId)}`
      )
      const ownedAgents =
        claudeConnectionOwnedAgents.current.get(connectionId) ??
        new Set<string>([mappedAgentId])
      for (const agentId of ownedAgents) {
        const sid = claudeSessionIds.current.get(agentId)
        if (sid && claudeSessionAgentIds.current.get(sid) === agentId) {
          claudeSessionAgentIds.current.delete(sid)
        }
        setAgentStatus(agentId, "disconnected")
      }
    },
    [pushDebugEvent, setAgentStatus]
  )

  const handleClaudeMsg = useCallback(
    (connectionId: string, msg: ClaudeUIMessage) => {
      const normalizedMsg = unwrapClaudeRawMessage(msg) as ClaudeUIMessage
      const initialAgentId =
        claudeConnectionAgentIds.current.get(connectionId) ?? connectionId
      const incomingSessionId = claudeSessionId(normalizedMsg)
      const isInitMessage = isClaudeInitMessage(normalizedMsg)
      const mappedAgentId = routeClaudeAgent(
        connectionId,
        initialAgentId,
        incomingSessionId,
        isInitMessage
      )
      applyClaudeStreamMessage(mappedAgentId, normalizedMsg)

      if (isInitMessage) {
        return
      }

      if (normalizedMsg.type === "status") {
        const raw = normalizedMsg as { content?: string; text?: string }
        const statusText = raw.content ?? raw.text ?? ""
        if (statusText.includes("disconnected")) {
          handleClaudeStatusDisconnect(connectionId, mappedAgentId)
        }
        return
      }

      applyClaudeOutputMessage(mappedAgentId, normalizedMsg)
    },
    [
      applyClaudeOutputMessage,
      applyClaudeStreamMessage,
      handleClaudeStatusDisconnect,
      routeClaudeAgent,
    ]
  )

  const resolveClaudeConnectionId = useCallback((agentId: string) => {
    if (claudeConns.has(agentId)) {
      return agentId
    }
    for (const [
      connectionId,
      ownedAgents,
    ] of claudeConnectionOwnedAgents.current.entries()) {
      if (ownedAgents.has(agentId)) {
        return connectionId
      }
    }
    return undefined
  }, [])

  const sendClaudeControlResponse = useCallback(
    (
      agentId: string,
      payload: {
        allow: boolean
        input?: string | Record<string, string>
        requestId: string
        updatedInput?: unknown
      }
    ): boolean => {
      const connectionId = resolveClaudeConnectionId(agentId)
      if (!connectionId) {
        pushDebugEvent(
          `claude approval-drop agent=${shortId(agentId)} reason=no-connection`
        )
        return false
      }
      const conn = claudeConns.get(connectionId)
      if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
        pushDebugEvent(
          `claude approval-drop agent=${shortId(agentId)} reason=ws-not-open`
        )
        return false
      }
      conn.ws.send(
        JSON.stringify({
          type: "control_response",
          request_id: payload.requestId,
          permission: { allow: payload.allow },
          ...(payload.input !== undefined && { input: payload.input }),
          ...(payload.updatedInput !== undefined && {
            updated_input: payload.updatedInput,
          }),
        })
      )
      pushDebugEvent(
        `claude approval-send agent=${shortId(agentId)} request=${shortId(payload.requestId)} allow=${payload.allow}`
      )
      return true
    },
    [pushDebugEvent, resolveClaudeConnectionId]
  )

  const handleClaudeFallbackLine = useCallback(
    (id: string, line: string) => {
      const sessionId = parseClaudeSessionIdFromRawLine(line)
      if (sessionId) {
        const beforeAgentId = claudeConnectionAgentIds.current.get(id) ?? id
        const mappedAgentId = rotateClaudeSessionAgent(id, sessionId)
        setAgentSession(mappedAgentId, sessionId)
        setAgentStatus(mappedAgentId, "connected")
        if (mappedAgentId !== beforeAgentId) {
          pushDebugEvent(
            `claude rotate raw-session=${shortId(sessionId)} from=${shortId(beforeAgentId)} to=${shortId(mappedAgentId)}`
          )
        }
        return
      }
      if (looksLikeClaudeInitLine(line)) {
        const beforeAgentId = claudeConnectionAgentIds.current.get(id) ?? id
        const mappedAgentId = rotateClaudeConnectionAgent(id)
        setAgentStatus(mappedAgentId, "connected")
        if (mappedAgentId !== beforeAgentId) {
          pushDebugEvent(
            `claude rotate raw-init from=${shortId(beforeAgentId)} to=${shortId(mappedAgentId)}`
          )
        }
      }
    },
    [
      pushDebugEvent,
      rotateClaudeConnectionAgent,
      rotateClaudeSessionAgent,
      setAgentSession,
      setAgentStatus,
    ]
  )

  const handleClaude = useCallback(
    (id: string, raw: string) => {
      const buffered = bufferNdjsonChunk(
        raw,
        claudeLineBuffers.current.get(id) ?? ""
      )
      claudeLineBuffers.current.set(id, buffered.carry)
      for (const line of buffered.lines) {
        if (!line.trim()) {
          continue
        }
        try {
          handleClaudeMsg(id, JSON.parse(line) as ClaudeUIMessage)
        } catch {
          handleClaudeFallbackLine(id, line)
        }
      }
    },
    [handleClaudeFallbackLine, handleClaudeMsg]
  )

  const connectClaude = useCallback(
    (targetUrl: string, opts?: { silent?: boolean }) => {
      const id = crypto.randomUUID()
      const ws = new WebSocket(targetUrl)
      const agent: Agent = {
        id,
        url: targetUrl,
        protocol: "claude",
        status: "connecting",
        output: "",
        streamItems: [],
      }
      setAgents((prev) => [...prev, agent])

      claudeConns.set(id, { protocol: "claude", ws })
      claudeConnectionAgentIds.current.set(id, id)
      claudeConnectionOwnedAgents.current.set(id, new Set([id]))

      ws.onopen = () => {
        setAgentStatus(id, "connected")
      }
      ws.onmessage = (e) => handleClaude(id, e.data)
      const collectOwnedAgentIds = () => [
        ...(claudeConnectionOwnedAgents.current.get(id) ??
          new Set<string>([id])),
      ]
      ws.onclose = () => {
        const ownedAgentIds = collectOwnedAgentIds()
        claudeConns.delete(id)
        claudeLineBuffers.current.delete(id)
        for (const agentId of ownedAgentIds) {
          claudeOutputStates.current.delete(agentId)
          claudeStreamAdapterStates.current.delete(agentId)
          // Clear stale session→agent mappings so reconnects don't route to dead agents
          const sessionId = claudeSessionIds.current.get(agentId)
          if (
            sessionId &&
            claudeSessionAgentIds.current.get(sessionId) === agentId
          ) {
            claudeSessionAgentIds.current.delete(sessionId)
          }
        }
        if (opts?.silent) {
          claudeConnectionAgentIds.current.delete(id)
          claudeConnectionOwnedAgents.current.delete(id)
          setAgents((prev) => {
            const owned = new Set(ownedAgentIds)
            return prev.map((a) =>
              owned.has(a.id) ? { ...a, status: "disconnected" as Status } : a
            )
          })
          return
        }

        for (const agentId of ownedAgentIds) {
          setAgentStatus(agentId, "reconnecting")
        }

        const attemptReconnect = (attempt: number) => {
          const scheduled = scheduleReconnect(id, attempt, () => {
            const newWs = new WebSocket(targetUrl)

            newWs.onopen = () => {
              claudeConns.set(id, { protocol: "claude", ws: newWs })
              const currentAgentId = rotateClaudeConnectionAgent(id)
              setAgentStatus(currentAgentId, "connected")
              reconnectTimers.delete(id)
            }

            newWs.onmessage = (e) => handleClaude(id, e.data)

            newWs.onclose = () => {
              claudeConns.delete(id)
              claudeLineBuffers.current.delete(id)
              for (const agentId of collectOwnedAgentIds()) {
                claudeOutputStates.current.delete(agentId)
                claudeStreamAdapterStates.current.delete(agentId)
              }
              attemptReconnect(attempt + 1)
            }

            newWs.onerror = () => {
              // handled via close/retry
            }
          })

          if (!scheduled) {
            for (const agentId of ownedAgentIds) {
              setAgentStatus(agentId, "disconnected")
            }
            claudeConnectionAgentIds.current.delete(id)
            claudeConnectionOwnedAgents.current.delete(id)
            reconnectTimers.delete(id)
          }
        }

        attemptReconnect(0)
      }
      ws.onerror = () => {
        // handled via close/retry
      }
    },
    [handleClaude, rotateClaudeConnectionAgent, setAgentStatus, setAgents]
  )

  return {
    claudeOutputStates,
    claudeSessionAgentIds,
    claudeSessionIds,
    connectClaude,
    sendClaudeControlResponse,
  }
}
