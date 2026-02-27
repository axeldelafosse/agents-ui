import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  createStreamItem,
  streamErrorItem,
} from "@axel-delafosse/ui/__fixtures__/stream-items"
import { Error } from "./error"

const meta = {
  args: {
    item: streamErrorItem,
  },
  component: Error,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Error",
} satisfies Meta<typeof Error>

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
