import type { Meta, StoryObj } from "@storybook/nextjs"
import { Shimmer } from "@axel-delafosse/ui/shimmer"

const meta = {
  title: "UI/Shimmer",
  component: Shimmer,
  decorators: [
    (Story) => (
      <div className="dark min-h-36 bg-zinc-950 p-8 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "centered",
    chromatic: { disableSnapshot: true },
  },
  args: {
    children: "Waiting for connected agents",
  },
} satisfies Meta<typeof Shimmer>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const CustomDuration: Story = {
  args: {
    children: "Longer shimmer cycle for subtle feedback",
    duration: 4,
  },
}

export const CustomSpread: Story = {
  args: {
    children: "Wider highlight spread for longer labels",
    spread: 1.8,
  },
}

export const AsHeading: Story = {
  args: {
    as: "h2",
    children: "Agent Dashboard Loading",
    className: "text-2xl font-semibold tracking-tight",
  },
}
