import type { CodexThreadListResult } from "@axel-delafosse/agent-runtime/hooks/use-codex-runtime"
import type { Meta, StoryObj } from "@storybook/nextjs"
import { ThreadBrowser } from "./thread-browser"

const createThreads = (): CodexThreadListResult["data"] => [
  {
    createdAt: 1_740_000_000,
    cwd: "/Users/axel/agents-ui",
    id: "thread-2026-01",
    modelProvider: "openai",
    preview: "Add stories for all remaining stream components",
    updatedAt: 1_740_000_600,
  },
  {
    createdAt: 1_740_000_800,
    cwd: "/Users/axel/agents-ui",
    id: "thread-2026-02",
    modelProvider: "anthropic",
    preview: "Stabilize sidebar interactions",
    updatedAt: 1_740_000_900,
  },
]

const meta = {
  component: ThreadBrowser,
  decorators: [
    (Story) => (
      <div className="max-w-xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "Components/UI/ThreadBrowser",
} satisfies Meta<typeof ThreadBrowser>

export default meta

type Story = StoryObj<typeof meta>

function buildThreadBrowserArgs(
  data: CodexThreadListResult["data"],
  nextCursor: CodexThreadListResult["nextCursor"]
) {
  return {
    hubUrl: "ws://localhost:4500",
    listCodexThreads: () => undefined,
    onClose: () => undefined,
    resumeCodexThread: () => undefined,
    threadListResult: {
      current: {
        data,
        nextCursor,
      },
    },
  }
}

export const WithThreads: Story = {
  args: buildThreadBrowserArgs(createThreads(), "cursor-1"),
  render: (args) => <ThreadBrowser {...args} />,
}

export const Empty: Story = {
  args: buildThreadBrowserArgs([], null),
  render: (args) => <ThreadBrowser {...args} />,
}
