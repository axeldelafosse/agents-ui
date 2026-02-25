"use client"

import { memo } from "react"
import { shortId, statusIndicatorClass } from "@/app/features/agents/tab-utils"
import type { AgentTab } from "@/app/features/agents/types"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

interface AgentTabBarProps {
  activeTabId: string
  autoFollow: boolean
  onAutoFollowChange: (next: boolean) => void
  onTabChange: (tabId: string) => void
  tabs: AgentTab[]
}

function AgentTabBarComponent({
  activeTabId,
  autoFollow,
  onAutoFollowChange,
  onTabChange,
  tabs,
}: AgentTabBarProps) {
  return (
    <Tabs className="mx-4" onValueChange={onTabChange} value={activeTabId}>
      <TabsList className="no-scrollbar h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-1">
        {tabs.map((tab) => {
          const { representative } = tab
          const sessionLabel = shortId(tab.identityId)
          const displayName = `${representative.protocol}${sessionLabel ? `:${sessionLabel}` : ""}`
          return (
            <TabsTrigger
              className="max-w-[200px] shrink-0 justify-start border-zinc-700 data-active:border-zinc-600 data-active:bg-zinc-800"
              key={tab.id}
              value={tab.id}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  statusIndicatorClass(representative.status)
                )}
              />
              <span className="truncate">{displayName}</span>
            </TabsTrigger>
          )
        })}
        <button
          className={cn(
            "ml-auto shrink-0 rounded-lg px-2 py-1 text-xs transition-colors",
            autoFollow
              ? "bg-emerald-900/50 text-emerald-400"
              : "bg-zinc-800 text-zinc-500"
          )}
          onClick={() => onAutoFollowChange(!autoFollow)}
          title={
            autoFollow
              ? "Auto-follow is on: switches to active agents"
              : "Auto-follow is off: stays on selected tab"
          }
          type="button"
        >
          {autoFollow ? "auto-follow on" : "auto-follow off"}
        </button>
      </TabsList>
    </Tabs>
  )
}

function areAgentTabBarPropsEqual(
  previous: AgentTabBarProps,
  next: AgentTabBarProps
): boolean {
  if (
    previous.activeTabId !== next.activeTabId ||
    previous.autoFollow !== next.autoFollow ||
    previous.onAutoFollowChange !== next.onAutoFollowChange ||
    previous.onTabChange !== next.onTabChange ||
    previous.tabs.length !== next.tabs.length
  ) {
    return false
  }

  for (let index = 0; index < previous.tabs.length; index++) {
    const previousTab = previous.tabs[index]
    const nextTab = next.tabs[index]
    if (
      previousTab.id !== nextTab.id ||
      previousTab.identityId !== nextTab.identityId ||
      previousTab.representative.protocol !== nextTab.representative.protocol ||
      previousTab.representative.status !== nextTab.representative.status
    ) {
      return false
    }
  }

  return true
}

export const AgentTabBar = memo(AgentTabBarComponent, areAgentTabBarPropsEqual)
