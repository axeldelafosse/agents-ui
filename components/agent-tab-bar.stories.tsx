import type { Meta, StoryObj } from "@storybook/nextjs"
import { fn } from "storybook/test"
import type { AgentTab, Protocol, Status } from "@/app/features/agents/types"
import { AgentTabBar } from "@/components/agent-tab-bar"

interface TabFixture {
  id: string
  identityId: string
  protocol: Protocol
  status: Status
  url: string
}

const createTab = ({
  id,
  identityId,
  protocol,
  status,
  url,
}: TabFixture): AgentTab => {
  const representativeBase = {
    id: `${id}-representative`,
    output: "",
    protocol,
    status,
    streamItems: [],
    url,
  }

  const representative =
    protocol === "codex"
      ? {
          ...representativeBase,
          threadId: identityId,
          threadName: `Thread ${identityId.slice(0, 8)}`,
        }
      : {
          ...representativeBase,
          sessionId: identityId,
        }

  return {
    agents: [],
    id,
    identityId,
    representative,
  }
}

const defaultTabs: AgentTab[] = [
  createTab({
    id: "codex-core",
    identityId: "thread-core-1234567890abcdef",
    protocol: "codex",
    status: "connected",
    url: "ws://localhost:4500/codex",
  }),
  createTab({
    id: "claude-review",
    identityId: "session-review-1234567890abcdef",
    protocol: "claude",
    status: "connecting",
    url: "ws://localhost:8765/claude",
  }),
  createTab({
    id: "codex-tools",
    identityId: "thread-tools-1234567890abcdef",
    protocol: "codex",
    status: "disconnected",
    url: "ws://localhost:4501/codex",
  }),
]

const reconnectingTabs: AgentTab[] = [
  createTab({
    id: "claude-reconnecting",
    identityId: "session-reconnect-1234567890abcdef",
    protocol: "claude",
    status: "reconnecting",
    url: "ws://localhost:8766/claude",
  }),
  createTab({
    id: "codex-connected",
    identityId: "thread-connected-1234567890abcdef",
    protocol: "codex",
    status: "connected",
    url: "ws://localhost:4502/codex",
  }),
]

const meta = {
  title: "Components/AgentTabBar",
  component: AgentTabBar,
  decorators: [
    (Story) => (
      <div className="dark min-h-32 bg-zinc-950 p-4 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    activeTabId: defaultTabs[0].id,
    autoFollow: false,
    onAutoFollowChange: fn(),
    onTabChange: fn(),
    tabs: defaultTabs,
  },
} satisfies Meta<typeof AgentTabBar>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const SingleTab: Story = {
  args: {
    activeTabId: "codex-core",
    tabs: [
      createTab({
        id: "codex-core",
        identityId: "thread-core-1234567890abcdef",
        protocol: "codex",
        status: "connected",
        url: "ws://localhost:4500/codex",
      }),
    ],
  },
}

export const Reconnecting: Story = {
  args: {
    activeTabId: reconnectingTabs[0].id,
    tabs: reconnectingTabs,
  },
}

export const AutoFollowToggled: Story = {
  args: {
    autoFollow: true,
  },
}
