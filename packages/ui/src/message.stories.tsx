import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  createStreamItem,
  streamAssistantMessageItem,
  streamUserMessageItem,
} from "@axel-delafosse/ui/__fixtures__/stream-items"
import { Message } from "./message"

const meta = {
  args: {
    item: streamAssistantMessageItem,
  },
  component: Message,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Message",
} satisfies Meta<typeof Message>

export default meta

type Story = StoryObj<typeof meta>

export const Assistant: Story = {}

export const UserBubble: Story = {
  args: {
    item: streamUserMessageItem,
  },
}

export const WaitingForText: Story = {
  args: {
    item: createStreamItem("message", {
      data: {
        role: "assistant",
      },
      id: "story-message-waiting-1",
      status: "streaming",
    }),
  },
}
