import type { Dispatch, RefObject, SetStateAction } from "react"
import { useEffect, useMemo } from "react"
import {
  buildAgentTabs,
  hostFromUrl,
  shouldHidePlaceholderAgent,
  tabIdForAgent,
} from "@axel-delafosse/agent-runtime/tab-utils"
import type { Agent, AgentTab } from "../types"
import type { StreamItem } from "@axel-delafosse/protocol/stream-items"

interface UseActiveAgentViewParams {
  agents: Agent[]
  autoFollow: boolean
  claudeSessionAgentIds: RefObject<Map<string, string>>
  codexThreadAgentIds: RefObject<Map<string, string>>
  selectedTabId: string | null
  setSelectedTabId: Dispatch<SetStateAction<string | null>>
}

interface UseActiveAgentViewResult {
  activeAgent: Agent | null
  activeHost: string
  activeOutput: string
  activeStreamItems: StreamItem[]
  activeTab: AgentTab | null
  visibleTabs: AgentTab[]
}

export function useActiveAgentView({
  agents,
  autoFollow,
  claudeSessionAgentIds,
  codexThreadAgentIds,
  selectedTabId,
  setSelectedTabId,
}: UseActiveAgentViewParams): UseActiveAgentViewResult {
  const visibleAgents = useMemo(
    () => agents.filter((agent) => !shouldHidePlaceholderAgent(agent, agents)),
    [agents]
  )
  const visibleTabs = useMemo(
    () => buildAgentTabs(visibleAgents),
    [visibleAgents]
  )

  useEffect(() => {
    if (visibleTabs.length === 0) {
      setSelectedTabId(null)
      return
    }

    if (selectedTabId && visibleTabs.some((tab) => tab.id === selectedTabId)) {
      if (!autoFollow) {
        return
      }
      // Auto-switch away from a disconnected tab to the latest active one.
      const currentTab = visibleTabs.find((tab) => tab.id === selectedTabId)
      if (currentTab?.representative.status === "disconnected") {
        const connectedTab = visibleTabs.findLast(
          (tab) => tab.representative.status !== "disconnected"
        )
        if (connectedTab) {
          setSelectedTabId(connectedTab.id)
        }
      }
      return
    }

    const nextSelected =
      visibleTabs.findLast(
        (tab) => tab.representative.status !== "disconnected"
      ) ??
      visibleTabs.at(-1) ??
      null
    setSelectedTabId(nextSelected?.id ?? null)
  }, [autoFollow, selectedTabId, setSelectedTabId, visibleTabs])

  const fallbackTab = useMemo(
    () =>
      visibleTabs.findLast(
        (tab) => tab.representative.status !== "disconnected"
      ) ??
      visibleTabs.at(-1) ??
      null,
    [visibleTabs]
  )
  const activeTab =
    visibleTabs.find((tab) => tab.id === selectedTabId) ?? fallbackTab
  let activeTabCanonicalAgentId: string | undefined
  if (activeTab?.identityId) {
    if (activeTab.representative.protocol === "claude") {
      activeTabCanonicalAgentId = claudeSessionAgentIds.current.get(
        activeTab.identityId
      )
    } else if (activeTab.representative.protocol === "codex") {
      activeTabCanonicalAgentId = codexThreadAgentIds.current.get(
        activeTab.identityId
      )
    }
  }
  const activeTabCanonicalAgent = activeTabCanonicalAgentId
    ? agents.find((agent) => agent.id === activeTabCanonicalAgentId)
    : undefined
  const activeAgent =
    activeTab &&
    activeTabCanonicalAgent &&
    tabIdForAgent(activeTabCanonicalAgent) === activeTab.id
      ? activeTabCanonicalAgent
      : (activeTab?.representative ?? null)
  const fallbackContentAgent = activeTab?.agents.findLast(
    (agent) => agent.streamItems.length > 0 || Boolean(agent.output)
  )
  const hasActiveStreamItems = (activeAgent?.streamItems.length ?? 0) > 0
  const activeOutput = activeAgent?.output || fallbackContentAgent?.output || ""
  let activeStreamItems: StreamItem[] = []
  if (hasActiveStreamItems) {
    activeStreamItems = activeAgent?.streamItems ?? []
  } else if (!activeAgent?.output) {
    activeStreamItems = fallbackContentAgent?.streamItems ?? []
  }

  const activeHost = activeAgent ? hostFromUrl(activeAgent.url) : ""

  return {
    activeAgent,
    activeHost,
    activeOutput,
    activeStreamItems,
    activeTab,
    visibleTabs,
  }
}
