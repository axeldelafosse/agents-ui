import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  emptyFeedTranscript,
  mixedFeedTranscript,
} from "@axel-delafosse/ui/__fixtures__/stream-items"
import { Feed } from "./feed"

const meta = {
  argTypes: {
    onApprove: { action: "approve" },
    onDeny: { action: "deny" },
    onSubmitInput: { action: "submit-input" },
  },
  args: {
    items: mixedFeedTranscript,
  },
  component: Feed,
  decorators: [
    (Story) => (
      <div className="max-w-4xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Feed",
} satisfies Meta<typeof Feed>

export default meta

type Story = StoryObj<typeof meta>

export const MixedTranscript: Story = {}

export const Empty: Story = {
  args: {
    items: emptyFeedTranscript,
  },
}
