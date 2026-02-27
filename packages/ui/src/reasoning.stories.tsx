import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  createStreamItem,
  streamReasoningItem,
} from "@axel-delafosse/ui/__fixtures__/stream-items"
import { Reasoning } from "./reasoning"

const meta = {
  args: {
    item: streamReasoningItem,
  },
  component: Reasoning,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Reasoning",
} satisfies Meta<typeof Reasoning>

export default meta

type Story = StoryObj<typeof meta>

export const Summary: Story = {}

export const FallbackLabel: Story = {
  args: {
    item: createStreamItem("reasoning", {
      data: {},
      id: "story-reasoning-fallback-1",
      status: "streaming",
    }),
  },
}
