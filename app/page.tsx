"use client"

import { Streamdown } from "streamdown"
import { useAgentsRuntime } from "@/app/features/agents/hooks/use-agents-runtime"
import { AgentTabBar } from "@/components/agent-tab-bar"
import { Shimmer } from "@/components/ui/shimmer"

export default function Page() {
  const {
    activeAgent,
    activeHost,
    activeOutput,
    activeTab,
    autoFollow,
    setAutoFollow,
    setSelectedTabId,
    visibleTabs,
  } = useAgentsRuntime()

  return (
    <main>
      <div className="flex items-center justify-between p-4">
        <p className="text-nowrap font-bold text-lg tracking-tight">
          Agents UI
        </p>
        <p className="ml-2 text-right text-zinc-400">
          {activeAgent
            ? `${activeAgent.protocol} @ ${activeHost} (${activeAgent.status})`
            : ""}
        </p>
      </div>
      <div>
        {visibleTabs.length > 0 && activeTab && (
          <AgentTabBar
            activeTabId={activeTab.id}
            autoFollow={autoFollow}
            onAutoFollowChange={setAutoFollow}
            onTabChange={setSelectedTabId}
            tabs={visibleTabs}
          />
        )}
        <div className="border-zinc-800 bg-zinc-950 p-4">
          {!activeAgent && (
            <Shimmer className="text-sm" duration={2}>
              Looking for background agents
            </Shimmer>
          )}
          {activeAgent && !activeOutput && (
            <Shimmer className="text-sm" duration={2}>
              Thinking
            </Shimmer>
          )}
          {activeOutput && (
            <Streamdown className="text-sm leading-relaxed">
              {activeOutput}
            </Streamdown>
          )}
        </div>
      </div>
    </main>
  )
}
