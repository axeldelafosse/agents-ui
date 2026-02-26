import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  createStreamItem,
  streamRawItem,
} from "@/components/__fixtures__/stream-items"
import { StreamRawItem } from "./stream-raw-item"

const meta = {
  args: {
    item: streamRawItem,
  },
  component: StreamRawItem,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Stream/StreamRawItem",
} satisfies Meta<typeof StreamRawItem>

export default meta

type Story = StoryObj<typeof meta>

export const CustomEvent: Story = {}

export const MinimalPayload: Story = {
  args: {
    item: createStreamItem("raw_item", {
      data: {
        event: "item/minimal",
        payload: {
          ok: true,
        },
      },
      id: "story-raw-item-minimal-1",
    }),
  },
}
