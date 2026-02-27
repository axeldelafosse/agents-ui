import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  createStreamItem,
  streamCollabAgentItem,
} from "@axel-delafosse/ui/__fixtures__/stream-items"
import { CollabAgent } from "./collab-agent"

const meta = {
  args: {
    item: streamCollabAgentItem,
  },
  component: CollabAgent,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/CollabAgent",
} satisfies Meta<typeof CollabAgent>

export default meta

type Story = StoryObj<typeof meta>

export const SummaryNote: Story = {}

export const PromptAndSummary: Story = {
  args: {
    item: createStreamItem("collab_agent", {
      data: {
        agentName: "reviewer",
        prompt: "Review streaming UI stories for regressions.",
        summary: "Flagged one missing callback action in `Feed`.",
      },
      id: "story-collab-agent-prompt-summary-1",
    }),
  },
}
