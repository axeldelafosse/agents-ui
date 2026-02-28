import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  createStreamItem,
  streamTurnDiffItem,
} from "@axel-delafosse/ui/__fixtures__/stream-items"
import { TurnDiff } from "./turn-diff"

const meta = {
  args: {
    item: streamTurnDiffItem,
  },
  component: TurnDiff,
  decorators: [
    (Story) => (
      <div className="max-w-4xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/TurnDiff",
} satisfies Meta<typeof TurnDiff>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WaitingForPatch: Story = {
  args: {
    item: createStreamItem("turn_diff", {
      data: {
        label: "Turn Diff",
      },
      id: "story-turn-diff-waiting",
      status: "streaming",
      turnId: "turn-002",
    }),
  },
}
