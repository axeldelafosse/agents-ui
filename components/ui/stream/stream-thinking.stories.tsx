import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  createStreamItem,
  streamThinkingItem,
} from "@/components/__fixtures__/stream-items"
import { StreamThinking } from "./stream-thinking"

const meta = {
  args: {
    item: streamThinkingItem,
  },
  component: StreamThinking,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Stream/StreamThinking",
} satisfies Meta<typeof StreamThinking>

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
