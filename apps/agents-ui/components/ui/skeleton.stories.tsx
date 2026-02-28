import type { Meta, StoryObj } from "@storybook/nextjs"
import { Skeleton } from "./skeleton"

const meta = {
  component: Skeleton,
  decorators: [
    (Story) => (
      <div className="max-w-2xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "Components/UI/Skeleton",
} satisfies Meta<typeof Skeleton>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => <Skeleton className="h-12 w-full rounded-md" />,
}

export const CardPlaceholder: Story = {
  render: () => (
    <div className="space-y-2">
      <Skeleton className="h-4 w-3/5 rounded-md" />
      <Skeleton className="h-3 w-2/5 rounded-md" />
      <Skeleton className="h-3 w-full rounded-md" />
    </div>
  ),
}
