import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  createStreamItem,
  streamStatusItem,
} from "@/components/__fixtures__/stream-items"
import { StreamStatus } from "./stream-status"

const meta = {
  args: {
    item: streamStatusItem,
  },
  component: StreamStatus,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Stream/StreamStatus",
} satisfies Meta<typeof StreamStatus>

export default meta

type Story = StoryObj<typeof meta>

export const Message: Story = {}

export const NestedItemFallback: Story = {
  args: {
    item: createStreamItem("status", {
      data: {
        item: {
          description: "Using nested item fallback message field.",
        },
      },
      id: "story-status-nested-1",
    }),
  },
}
