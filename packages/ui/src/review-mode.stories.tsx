import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  streamReviewModeDisabledItem,
  streamReviewModeEnabledItem,
} from "@axel-delafosse/ui/__fixtures__/stream-items"
import { ReviewMode } from "./review-mode"

const meta = {
  args: {
    item: streamReviewModeEnabledItem,
  },
  component: ReviewMode,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/ReviewMode",
} satisfies Meta<typeof ReviewMode>

export default meta

type Story = StoryObj<typeof meta>

export const Enabled: Story = {}

export const Disabled: Story = {
  args: {
    item: streamReviewModeDisabledItem,
  },
}
