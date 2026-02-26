import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  streamToolResultErrorItem,
  streamToolResultItem,
} from "@/components/__fixtures__/stream-items"
import { StreamToolResult } from "./stream-tool-result"

const meta = {
  args: {
    item: streamToolResultItem,
  },
  component: StreamToolResult,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Stream/StreamToolResult",
} satisfies Meta<typeof StreamToolResult>

export default meta

type Story = StoryObj<typeof meta>

export const Success: Story = {}

export const ErrorResult: Story = {
  args: {
    item: streamToolResultErrorItem,
  },
}
