import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  streamApprovalCommandItem,
  streamApprovalUserInputItem,
} from "@/components/__fixtures__/stream-items"
import { StreamApprovalRequest } from "./stream-approval-request"

const meta = {
  argTypes: {
    onApprove: { action: "approve" },
    onDeny: { action: "deny" },
    onSubmitInput: { action: "submit-input" },
  },
  args: {
    item: streamApprovalCommandItem,
  },
  component: StreamApprovalRequest,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Stream/StreamApprovalRequest",
} satisfies Meta<typeof StreamApprovalRequest>

export default meta

type Story = StoryObj<typeof meta>

export const CommandApproval: Story = {}

export const UserInputForm: Story = {
  args: {
    item: streamApprovalUserInputItem,
  },
}
