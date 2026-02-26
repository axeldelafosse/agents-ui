import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  streamReviewModeDisabledItem,
  streamReviewModeEnabledItem,
} from "@/components/__fixtures__/stream-items"
import { StreamReviewMode } from "./stream-review-mode"

const meta = {
  args: {
    item: streamReviewModeEnabledItem,
  },
  component: StreamReviewMode,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Stream/StreamReviewMode",
} satisfies Meta<typeof StreamReviewMode>

export default meta

type Story = StoryObj<typeof meta>

export const Enabled: Story = {}

export const Disabled: Story = {
  args: {
    item: streamReviewModeDisabledItem,
  },
}
