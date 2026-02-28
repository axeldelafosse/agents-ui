import type { AgentTab } from "@axel-delafosse/agent-runtime/types"
import type { Meta, StoryObj } from "@storybook/nextjs"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar, type AppSidebarProps } from "./app-sidebar"

const meta = {
  component: AppSidebar,
  title: "Components/Dashboard/AppSidebar",
  decorators: [
    (Story) => (
      <div className="min-h-96 rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppSidebar>

export default meta

type Story = StoryObj<typeof meta>

const buildAgentTab = ({
  status,
  id,
}: {
  id: string
  status: "connected" | "connecting" | "disconnected" | "reconnecting"
}): AgentTab => {
  const identityId = `identity-${id}`
  const representative = {
    id,
    output: "stream",
    protocol: "codex" as const,
    status,
    streamItems: [],
    threadId: `thread-${id}`,
    threadName: "Playground thread",
    url: "ws://localhost:4500",
  }

  return {
    agents: [representative],
    id,
    identityId,
    representative: {
      ...representative,
      id,
    },
  }
}

const storyTabs: readonly AgentTab[] = [
  buildAgentTab({ id: "agent-alpha", status: "connected" }),
  buildAgentTab({ id: "agent-beta", status: "connecting" }),
]

function AppSidebarStoryContent({
  activeTabId,
  autoFollow,
  onAutoFollowChange,
  onRenameThread,
  onTabChange,
  onForkThread,
  onArchiveThread,
  tabs,
}: AppSidebarProps) {
  return (
    <SidebarProvider className="relative min-h-[420px]">
      <div className="relative flex min-h-full">
        <AppSidebar
          activeTabId={activeTabId}
          autoFollow={autoFollow}
          onArchiveThread={onArchiveThread}
          onAutoFollowChange={onAutoFollowChange}
          onForkThread={onForkThread}
          onRenameThread={onRenameThread}
          onTabChange={onTabChange}
          tabs={tabs}
        />
        <SidebarInset className="bg-transparent">
          <div className="flex min-w-0 flex-1 items-center px-6 pt-16">
            <div className="max-w-md rounded-md border border-zinc-800 bg-zinc-900/60 p-4 text-sm">
              Chat content area for sidebar integration.
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}

export const Default: Story = {
  args: {
    activeTabId: storyTabs[0].id,
    autoFollow: true,
    onAutoFollowChange: () => {
      return
    },
    onTabChange: () => {
      return
    },
    tabs: storyTabs,
  },
  render: (args) => <AppSidebarStoryContent {...args} />,
}
