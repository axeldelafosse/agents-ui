import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  createStreamItem,
  streamErrorItem,
} from "@/components/__fixtures__/stream-items"
import { StreamError } from "./stream-error"

const meta = {
  args: {
    item: streamErrorItem,
  },
  component: StreamError,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Stream/StreamError",
} satisfies Meta<typeof StreamError>

export default meta

type Story = StoryObj<typeof meta>

export const Failed: Story = {}

export const StreamingWithDetailsOpen: Story = {
  args: {
    item: createStreamItem("error", {
      data: {
        code: "MCP_TIMEOUT",
        details: {
          elapsedMs: 60_000,
          retries: 2,
        },
        message: "MCP request exceeded the timeout window.",
      },
      id: "story-error-streaming-1",
      status: "streaming",
    }),
  },
}
