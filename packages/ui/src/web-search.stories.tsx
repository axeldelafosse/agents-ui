import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  createStreamItem,
  streamWebSearchItem,
} from "@axel-delafosse/ui/__fixtures__/stream-items"
import { WebSearch } from "./web-search"

const meta = {
  args: {
    item: streamWebSearchItem,
  },
  component: WebSearch,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/WebSearch",
} satisfies Meta<typeof WebSearch>

export default meta

type Story = StoryObj<typeof meta>

export const QueryWithAction: Story = {}

export const MinimalPayload: Story = {
  args: {
    item: createStreamItem("web_search", {
      data: {
        item: {
          action: {
            type: "search_query",
          },
          query: "next.js app router storybook",
        },
      },
      id: "story-web-search-minimal-1",
    }),
  },
}
