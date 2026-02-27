import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  streamToolResultErrorItem,
  streamToolResultItem,
} from "@axel-delafosse/ui/__fixtures__/stream-items"
import { ToolResult } from "./tool-result"

const meta = {
  args: {
    item: streamToolResultItem,
  },
  component: ToolResult,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/ToolResult",
} satisfies Meta<typeof ToolResult>

export default meta

type Story = StoryObj<typeof meta>

export const Success: Story = {}

export const ErrorResult: Story = {
  args: {
    item: streamToolResultErrorItem,
  },
}
