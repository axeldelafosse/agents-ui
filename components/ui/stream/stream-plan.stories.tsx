import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  createStreamItem,
  streamPlanItem,
} from "@/components/__fixtures__/stream-items"
import { StreamPlan } from "./stream-plan"

const meta = {
  args: {
    item: streamPlanItem,
  },
  component: StreamPlan,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Stream/StreamPlan",
} satisfies Meta<typeof StreamPlan>

export default meta

type Story = StoryObj<typeof meta>

export const WithSteps: Story = {}

export const SummaryOnly: Story = {
  args: {
    item: createStreamItem("plan", {
      data: {
        summary: "Plan accepted. Waiting for concrete step breakdown.",
      },
      id: "story-plan-summary-only-1",
      status: "streaming",
    }),
  },
}
