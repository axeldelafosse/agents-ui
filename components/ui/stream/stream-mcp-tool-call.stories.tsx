import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  createStreamItem,
  streamMcpToolCallItem,
} from "@/components/__fixtures__/stream-items"
import { StreamMcpToolCall } from "./stream-mcp-tool-call"

const meta = {
  args: {
    item: streamMcpToolCallItem,
  },
  component: StreamMcpToolCall,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Stream/StreamMcpToolCall",
} satisfies Meta<typeof StreamMcpToolCall>

export default meta

type Story = StoryObj<typeof meta>

export const Complete: Story = {}

export const StreamingProgress: Story = {
  args: {
    item: createStreamItem("mcp_tool_call", {
      data: {
        arguments: {
          project: "agents-ui",
        },
        message: "Resolving MCP connection and preparing request payload...",
        name: "list_issues",
        server: "linear",
      },
      id: "story-mcp-tool-streaming-1",
      status: "streaming",
    }),
  },
}
