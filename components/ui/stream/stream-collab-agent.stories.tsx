import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  createStreamItem,
  streamCollabAgentItem,
} from "@/components/__fixtures__/stream-items"
import { StreamCollabAgent } from "./stream-collab-agent"

const meta = {
  args: {
    item: streamCollabAgentItem,
  },
  component: StreamCollabAgent,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Stream/StreamCollabAgent",
} satisfies Meta<typeof StreamCollabAgent>

export default meta

type Story = StoryObj<typeof meta>

export const SummaryNote: Story = {}

export const PromptAndSummary: Story = {
  args: {
    item: createStreamItem("collab_agent", {
      data: {
        agentName: "reviewer",
        prompt: "Review streaming UI stories for regressions.",
        summary: "Flagged one missing callback action in `StreamFeed`.",
      },
      id: "story-collab-agent-prompt-summary-1",
    }),
  },
}
