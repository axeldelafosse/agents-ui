import type { Agent, AgentTab } from "@axel-delafosse/agent-runtime/types"
import type { Meta, StoryObj } from "@storybook/nextjs"
import { AppSidebarShell } from "./app-sidebar-shell"

const meta = {
  component: AppSidebarShell,
  title: "Components/Dashboard/AppSidebarShell",
  decorators: [
    (Story) => (
      <div className="min-h-96 rounded-lg bg-zinc-950 p-2 text-zinc-100">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppSidebarShell>

export default meta

type Story = StoryObj<typeof meta>

const buildAgentTab = ({
  id,
  active,
}: {
  id: string
  active: boolean
}): AgentTab => {
  const status: Agent["status"] = active ? "connected" : "connecting"
  const tabRepresentative: Agent = {
    id,
    output: "stream",
    protocol: "codex",
    status,
    streamItems: [],
    threadId: `thread-${id}`,
    threadName: "Playground thread",
    url: "ws://localhost:4500",
  }

  return {
    agents: [tabRepresentative],
    id,
    identityId: `identity-${id}`,
    representative: tabRepresentative,
  }
}

const storyTabs: readonly AgentTab[] = [
  buildAgentTab({ active: true, id: "agent-alpha" }),
  buildAgentTab({ active: false, id: "agent-beta" }),
  buildAgentTab({ active: false, id: "agent-gamma" }),
]

export const Default: Story = {
  args: {
    activeTabId: storyTabs[0].id,
    autoFollow: false,
    onAutoFollowChange: () => {
      return
    },
    onTabChange: () => {
      return
    },
    tabs: storyTabs,
    children: (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="font-medium text-lg">Workspace shell content</h2>
        <p className="mt-2 text-sm text-zinc-400">
          The shell wraps the sidebar and keeps the app frame consistent.
        </p>
      </div>
    ),
  },
  render: (args) => <AppSidebarShell {...args} />,
}
