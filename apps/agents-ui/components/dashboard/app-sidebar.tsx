"use client"

import type { CodexThreadListResult } from "@axel-delafosse/agent-runtime/hooks/use-codex-runtime"
import {
  shortId,
  statusIndicatorClass,
} from "@axel-delafosse/agent-runtime/tab-utils"
import type { AgentTab } from "@axel-delafosse/agent-runtime/types"
import { cn } from "@axel-delafosse/ui/utils"
import { ChevronDown, ChevronRight, EllipsisVertical } from "lucide-react"
import type { FormEvent, MouseEvent } from "react"
import { useCallback, useMemo, useState } from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"

interface AppSidebarActions {
  onArchiveThread?: (agentId: string, threadId: string) => void
  onForkThread?: (agentId: string, threadId: string) => void
  onRenameThread?: (agentId: string, threadId: string, name: string) => void
}

interface AppSidebarProps extends AppSidebarActions {
  activeTabId: string
  autoFollow: boolean
  codexHubUrl?: string
  listCodexThreads?: (hubUrl: string, cursor?: string) => void
  onAutoFollowChange: (next: boolean) => void
  onTabChange: (tabId: string) => void
  resumeCodexThread?: (hubUrl: string, threadId: string) => void
  tabs: readonly AgentTab[]
  threadListData?: CodexThreadListResult
}

type TabKebabMenuProps = AppSidebarActions & {
  agentId: string
  defaultThreadName?: string
  threadId: string
}

function TabKebabMenu({
  agentId,
  onArchiveThread,
  onForkThread,
  onRenameThread,
  defaultThreadName = "",
  threadId,
}: TabKebabMenuProps) {
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [threadName, setThreadName] = useState(defaultThreadName)

  const closeMenu = useCallback(() => setOpen(false), [])
  const stopPropagation = useCallback((event: MouseEvent) => {
    event.stopPropagation()
  }, [])

  const startRename = useCallback(() => {
    closeMenu()
    setThreadName(defaultThreadName)
    setRenaming(true)
  }, [closeMenu, defaultThreadName])

  const renameThread = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const normalizedName = threadName.trim()
      if (normalizedName && onRenameThread) {
        onRenameThread(agentId, threadId, normalizedName)
      }
      setRenaming(false)
    },
    [agentId, onRenameThread, threadId, threadName]
  )

  const cancelRename = useCallback(() => {
    setThreadName(defaultThreadName)
    setRenaming(false)
  }, [defaultThreadName])

  const handleFork = useCallback(() => {
    closeMenu()
    onForkThread?.(agentId, threadId)
  }, [agentId, closeMenu, onForkThread, threadId])

  const handleArchive = useCallback(() => {
    closeMenu()
    onArchiveThread?.(agentId, threadId)
  }, [agentId, closeMenu, onArchiveThread, threadId])

  const handleMenuToggle = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      setOpen((value) => !value)
    },
    []
  )

  if (renaming) {
    return (
      <form
        className="absolute top-4 right-0 z-50 mt-1 w-52 rounded-md border border-zinc-700 bg-zinc-900 p-2 shadow-lg"
        onSubmit={renameThread}
      >
        <label className="sr-only" htmlFor={`thread-name-${threadId}`}>
          New thread name
        </label>
        <input
          autoFocus
          className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
          id={`thread-name-${threadId}`}
          onChange={(event) => setThreadName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              cancelRename()
            }
          }}
          onMouseDown={stopPropagation}
          type="text"
          value={threadName}
        />
        <div className="mt-2 flex gap-1">
          <button
            className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-100"
            onMouseDown={stopPropagation}
            type="submit"
          >
            Save
          </button>
          <button
            className="rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
            onClick={cancelRename}
            onMouseDown={stopPropagation}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="absolute inset-y-0 right-2 my-auto h-fit">
      <button
        className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
        onClick={handleMenuToggle}
        type="button"
      >
        <EllipsisVertical className="size-4" />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 min-w-[120px] rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-lg">
          {onRenameThread && (
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
              onClick={startRename}
              type="button"
            >
              Rename
            </button>
          )}
          {onForkThread && (
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
              onClick={handleFork}
              type="button"
            >
              Fork
            </button>
          )}
          {onArchiveThread && (
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

function SidebarTabItem({
  isActive,
  onArchiveThread,
  onForkThread,
  onRenameThread,
  onTabChange,
  tab,
}: {
  isActive: boolean
  onArchiveThread?: AppSidebarActions["onArchiveThread"]
  onForkThread?: AppSidebarActions["onForkThread"]
  onRenameThread?: AppSidebarActions["onRenameThread"]
  onTabChange: AppSidebarProps["onTabChange"]
  tab: AgentTab
}) {
  const { isMobile, setOpenMobile, state } = useSidebar()
  const isCollapsed = state === "collapsed"

  const { representative } = tab
  const shortIdentity = shortId(tab.identityId)
  const hasActions =
    representative.protocol === "codex" && Boolean(representative.threadId)
  const label = `${representative.protocol}${shortIdentity ? `:${shortIdentity}` : ""}`

  const handleSelect = useCallback(() => {
    onTabChange(tab.id)
    if (isMobile) {
      setOpenMobile(false)
    }
  }, [isMobile, onTabChange, setOpenMobile, tab.id])

  return (
    <SidebarMenuItem>
      <div className="relative">
        <SidebarMenuButton
          className="justify-start"
          isActive={isActive}
          onClick={handleSelect}
          title={label}
          tooltip={label}
        >
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              statusIndicatorClass(representative.status)
            )}
          />
          <span
            className={cn(
              "truncate",
              isCollapsed &&
                "group-data-[state=collapsed]:w-0 group-data-[state=collapsed]:overflow-hidden group-data-[state=collapsed]:opacity-0"
            )}
          >
            {label}
          </span>
        </SidebarMenuButton>
        {hasActions && !isCollapsed && (
          <TabKebabMenu
            agentId={representative.id}
            defaultThreadName={representative.threadName}
            onArchiveThread={onArchiveThread}
            onForkThread={onForkThread}
            onRenameThread={onRenameThread}
            threadId={representative.threadId as string}
          />
        )}
      </div>
    </SidebarMenuItem>
  )
}

function formatTimestamp(unixSeconds: number): string {
  if (!unixSeconds) {
    return ""
  }
  const date = new Date(unixSeconds * 1000)
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function HistorySection({
  codexHubUrl,
  listCodexThreads,
  resumeCodexThread,
  tabs,
  threadListData,
}: {
  codexHubUrl: string
  listCodexThreads: (hubUrl: string, cursor?: string) => void
  resumeCodexThread: (hubUrl: string, threadId: string) => void
  tabs: readonly AgentTab[]
  threadListData?: CodexThreadListResult
}) {
  const [expanded, setExpanded] = useState(false)
  const { isMobile, setOpenMobile } = useSidebar()

  const handleToggle = useCallback(() => {
    setExpanded((prev) => {
      if (!prev) {
        listCodexThreads(codexHubUrl)
      }
      return !prev
    })
  }, [codexHubUrl, listCodexThreads])

  const activeThreadIds = useMemo(() => {
    const ids = new Set<string>()
    for (const tab of tabs) {
      for (const agent of tab.agents) {
        if (agent.threadId) {
          ids.add(agent.threadId)
        }
      }
    }
    return ids
  }, [tabs])

  const threads = threadListData?.data ?? []
  const filteredThreads = threads.filter((t) => !activeThreadIds.has(t.id))
  const hasMore = threadListData?.nextCursor != null

  const handleResume = useCallback(
    (threadId: string) => {
      resumeCodexThread(codexHubUrl, threadId)
      if (isMobile) {
        setOpenMobile(false)
      }
    },
    [codexHubUrl, isMobile, resumeCodexThread, setOpenMobile]
  )

  const handleLoadMore = useCallback(() => {
    listCodexThreads(codexHubUrl, threadListData?.nextCursor ?? undefined)
  }, [codexHubUrl, listCodexThreads, threadListData?.nextCursor])

  return (
    <SidebarGroup>
      <SidebarGroupLabel
        className="cursor-pointer select-none"
        onClick={handleToggle}
      >
        {expanded ? (
          <ChevronDown className="mr-1 size-3" />
        ) : (
          <ChevronRight className="mr-1 size-3" />
        )}
        History
      </SidebarGroupLabel>
      {expanded && (
        <SidebarMenu>
          {filteredThreads.length === 0 && (
            <SidebarMenuItem>
              <SidebarMenuButton disabled title="No past threads">
                No past threads
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {filteredThreads.map((thread) => (
            <SidebarMenuItem key={thread.id}>
              <SidebarMenuButton
                className="flex-col items-start gap-0"
                onClick={() => handleResume(thread.id)}
                title={thread.preview || shortId(thread.id)}
              >
                <span className="w-full truncate text-xs">
                  {thread.preview || shortId(thread.id)}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {shortId(thread.id)}
                  {thread.updatedAt
                    ? ` \u00b7 ${formatTimestamp(thread.updatedAt)}`
                    : ""}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          {hasMore && (
            <SidebarMenuItem>
              <SidebarMenuButton
                className="justify-center text-xs text-zinc-400"
                onClick={handleLoadMore}
              >
                Load more
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      )}
    </SidebarGroup>
  )
}

export function AppSidebar({
  activeTabId,
  autoFollow,
  codexHubUrl,
  listCodexThreads,
  onArchiveThread,
  onAutoFollowChange,
  onForkThread,
  onRenameThread,
  onTabChange,
  resumeCodexThread,
  tabs,
  threadListData,
}: AppSidebarProps) {
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"
  const showLiquid = !isCollapsed
  const autoFollowVariantClassName = autoFollow
    ? "bg-emerald-900/50 text-emerald-400"
    : "bg-zinc-900/40 text-zinc-300"
  const autoFollowClassName = showLiquid
    ? autoFollowVariantClassName
    : "rounded-lg"

  return (
    <Sidebar
      className="max-md:border-white/45 max-md:border-t-0 max-md:border-r max-md:bg-sidebar/95 max-md:backdrop-blur-2xl dark:max-md:border-white/15"
      collapsible="icon"
      variant="floating"
    >
      <SidebarMenu className="hidden px-1 pt-1.5 md:flex">
        <SidebarMenuItem>
          <SidebarTrigger
            className={cn(
              "liquid-chip ml-0.5 size-9 items-center justify-center rounded-full border-white/60 bg-white/70 shadow-[0_20px_35px_-24px_oklch(0.26_0.03_245/0.6)] transition-[transform] duration-200 ease-linear dark:border-white/20 dark:bg-white/10 dark:shadow-[0_20px_35px_-24px_oklch(0_0_0/0.75)]"
            )}
          />
        </SidebarMenuItem>
      </SidebarMenu>

      <SidebarContent className={isCollapsed ? "hidden" : ""}>
        <SidebarGroup>
          <SidebarGroupLabel>Agents</SidebarGroupLabel>
          <SidebarMenu>
            {tabs.length === 0 ? (
              <SidebarMenuItem>
                <SidebarMenuButton disabled title="No active agents">
                  No active agents
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : (
              tabs.map((tab) => (
                <SidebarTabItem
                  isActive={tab.id === activeTabId}
                  key={tab.id}
                  onArchiveThread={onArchiveThread}
                  onForkThread={onForkThread}
                  onRenameThread={onRenameThread}
                  onTabChange={onTabChange}
                  tab={tab}
                />
              ))
            )}
          </SidebarMenu>
        </SidebarGroup>
        {codexHubUrl && listCodexThreads && resumeCodexThread && (
          <HistorySection
            codexHubUrl={codexHubUrl}
            listCodexThreads={listCodexThreads}
            resumeCodexThread={resumeCodexThread}
            tabs={tabs}
            threadListData={threadListData}
          />
        )}
      </SidebarContent>

      <SidebarFooter className={isCollapsed ? "hidden" : ""}>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className={cn("justify-between", autoFollowClassName)}
                onClick={() => onAutoFollowChange(!autoFollow)}
              >
                <span>Auto-follow</span>
                <span className="font-medium text-xs">
                  {autoFollow ? "on" : "off"}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  )
}

export type { AppSidebarProps }
