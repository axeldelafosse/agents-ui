import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  createStreamItem,
  streamThinkingItem,
} from "@axel-delafosse/ui/__fixtures__/stream-items"
import { Thinking } from "./thinking"

const meta = {
  args: {
    item: streamThinkingItem,
  },
  component: Thinking,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Thinking",
} satisfies Meta<typeof Thinking>

export default meta

type Story = StoryObj<typeof meta>

export const Streaming: Story = {}

export const CompleteWithoutText: Story = {
  args: {
    item: createStreamItem("thinking", {
      data: {},
      id: "story-thinking-complete-empty-1",
    }),
  },
}
