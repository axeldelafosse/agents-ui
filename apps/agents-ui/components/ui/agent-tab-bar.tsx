"use client"

import {
  shortId,
  statusIndicatorClass,
} from "@axel-delafosse/agent-runtime/tab-utils"
import type { AgentTab } from "@axel-delafosse/agent-runtime/types"
import { cn } from "@axel-delafosse/ui/utils"
import { memo, useCallback, useRef, useState } from "react"
import { Tabs, TabsList, TabsTrigger } from "./tabs"

interface AgentTabBarProps {
  activeTabId: string
  autoFollow: boolean
  onArchiveThread?: (agentId: string, threadId: string) => void
  onAutoFollowChange: (next: boolean) => void
  onForkThread?: (agentId: string, threadId: string) => void
  onRenameThread?: (agentId: string, threadId: string, name: string) => void
  onTabChange: (tabId: string) => void
  tabs: AgentTab[]
}

function TabKebabMenu({
  agentId,
  onArchive,
  onFork,
  onRename,
  threadId,
}: {
  agentId: string
  onArchive?: (agentId: string, threadId: string) => void
  onFork?: (agentId: string, threadId: string) => void
  onRename?: (agentId: string, threadId: string, name: string) => void
  threadId: string
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const closeMenu = useCallback(() => setOpen(false), [])

  const handleRename = useCallback(() => {
    closeMenu()
    // biome-ignore lint/suspicious/noAlert: simple prompt is acceptable for thread rename in debug UI
    const name = globalThis.prompt("New thread name:")
    if (name && onRename) {
      onRename(agentId, threadId, name)
    }
  }, [agentId, closeMenu, onRename, threadId])

  const handleFork = useCallback(() => {
    closeMenu()
    onFork?.(agentId, threadId)
  }, [agentId, closeMenu, onFork, threadId])

  const handleArchive = useCallback(() => {
    closeMenu()
    onArchive?.(agentId, threadId)
  }, [agentId, closeMenu, onArchive, threadId])

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="flex size-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((prev) => !prev)
        }}
        title="Thread actions"
        type="button"
      >
        <span aria-hidden className="text-xs leading-none">
          &middot;&middot;&middot;
        </span>
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 min-w-[120px] rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-lg">
          {onRename && (
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
              onClick={handleRename}
              type="button"
            >
              Rename
            </button>
          )}
          {onFork && (
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
              onClick={handleFork}
              type="button"
            >
              Fork
            </button>
          )}
          {onArchive && (
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
              onClick={handleArchive}
              type="button"
            >
              Archive
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function AgentTabBarComponent({
  activeTabId,
  autoFollow,
  onArchiveThread,
  onAutoFollowChange,
  onForkThread,
  onRenameThread,
  onTabChange,
  tabs,
}: AgentTabBarProps) {
  return (
    <Tabs className="mx-4" onValueChange={onTabChange} value={activeTabId}>
      <TabsList className="no-scrollbar h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-1">
        {tabs.map((tab) => {
          const { representative } = tab
          const sessionLabel = shortId(tab.identityId)
          const displayName = `${representative.protocol}${sessionLabel ? `:${sessionLabel}` : ""}`
          const isCodexWithThread =
            representative.protocol === "codex" && !!representative.threadId
          return (
            <div className="relative flex shrink-0 items-center" key={tab.id}>
              <TabsTrigger
                className="max-w-[200px] shrink-0 justify-start border-zinc-700 data-active:border-zinc-600 data-active:bg-zinc-800"
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
              {isCodexWithThread && (
                <TabKebabMenu
                  agentId={representative.id}
                  onArchive={onArchiveThread}
                  onFork={onForkThread}
                  onRename={onRenameThread}
                  threadId={representative.threadId as string}
                />
              )}
            </div>
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
    previous.onArchiveThread !== next.onArchiveThread ||
    previous.onAutoFollowChange !== next.onAutoFollowChange ||
    previous.onForkThread !== next.onForkThread ||
    previous.onRenameThread !== next.onRenameThread ||
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
