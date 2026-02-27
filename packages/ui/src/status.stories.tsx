import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  createStreamItem,
  streamStatusItem,
} from "@axel-delafosse/ui/__fixtures__/stream-items"
import { Status } from "./status"

const meta = {
  args: {
    item: streamStatusItem,
  },
  component: Status,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Status",
} satisfies Meta<typeof Status>

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
