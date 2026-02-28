import type { Meta, StoryObj } from "@storybook/nextjs"
import { Separator } from "./separator"

const meta = {
  component: Separator,
  decorators: [
    (Story) => (
      <div className="space-y-4 rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "Components/UI/Separator",
} satisfies Meta<typeof Separator>

export default meta

type Story = StoryObj<typeof meta>

export const Horizontal: Story = {
  render: () => (
    <div className="space-y-3">
      <p className="text-sm">Primary controls</p>
      <Separator />
      <p className="text-sm">Runtime events</p>
      <Separator />
      <p className="text-sm">System status</p>
    </div>
  ),
}

export const Vertical: Story = {
  render: () => (
    <div className="inline-flex items-stretch">
      <div className="px-4 text-sm">Left</div>
      <Separator orientation="vertical" />
      <div className="px-4 text-sm">Middle</div>
      <Separator orientation="vertical" />
      <div className="px-4 text-sm">Right</div>
    </div>
  ),
}
