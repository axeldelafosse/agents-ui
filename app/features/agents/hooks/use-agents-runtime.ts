"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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

export function useAgentsRuntime() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [autoFollow, setAutoFollow] = useState(false)
  const [_debugEvents, setDebugEvents] = useState<string[]>([])
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null)
  const agentsRef = useRef<Agent[]>([])

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
    codexOutputStates,
    codexThreadAgentIds,
    connectCodex,
    requestCodexLoadedList,
  } = useCodexRuntime({
    agentsRef,
    pushDebugEvent,
    setAgentStatus,
    setAgents,
  })

  const {
    claudeOutputStates,
    claudeSessionAgentIds,
    claudeSessionIds,
    connectClaude,
  } = useClaudeRuntime({
    agentsRef,
    pushDebugEvent,
    setAgentStatus,
    setAgents,
  })

  useEffect(() => {
    agentsRef.current = agents
  }, [agents])

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

  const { activeAgent, activeHost, activeOutput, activeTab, visibleTabs } =
    useActiveAgentView({
      agents,
      autoFollow,
      claudeSessionAgentIds,
      codexThreadAgentIds,
      selectedTabId,
      setSelectedTabId,
    })

  return {
    activeAgent,
    activeHost,
    activeOutput,
    activeTab,
    autoFollow,
    selectedTabId,
    setAutoFollow,
    setSelectedTabId,
    visibleTabs,
  }
}
