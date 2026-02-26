"use client"

import { useCallback } from "react"
import { Streamdown } from "streamdown"
import { useAgentsRuntime } from "@/app/features/agents/hooks/use-agents-runtime"
import { AgentTabBar } from "@/components/agent-tab-bar"
import { Shimmer } from "@/components/ui/shimmer"
import { StreamFeed } from "@/components/ui/stream/stream-feed"
import type {
  StreamApprovalInputValue,
  StreamItem,
} from "@/components/ui/stream/stream-types"

export default function Page() {
  const {
    activeAgent,
    activeHost,
    activeOutput,
    activeStreamItems,
    activeTab,
    autoFollow,
    handleApprovalInput,
    handleApprovalResponse,
    setAutoFollow,
    setSelectedTabId,
    visibleTabs,
  } = useAgentsRuntime()

  const onApprove = useCallback(
    (item: StreamItem) => handleApprovalResponse(item, true),
    [handleApprovalResponse]
  )

  const onDeny = useCallback(
    (item: StreamItem) => handleApprovalResponse(item, false),
    [handleApprovalResponse]
  )

  const onSubmitInput = useCallback(
    (item: StreamItem, value: StreamApprovalInputValue) =>
      handleApprovalInput(item, value),
    [handleApprovalInput]
  )

  const hasStreamItems = activeStreamItems.length > 0

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
          {activeAgent && !hasStreamItems && !activeOutput && (
            <Shimmer className="text-sm" duration={2}>
              Thinking
            </Shimmer>
          )}
          {hasStreamItems && (
            <StreamFeed
              items={activeStreamItems}
              onApprove={onApprove}
              onDeny={onDeny}
              onSubmitInput={onSubmitInput}
            />
          )}
          {!hasStreamItems && activeOutput && (
            <Streamdown className="text-sm leading-relaxed">
              {activeOutput}
            </Streamdown>
          )}
        </div>
      </div>
    </main>
  )
}
