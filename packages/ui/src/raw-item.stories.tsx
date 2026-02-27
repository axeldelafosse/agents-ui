import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  createStreamItem,
  streamRawItem,
} from "@axel-delafosse/ui/__fixtures__/stream-items"
import { RawItem } from "./raw-item"

const meta = {
  args: {
    item: streamRawItem,
  },
  component: RawItem,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/RawItem",
} satisfies Meta<typeof RawItem>

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
