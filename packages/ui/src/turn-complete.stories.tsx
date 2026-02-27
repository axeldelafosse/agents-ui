import type { Meta, StoryObj } from "@storybook/nextjs"
import { streamTurnCompleteItem } from "@axel-delafosse/ui/__fixtures__/stream-items"
import { TurnComplete } from "./turn-complete"

const meta = {
  args: {
    item: streamTurnCompleteItem,
  },
  component: TurnComplete,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/TurnComplete",
} satisfies Meta<typeof TurnComplete>

export default meta

type Story = StoryObj<typeof meta>

export const ReturnsNull: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "`TurnComplete` currently returns `null`; this story confirms the component has no visual output.",
      },
    },
  },
  render: ({ item }) => {
    const rendered = TurnComplete({ item })

    return (
      <div className="space-y-2 text-sm text-zinc-300">
        <p>
          Direct invocation result:{" "}
          <code className="rounded bg-zinc-900 px-1 py-0.5 text-zinc-100">
            {rendered === null ? "null" : "non-null"}
          </code>
        </p>
        <p className="rounded border border-zinc-800 bg-zinc-900/60 p-2">
          No additional UI should render from <code>TurnComplete</code>.
        </p>
        {rendered}
      </div>
    )
  },
}
