"use client"

import {
  shortId,
  statusIndicatorClass,
} from "@axel-delafosse/agent-runtime/tab-utils"
import type { AgentTab } from "@axel-delafosse/agent-runtime/types"
import { cn } from "@axel-delafosse/ui/utils"
import { EllipsisVertical } from "lucide-react"
import { useCallback, useState } from "react"
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
  onAutoFollowChange: (next: boolean) => void
  onTabChange: (tabId: string) => void
  tabs: readonly AgentTab[]
}

type TabKebabMenuProps = AppSidebarActions & {
  agentId: string
  threadId: string
}

function TabKebabMenu({
  agentId,
  onArchiveThread,
  onForkThread,
  onRenameThread,
  threadId,
}: TabKebabMenuProps) {
  const [open, setOpen] = useState(false)

  const closeMenu = useCallback(() => setOpen(false), [])

  const handleRename = useCallback(() => {
    closeMenu()
    // biome-ignore lint/suspicious/noAlert: simple prompt is acceptable for debug agent controls
    const name = globalThis.prompt("New thread name:")
    if (name && onRenameThread) {
      onRenameThread(agentId, threadId, name)
    }
  }, [agentId, closeMenu, onRenameThread, threadId])

  const handleFork = useCallback(() => {
    closeMenu()
    onForkThread?.(agentId, threadId)
  }, [agentId, closeMenu, onForkThread, threadId])

  const handleArchive = useCallback(() => {
    closeMenu()
    onArchiveThread?.(agentId, threadId)
  }, [agentId, closeMenu, onArchiveThread, threadId])

  return (
    <div className="absolute inset-y-0 right-2 my-auto h-fit">
      <button
        className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        type="button"
      >
        <EllipsisVertical className="size-4" />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 min-w-[120px] rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-lg">
          {onRenameThread && (
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
              onClick={handleRename}
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

export function AppSidebar({
  activeTabId,
  autoFollow,
  onArchiveThread,
  onAutoFollowChange,
  onForkThread,
  onRenameThread,
  onTabChange,
  tabs,
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
