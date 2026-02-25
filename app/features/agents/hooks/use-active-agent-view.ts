import type { Dispatch, RefObject, SetStateAction } from "react"
import { useEffect, useMemo } from "react"
import {
  buildAgentTabs,
  hostFromUrl,
  shouldHidePlaceholderAgent,
  tabIdForAgent,
} from "@/app/features/agents/tab-utils"
import type { Agent, AgentTab } from "@/app/features/agents/types"

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
  const activeOutput =
    activeAgent?.output ||
    activeTab?.agents.findLast((agent) => Boolean(agent.output))?.output ||
    ""

  const activeHost = activeAgent ? hostFromUrl(activeAgent.url) : ""

  return {
    activeAgent,
    activeHost,
    activeOutput,
    activeTab,
    visibleTabs,
  }
}
