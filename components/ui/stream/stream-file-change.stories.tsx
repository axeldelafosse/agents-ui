import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  createStreamItem,
  streamFileChangeItem,
} from "@/components/__fixtures__/stream-items"
import { StreamFileChange } from "./stream-file-change"

const meta = {
  args: {
    item: streamFileChangeItem,
  },
  component: StreamFileChange,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Stream/StreamFileChange",
} satisfies Meta<typeof StreamFileChange>

export default meta

type Story = StoryObj<typeof meta>

export const AppliedPatch: Story = {}

export const PendingDetails: Story = {
  args: {
    item: createStreamItem("file_change", {
      data: {
        changes: [],
        status: "collecting",
      },
      id: "story-file-change-pending-1",
      status: "streaming",
    }),
  },
}
