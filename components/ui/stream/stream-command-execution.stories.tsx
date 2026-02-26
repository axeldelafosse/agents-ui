import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  streamCommandExecutionItem,
  streamCommandExecutionStreamingItem,
} from "@/components/__fixtures__/stream-items"
import { StreamCommandExecution } from "./stream-command-execution"

const meta = {
  args: {
    item: streamCommandExecutionItem,
  },
  component: StreamCommandExecution,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Stream/StreamCommandExecution",
} satisfies Meta<typeof StreamCommandExecution>

export default meta

type Story = StoryObj<typeof meta>

export const Complete: Story = {}

export const Streaming: Story = {
  args: {
    item: streamCommandExecutionStreamingItem,
  },
}
