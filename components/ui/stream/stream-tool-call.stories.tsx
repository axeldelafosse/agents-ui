import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  createStreamItem,
  streamToolCallItem,
} from "@/components/__fixtures__/stream-items"
import { StreamToolCall } from "./stream-tool-call"

const meta = {
  args: {
    item: streamToolCallItem,
  },
  component: StreamToolCall,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Stream/StreamToolCall",
} satisfies Meta<typeof StreamToolCall>

export default meta

type Story = StoryObj<typeof meta>

export const StructuredArguments: Story = {}

export const PartialJsonStreaming: Story = {
  args: {
    item: createStreamItem("tool_call", {
      data: {
        partial_json:
          '{"command":"bun x ultracite check --changed","cwd":"/workspace"}',
        tool: "Bash",
      },
      id: "story-tool-call-partial-json-1",
      status: "streaming",
    }),
  },
}
