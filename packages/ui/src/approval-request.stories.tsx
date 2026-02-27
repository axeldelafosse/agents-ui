import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  streamApprovalCommandItem,
  streamApprovalUserInputItem,
} from "@axel-delafosse/ui/__fixtures__/stream-items"
import { ApprovalRequest } from "./approval-request"

const meta = {
  argTypes: {
    onApprove: { action: "approve" },
    onDeny: { action: "deny" },
    onSubmitInput: { action: "submit-input" },
  },
  args: {
    item: streamApprovalCommandItem,
  },
  component: ApprovalRequest,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/ApprovalRequest",
} satisfies Meta<typeof ApprovalRequest>

export default meta

type Story = StoryObj<typeof meta>

export const CommandApproval: Story = {}

export const UserInputForm: Story = {
  args: {
    item: streamApprovalUserInputItem,
  },
}
