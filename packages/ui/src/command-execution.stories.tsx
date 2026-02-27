import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  streamCommandExecutionItem,
  streamCommandExecutionStreamingItem,
} from "@axel-delafosse/ui/__fixtures__/stream-items"
import { CommandExecution } from "./command-execution"

const meta = {
  args: {
    item: streamCommandExecutionItem,
  },
  component: CommandExecution,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/CommandExecution",
} satisfies Meta<typeof CommandExecution>

export default meta

type Story = StoryObj<typeof meta>

export const Complete: Story = {}

export const Streaming: Story = {
  args: {
    item: streamCommandExecutionStreamingItem,
  },
}
