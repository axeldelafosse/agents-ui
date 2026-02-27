import type { Meta, StoryObj } from "@storybook/nextjs"
import { Button } from "./button"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

const meta = {
  component: Tooltip,
  decorators: [
    (Story) => (
      <div className="min-h-36 rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "Components/UI/Tooltip",
} satisfies Meta<typeof Tooltip>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger>
        <Button variant="outline">Hover me</Button>
      </TooltipTrigger>
      <TooltipContent side="top">Status: connected</TooltipContent>
    </Tooltip>
  ),
}

export const RichContent: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger>
        <Button variant="ghost">Action hint</Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-60" side="right">
        Open the panel to inspect stream items, then run a replay.
      </TooltipContent>
    </Tooltip>
  ),
}
